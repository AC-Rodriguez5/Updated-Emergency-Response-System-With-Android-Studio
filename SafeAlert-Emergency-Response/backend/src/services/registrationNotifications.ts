import { applicationDefault,getApps,initializeApp } from 'firebase-admin/app';
import { createHash } from 'node:crypto';
import { getMessaging,type Message } from 'firebase-admin/messaging';
import type { ClientSession } from 'mongoose';
import RegistrationNotificationJob from '../models/RegistrationNotificationJob.ts';
import { accountModel } from './identity.ts';

export async function enqueueRegistrationPush(account:any,role:'user'|'responder',decision:'approved'|'rejected',session:ClientSession) {
  if (!account.pushToken) return;
  const accountId=String(account._id);
  const eventId='registration_'+createHash('sha256').update(role+':'+accountId+':'+decision).digest('hex');
  await RegistrationNotificationJob.updateOne({eventId},{$setOnInsert:{eventId,accountId,role,decision,token:account.pushToken,deviceId:account.registrationPushDeviceId,platform:account.registrationPushPlatform||'android'}},{upsert:true,session});
}
export type RegistrationPushSender = (message:Message)=>Promise<string>;

// Root's existing worker invokes this alongside emergency delivery. Inject sender only in isolated tests.
export async function deliverRegistrationPush(sender?:RegistrationPushSender):Promise<void> {
  if (process.env.FCM_ENABLED!=='true') return;
  const job=await RegistrationNotificationJob.findOneAndUpdate({$or:[{status:'pending',nextAttemptAt:{$lte:new Date()}},{status:'processing',lockedUntil:{$lt:new Date()}}]},{$set:{status:'processing',lockedUntil:new Date(Date.now()+60000)},$inc:{attempts:1}},{new:true,sort:{nextAttemptAt:1}}).select('+token');
  if(!job)return;
  try {
    const account=await accountModel(job.role).findById(job.accountId).select('+pushToken');
    if(!account || account.status!==job.decision || account.pushToken!==job.token){
      await RegistrationNotificationJob.updateOne({_id:job._id},{$set:{status:'suppressed'},$unset:{token:1,lockedUntil:1}});
      return;
    }
    const message:Message={token:job.token,
      notification:{title:'SafeAlert registration update',body:'Your registration review is complete. Open SafeAlert to continue.'},
      data:{event:'registration.reviewed',route:'login',role:job.role,eventId:job.eventId},
      android:{priority:'high',notification:{channelId:'safealert_emergencies',tag:job.eventId}},
    };
    if(!sender){
      if(!getApps().length)initializeApp({credential:applicationDefault()});
      sender=(payload)=>getMessaging().send(payload);
    }
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try {
      await Promise.race([sender(message),new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('PUSH_TIMEOUT')),10000);timeout.unref();})]);
    } finally { if(timeout)clearTimeout(timeout); }
    await RegistrationNotificationJob.updateOne({_id:job._id},{$set:{status:'sent',sentAt:new Date()},$unset:{token:1,lockedUntil:1,lastError:1}});
    await accountModel(job.role).updateOne({_id:job.accountId,pushToken:job.token},{$unset:{pushToken:1,registrationPushDeviceId:1,registrationPushPlatform:1}});
  } catch(error:unknown) {
    const code=(error as {code?:string})?.code;
    const permanent=code==='messaging/registration-token-not-registered'||code==='messaging/invalid-registration-token';
    const failed=permanent||job.attempts>=10;
    await RegistrationNotificationJob.updateOne({_id:job._id},{$set:{status:failed?'failed':'pending',lastError:permanent?'Registration notification token is unavailable.':'Registration notification delivery failed. Check the provider and worker health.',nextAttemptAt:new Date(Date.now()+Math.min(3600000,1000*2**job.attempts))},$unset:{lockedUntil:1,...(failed?{token:1}:{})}});
    if(permanent)await accountModel(job.role).updateOne({_id:job.accountId,pushToken:job.token},{$unset:{pushToken:1,registrationPushDeviceId:1,registrationPushPlatform:1}});
  }
}
