import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Types, type QueryFilter } from 'mongoose';
import { z } from 'zod';
import Emergency, { type EmergencyRecord } from '../models/Emergency.ts';
import User from '../models/User.ts';
import Responder from '../models/Responder.ts';
import BleDevice from '../models/BleDevice.ts';
import type { AuthPayload } from '../middleware/authMiddleware.ts';
import { ApiError, activeStatuses, emergencyTypes, locationSchema, objectId, validateFreshLocation } from '../shared/http.ts';
import { drainEmergencyOutbox } from './notifications.ts';

export const createSchema = z.object({ type: z.enum(emergencyTypes), source: z.enum(['mobile_app','iot_ble']), location: locationSchema, notes: z.string().trim().max(500).optional(), bleEventId: z.string().trim().min(1).max(180).optional(), deviceId: z.string().trim().min(1).max(100).optional() }).strict();
type EmergencyType = typeof emergencyTypes[number];
type AgencyType = 'police'|'fire'|'medical'|'rescue'|'other';
export function agencyTypesForEmergency(type: string): AgencyType[] {
  if(type==='general_sos')return ['police','fire','medical','rescue','other'];
  return type==='crime'?['police','rescue']:type==='fire'?['fire','rescue']:['medical','rescue'];
}
export function emergencyTypesForAgency(agency: string): EmergencyType[] {
  if(agency==='rescue')return [...emergencyTypes];
  return agency==='police'?['crime','general_sos']:agency==='fire'?['fire','general_sos']:agency==='medical'?['medical','general_sos']:['general_sos'];
}
export async function responderScope(actor: AuthPayload): Promise<QueryFilter<EmergencyRecord>> {
  const responder = await Responder.findById(actor.userId);
  if (!responder) throw new ApiError(403,'FORBIDDEN','Responder account is unavailable.');
  return { $or: [{ assignedResponderId: actor.userId }, { status: 'pending', coverageArea: responder.coverageArea, type: { $in: emergencyTypesForAgency(responder.agencyType) }, ...(responder.isOnDuty ? {} : { _id: { $exists: false } }) }] };
}
export async function accessibleEmergency(id: string, actor: AuthPayload, assignedOnly = false) {
  objectId.parse(id);
  const scope = actor.role === 'admin' ? {} : actor.role === 'user' ? { userId: actor.userId } : assignedOnly ? { assignedResponderId: actor.userId } : await responderScope(actor);
  const emergency = await Emergency.findOne({ _id: id, ...scope });
  if (!emergency) throw new ApiError(404,'NOT_FOUND','Emergency not found or not available to your account.');
  return emergency;
}
export function timelineEvent(actor: AuthPayload, name: string, from: string | undefined, to: string, reason?: string) {
  return { id: randomUUID(), name, from, to, at: new Date(), actorId: actor.userId, actorRole: actor.role, reason };
}
export async function emergencyDto(emergency: InstanceType<typeof Emergency>) {
  const data = emergency.toObject();
  const [user, responder] = await Promise.all([
    User.findById(data.userId).select('name phone coverageArea').lean(),
    data.assignedResponderId ? Responder.findById(data.assignedResponderId).select('name phone departmentName agencyType').lean() : null,
  ]);
  const { _id, __v, outbox, requestHash, idempotencyKey, currentLocation, ...safe } = data;
  return { ...safe, id: String(_id), userId: String(data.userId), assignedResponderId: data.assignedResponderId ? String(data.assignedResponderId) : undefined,
    user: user ? { id: String(user._id), name: user.name, phone: user.phone, coverageArea: user.coverageArea } : undefined,
    responder: responder ? { id: String(responder._id), name: responder.name, phone: responder.phone, agencyType: responder.agencyType, departmentName: responder.departmentName } : undefined };
}
export async function createEmergency(req: Request) {
  const actor = req.user!;
  const body = createSchema.parse(req.body);
  const key = z.string().min(8).max(200).parse(req.get('Idempotency-Key'));
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const keyFilter = body.source === 'iot_ble' && body.bleEventId ? { userId: actor.userId, $or: [{idempotencyKey:key},{deviceId:body.deviceId,bleEventId:body.bleEventId}] } : { userId: actor.userId, idempotencyKey: key };
  const replay = async () => {
    const existing = await Emergency.findOne(keyFilter);
    if (existing && existing.requestHash !== hash && existing.idempotencyKey === key) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','This retry key already belongs to a different request.');
    return existing;
  };
  // A successful receipt remains retrievable even when the original GPS fix is now old.
  const existing = await replay();
  if (existing) return { emergency: existing, created: false };
  validateFreshLocation(body.location);
  const user = await User.findById(actor.userId);
  if (!user?.coverageArea) throw new ApiError(409,'PROFILE_INCOMPLETE','Your account needs a coverage area before reporting an emergency.');
  if (body.source === 'iot_ble') {
    if (!body.deviceId || !body.bleEventId) throw new ApiError(400,'BLE_EVENT_REQUIRED','A paired device and event ID are required.');
    const device = await BleDevice.findOne({ deviceId: body.deviceId, userId: actor.userId, status: { $ne: 'unpaired' } });
    if (!device) throw new ApiError(403,'DEVICE_NOT_PAIRED','Pair this panic button with your account first.');
    await BleDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } });
  } else if (body.deviceId || body.bleEventId) throw new ApiError(400,'INVALID_SOURCE','Device event fields require the IoT source.');
  const event = timelineEvent(actor,'emergency.created',undefined,'pending');
  try {
    const emergency = await Emergency.create({ ...body, userId: actor.userId, coverageArea: user.coverageArea, currentLocation: { type: 'Point', coordinates: [body.location.lng,body.location.lat] }, idempotencyKey:key,requestHash:hash,timeline:[event],outbox:[event] });
    void drainEmergencyOutbox(String(emergency._id)).catch(() => undefined);
    return { emergency, created: true };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) { const duplicate = await replay(); if (duplicate) return { emergency:duplicate,created:false }; }
    throw error;
  }
}
export async function transition(id: string, actor: AuthPayload, allowed: readonly string[], nextStatus: string, options: { reason?: string; update?: Record<string,unknown>; assignedOnly?: boolean } = {}) {
  const current = await accessibleEmergency(id,actor,options.assignedOnly);
  if (!allowed.includes(current.status)) throw new ApiError(409,'INVALID_TRANSITION','The emergency changed. Refresh it before taking this action.');
  const event = timelineEvent(actor, nextStatus === 'assigned' ? 'emergency.assigned' : `emergency.${nextStatus}`, current.status,nextStatus,options.reason);
  const updated = await Emergency.findOneAndUpdate({ _id: id, status: current.status, ...(actor.role === 'responder' && options.assignedOnly ? {assignedResponderId:actor.userId} : {}) }, { $set: { status:nextStatus,...options.update }, $push: { timeline:event,outbox:event } }, { returnDocument:'after',runValidators:true });
  if (!updated) throw new ApiError(409,'STATE_CONFLICT','Another action updated this emergency. Refresh and try again.');
  void drainEmergencyOutbox(id).catch(() => undefined);
  return updated;
}
export async function assign(id:string,actor:AuthPayload) {
  objectId.parse(id);
  const responder = await Responder.findById(actor.userId);
  if (!responder?.isOnDuty) throw new ApiError(409,'OFF_DUTY','Go on duty before accepting an emergency.');
  const current=await Emergency.findOne({_id:id,coverageArea:responder.coverageArea,type:{$in:emergencyTypesForAgency(responder.agencyType)}});
  if(!current)throw new ApiError(404,'NOT_FOUND','Emergency is outside your assigned coverage.');
  const event=timelineEvent(actor,'emergency.assigned','pending','assigned');
  const updated=await Emergency.findOneAndUpdate({_id:id,status:'pending',assignedResponderId:{$exists:false}},{$set:{status:'assigned',assignedResponderId:new Types.ObjectId(actor.userId),assignedAt:new Date()},$push:{timeline:event,outbox:event}},{returnDocument:'after',runValidators:true});
  if(!updated)throw new ApiError(409,'STATE_CONFLICT','Another responder accepted this emergency or its status changed.');
  void drainEmergencyOutbox(id).catch(()=>undefined);return updated;
}
export { activeStatuses };
