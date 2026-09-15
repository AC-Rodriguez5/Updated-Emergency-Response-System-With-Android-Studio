import type { Request, Response } from 'express';
import { z } from 'zod';
import Emergency from '../models/Emergency.ts';
import LocationSample from '../models/LocationSample.ts';
import ResponderPosition from '../models/ResponderPosition.ts';
import Responder from '../models/Responder.ts';
import UploadedFile from '../models/UploadedFile.ts';
import { createEmergency as create, emergencyDto, accessibleEmergency, responderScope, assign, transition, timelineEvent } from '../services/emergencies.ts';
import { ApiError, activeStatuses, emergencyTypes, statuses, handler, locationSchema, objectId, pageQuery, success, validateFreshLocation, distanceMeters } from '../shared/http.ts';
import { emitToRooms } from '../config/socket.ts';
import { drainEmergencyOutbox } from '../services/notifications.ts';

export const createEmergency = handler(async(req,res)=>{const result=await create(req);return success(res,await emergencyDto(result.emergency),result.created?201:200);});
export const getEmergency = handler(async(req,res)=>success(res,await emergencyDto(await accessibleEmergency(req.params.id,req.user!))));
export const getActiveEmergencies = handler(async(req,res)=>{
  const {page,limit}=pageQuery(req);
  const type=req.query.type?z.enum(emergencyTypes).parse(req.query.type):undefined;
  const status=req.query.status?z.enum(statuses).refine(s=>activeStatuses.includes(s),'Choose an active status').parse(req.query.status):undefined;
  const q=z.string().trim().max(100).optional().parse(req.query.q)?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const scope=req.user!.role==='admin'?{}:await responderScope(req.user!);
  const filter={$and:[scope,{status:status||{$in:activeStatuses},...(type?{type}:{}),...(q?{$or:[{notes:{$regex:q,$options:'i'}},{coverageArea:{$regex:q,$options:'i'}},...(/^[a-f\d]{24}$/i.test(q)?[{_id:q}]:[])]}:{})}]};
  const [rows,total]=await Promise.all([Emergency.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),Emergency.countDocuments(filter)]);
  return success(res,await Promise.all(rows.map(emergencyDto)),200,{page,limit,total});
});
export const myEmergencies=handler(async(req,res)=>{
  const {page,limit}=pageQuery(req);const filter={userId:req.user!.userId};
  const [rows,total]=await Promise.all([Emergency.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),Emergency.countDocuments(filter)]);
  return success(res,await Promise.all(rows.map(emergencyDto)),200,{page,limit,total});
});
export const claimEmergency=handler(async(req,res)=>success(res,await emergencyDto(await assign(req.params.id,req.user!))));
export const markOnTheWay=handler(async(req,res)=>success(res,await emergencyDto(await transition(req.params.id,req.user!,['assigned'],'responder_on_the_way',{assignedOnly:true,update:{responderOnTheWayAt:new Date()}}))));
export const submitReport=handler(async(req,res)=>{
  const report=z.object({arrivalTimestamp:z.string().datetime(),situationNotes:z.string().trim().min(1).max(2000),actionTaken:z.string().trim().min(1).max(2000),photoIds:z.array(objectId).max(5).default([])}).strict().parse(req.body);
  if(Date.parse(report.arrivalTimestamp)>Date.now()+30000)throw new ApiError(400,'INVALID_REPORT','Arrival time cannot be in the future.');
  // Photo evidence is optional; accept only owned response-upload IDs when that flow is enabled.
  if(report.photoIds.length&&await UploadedFile.countDocuments({_id:{$in:report.photoIds},ownerId:req.user!.userId,purpose:'response_photo',emergencyId:req.params.id})!==new Set(report.photoIds).size)throw new ApiError(403,'INVALID_EVIDENCE','Response photos must belong to this responder and emergency.');
  return success(res,await emergencyDto(await transition(req.params.id,req.user!,['responder_nearby'],'responder_report_submitted',{assignedOnly:true,update:{report,reportSubmittedAt:new Date()}})));
});
export const cancelEmergency=handler(async(req,res)=>{
  const body=z.object({reason:z.string().trim().max(500).optional()}).strict().parse(req.body);
  return success(res,await emergencyDto(await transition(req.params.id,req.user!,['pending'],'cancelled',{reason:body.reason,update:{cancellationReason:body.reason}})));
});
export const adminTransition=(status:'resolved'|'cancelled'|'false_alarm')=>handler(async(req,res)=>{
  const {reason}=z.object({reason:z.string().trim().max(1000).optional()}).strict().parse(req.body);
  const current=await accessibleEmergency(req.params.id,req.user!);
  if((status!=='resolved'||current.status!=='responder_report_submitted')&&(!reason||reason.length<10))throw new ApiError(400,'REASON_REQUIRED','Provide a reason of at least 10 characters for this override.');
  const update=status==='resolved'?{resolvedAt:new Date(),resolvedByAdminId:req.user!.userId,resolutionNotes:reason}:{cancellationReason:reason};
  return success(res,await emergencyDto(await transition(req.params.id,req.user!,activeStatuses,status,{reason,update})));
});
export const locationHistory=handler(async(req,res)=>{
  await accessibleEmergency(req.params.id,req.user!,req.user!.role==='responder');
  const rows=await LocationSample.find({emergencyId:req.params.id}).sort({capturedAt:-1}).limit(100).lean();
  return success(res,rows.map(({_id,__v,...row})=>({...row,id:String(_id)})));
});
export const logLocation=handler(async(req:Request,res:Response)=>{
  const {emergencyId,...location}=locationSchema.extend({emergencyId:objectId.optional()}).parse(req.body);
  validateFreshLocation(location);
  const actor=req.user!;const capturedAt=new Date(location.capturedAt);
  if(actor.role==='admin')throw new ApiError(403,'FORBIDDEN','Only users and responders share emergency locations.');
  if(actor.role==='user'&&!emergencyId)throw new ApiError(400,'EMERGENCY_REQUIRED','An active emergency is required to share your location.');
  let emergency=emergencyId?await accessibleEmergency(emergencyId,actor,actor.role==='responder'):null;
  if(emergency&&!activeStatuses.includes(emergency.status))throw new ApiError(409,'EMERGENCY_CLOSED','Location sharing has ended for this emergency.');
  if(actor.role==='responder') {
    const responder=await Responder.findById(actor.userId);
    if(!responder?.isOnDuty&&!emergency)throw new ApiError(409,'OFF_DUTY','Go on duty to share your location.');
    const current=await ResponderPosition.findOne({responderId:actor.userId});
    if(current&&current.location.capturedAt>=capturedAt)return success(res,{accepted:false,reason:'out_of_order'});
    if(current)checkMovement(current.location,location);
    try { await ResponderPosition.findOneAndUpdate({responderId:actor.userId,$or:[{'location.capturedAt':{$lt:capturedAt}},{'location.capturedAt':{$exists:false}}]},{$set:{location,lastSeenAt:new Date()}},{upsert:!current}); }
    catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code===11000))throw error;}
  }
  if(emergency) {
    const field=actor.role==='user'?'location':'responderLocation';
    const previous=actor.role==='user'?emergency.location:emergency.responderLocation;
    if(previous&&previous.capturedAt>=capturedAt)return success(res,{accepted:false,reason:'out_of_order'});
    if(previous)checkMovement(previous,location);
    const changed=await Emergency.findOneAndUpdate({_id:emergency._id,status:{$in:activeStatuses},$or:[{[`${field}.capturedAt`]:{$lt:capturedAt}},{[field]:{$exists:false}}]},{$set:{[field]:location,...(actor.role==='user'?{currentLocation:{type:'Point',coordinates:[location.lng,location.lat]}}:{})}},{returnDocument:'after'});
    if(!changed)throw new ApiError(409,'LOCATION_CONFLICT','Emergency state changed. Refresh before sharing location again.');
    emergency=changed;
    if(actor.role==='responder'&&emergency.status==='responder_on_the_way'&&location.accuracyMeters<=100&&Date.now()-emergency.location.capturedAt.getTime()<=60000&&distanceMeters(location,emergency.location)<=100) {
      const event={...timelineEvent(actor,'emergency.responder_nearby','responder_on_the_way','responder_nearby'),actorRole:'system'};
      await Emergency.updateOne({_id:emergency._id,status:'responder_on_the_way'},{$set:{status:'responder_nearby',responderNearbyAt:new Date()},$push:{timeline:event,outbox:event}});
      void drainEmergencyOutbox(String(emergency._id)).catch(()=>undefined);
    }
  }
  try { await LocationSample.create({emergencyId,actorId:actor.userId,actorType:actor.role,location,capturedAt}); }
  catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code===11000))throw error;}
  await emitToRooms(['admin:live',...(emergency?[`user:${emergency.userId}`,`responder:${emergency.assignedResponderId}`]:[])],actor.role==='user'?'location.user_updated':'location.responder_updated',{emergencyId,actorId:actor.userId});
  return success(res,{accepted:true},201);
});
export const liveResponders=handler(async(req,res)=>{
  const responders=await Responder.find({status:'approved',isOnDuty:true}).select('name agencyType departmentName isOnDuty').limit(1000).lean();
  const positions=await ResponderPosition.find({responderId:{$in:responders.map(r=>String(r._id))}}).lean();
  const byId=new Map(positions.map(p=>[p.responderId,p]));
  return success(res,responders.map(r=>({id:String(r._id),name:r.name,agencyType:r.agencyType,departmentName:r.departmentName,isOnDuty:r.isOnDuty,location:byId.get(String(r._id))?.location,lastSeenAt:byId.get(String(r._id))?.lastSeenAt})));
});
export const setDuty=handler(async(req,res)=>{
  const body=z.object({isOnDuty:z.boolean()}).strict().parse(req.body);
  if(!body.isOnDuty&&await Emergency.exists({assignedResponderId:req.user!.userId,status:{$in:['assigned','responder_on_the_way','responder_nearby']}}))throw new ApiError(409,'ACTIVE_ASSIGNMENT','Complete the active response before going off duty.');
  await Responder.updateOne({_id:req.user!.userId},{$set:body});
  return success(res,body);
});
function checkMovement(previous:{lat:number;lng:number;accuracyMeters:number;capturedAt:Date},next:{lat:number;lng:number;accuracyMeters:number;capturedAt:string}){
  const seconds=(Date.parse(next.capturedAt)-previous.capturedAt.getTime())/1000;
  if(seconds>0&&distanceMeters(previous,next)>Math.max(100,seconds*100+previous.accuracyMeters+next.accuracyMeters))throw new ApiError(400,'IMPLAUSIBLE_LOCATION','Location changed too quickly. Acquire a new GPS fix.');
}
