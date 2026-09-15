import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import Emergency from '../models/Emergency.ts';
import NotificationJob from '../models/NotificationJob.ts';
import PushDevice from '../models/PushDevice.ts';
import { AuthSession } from '../models/RefreshToken.ts';
import AuditLog from '../models/AuditLog.ts';
import Responder from '../models/Responder.ts';
import User from '../models/User.ts';
import { emitToRooms } from '../config/socket.ts';
import { agencyTypesForEmergency } from './emergencies.ts';
import { deliverRegistrationPush } from './registrationNotifications.ts';

export const pushConfigured = () => process.env.FCM_ENABLED === 'true';
export async function drainEmergencyOutbox(id?: string) {
  const emergencies = await Emergency.find({ ...(id?{_id:id}:{}), 'outbox.0':{$exists:true} }).select('+outbox').limit(100);
  for (const emergency of emergencies) {
    for (const event of emergency.outbox) {
      await NotificationJob.updateOne({eventId:event.id},{$setOnInsert:{eventId:event.id,emergencyId:String(emergency._id),event:event.name}},{upsert:true});
      await AuditLog.updateOne({_id:new Types.ObjectId(createHash('sha256').update(event.id).digest('hex').slice(0,24))},{$setOnInsert:{actorId:event.actorId,actorRole:event.actorRole,action:event.name,targetId:String(emergency._id),targetType:'emergency',reason:event.reason,details:{from:event.from,to:event.to,eventId:event.id},createdAt:event.at}},{upsert:true});
      await emitToRooms(['admin:live',`user:${emergency.userId}`,`responder:${emergency.assignedResponderId}`],event.name,{id:String(emergency._id),emergencyId:String(emergency._id),status:event.to,eventId:event.id});
      // Other eligible responders only need to refresh their claimable list; assigned details stay private.
      await emitToRooms(agencyTypesForEmergency(emergency.type).map(agency=>`agency:${agency}:${emergency.coverageArea}`),'emergency.updated',{refresh:true});
      await Emergency.updateOne({_id:emergency._id},{$pull:{outbox:{id:event.id}}});
    }
  }
}
export async function deliverPendingPush() {
  if (!pushConfigured()) return;
  if (!getApps().length) initializeApp({credential:applicationDefault()});
  // A lease allows a crashed worker to recover jobs without hiding them permanently.
  const job = await NotificationJob.findOneAndUpdate({$or:[{status:'pending',nextAttemptAt:{$lte:new Date()}},{status:'processing',lockedUntil:{$lt:new Date()}}]},{$set:{status:'processing',lockedUntil:new Date(Date.now()+60000)},$inc:{attempts:1}},{returnDocument:'after',sort:{nextAttemptAt:1}});
  if (!job) return;
  try {
    const emergency = await Emergency.findById(job.emergencyId);
    if (!emergency) { await NotificationJob.updateOne({_id:job._id},{$set:{status:'sent'}}); return; }
    const accounts = new Set<string>();
    const user = await User.findOne({_id:emergency.userId,status:'approved'});
    if (user) accounts.add(String(user._id));
    if (emergency.assignedResponderId && await Responder.exists({_id:emergency.assignedResponderId,status:'approved'})) accounts.add(String(emergency.assignedResponderId));
    if (job.event === 'emergency.created' && emergency.status === 'pending') {
      const responders = await Responder.find({status:'approved',isOnDuty:true,coverageArea:emergency.coverageArea,agencyType:{$in:agencyTypesForEmergency(emergency.type)}}).select('_id');
      for (const responder of responders) accounts.add(String(responder._id));
    }
    const sessions=await AuthSession.find({accountId:{$in:[...accounts]},revokedAt:{$exists:false},expiresAt:{$gt:new Date()}}).select('_id').lean();
    const devices = await PushDevice.find({accountId:{$in:[...accounts]},sessionId:{$in:sessions.map(s=>s._id)},_id:{$nin:job.deliveredDeviceIds}}).select('+token');
    for (let offset=0;offset<devices.length;offset+=500) {
      const batch=devices.slice(offset,offset+500);
      const result=await getMessaging().sendEachForMulticast({tokens:batch.map(d=>d.token),notification:{title:'SafeAlert emergency update',body:'Open SafeAlert to view the latest status.'},data:{emergencyId:job.emergencyId,event:job.event,eventId:job.eventId},android:{priority:'high',notification:{channelId:'safealert_emergencies',tag:job.emergencyId}}});
      let retry=false;
      for(let i=0;i<result.responses.length;i++) {
        const response=result.responses[i];
        if(response.success) await NotificationJob.updateOne({_id:job._id},{$addToSet:{deliveredDeviceIds:String(batch[i]._id)}});
        else if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(response.error?.code || '')) await PushDevice.deleteOne({_id:batch[i]._id});
        else retry=true;
      }
      if(retry) throw new Error('PUSH_TRANSIENT_FAILURE');
    }
    await NotificationJob.updateOne({_id:job._id},{$set:{status:'sent'},$unset:{lockedUntil:1,lastError:1}});
  } catch {
    await NotificationJob.updateOne({_id:job._id},{$set:{status:job.attempts>=10?'failed':'pending',lastError:'Push delivery failed; check provider credentials and worker logs.',nextAttemptAt:new Date(Date.now()+Math.min(3600000,1000*2**job.attempts))},$unset:{lockedUntil:1}});
  }
}
export function startNotificationWorker() {
  let running=false;
  const timer=setInterval(()=>{
    if(running)return;
    running=true;
    void (async()=>{await drainEmergencyOutbox();await deliverPendingPush();await deliverRegistrationPush();})().catch(()=>console.error(JSON.stringify({level:'error',event:'notification_worker_failed'}))).finally(()=>{running=false;});
  },1000);
  timer.unref(); return ()=>clearInterval(timer);
}
