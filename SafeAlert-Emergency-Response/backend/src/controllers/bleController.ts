import { z } from 'zod';
import BleDevice from '../models/BleDevice.ts';
import { ApiError,handler,success,objectId } from '../shared/http.ts';
import { recordAudit } from '../services/audit.ts';
export const getMyDevices=handler(async(req,res)=>{
  const devices=await BleDevice.find({userId:req.user!.userId,status:{$ne:'unpaired'}}).lean();
  return success(res,devices.map(({_id,__v,...device})=>({...device,id:String(_id)})));
});
export const pairDevice=handler(async(req,res)=>{
  const body=z.object({deviceId:z.string().regex(/^SA-ESP32-[A-Za-z0-9-]{4,80}$/),deviceName:z.string().trim().min(1).max(100),firmwareVersion:z.string().max(40).optional()}).strict().parse(req.body);
  const existing=await BleDevice.findOne({deviceId:body.deviceId});
  // Unpairing disables delivery, but never silently transfers ownership to another account.
  if(existing&&String(existing.userId)!==req.user!.userId)throw new ApiError(409,'DEVICE_ALREADY_BOUND','This panic button belongs to another account. Contact an administrator to verify ownership.');
  try{
    const device=await BleDevice.findOneAndUpdate({deviceId:body.deviceId,userId:req.user!.userId},{$set:{...body,status:'active',lastPairedAt:new Date(),lastSeenAt:new Date()},$setOnInsert:{userId:req.user!.userId}},{upsert:true,returnDocument:'after',runValidators:true});
    await recordAudit({actorId:req.user!.userId,actorRole:'user',action:'ble.paired',targetType:'ble_device',targetId:String(device!._id)});
    return success(res,{id:String(device!._id),...body,status:'active'},201);
  }catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code===11000)throw new ApiError(409,'DEVICE_ALREADY_BOUND','This device was paired by another request. Refresh the device list.');throw error;}
});
export const unpairDevice=handler(async(req,res)=>{
  objectId.parse(req.params.id);
  const device=await BleDevice.findOneAndUpdate({_id:req.params.id,userId:req.user!.userId},{$set:{status:'unpaired'}},{returnDocument:'after'});
  if(!device)throw new ApiError(404,'NOT_FOUND','Panic button not found.');
  await recordAudit({actorId:req.user!.userId,actorRole:'user',action:'ble.unpaired',targetType:'ble_device',targetId:String(device._id)});
  return success(res,{id:String(device._id),status:'unpaired'});
});
