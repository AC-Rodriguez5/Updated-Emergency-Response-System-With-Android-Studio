import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  eventId:{type:String,required:true,unique:true},
  accountId:{type:String,required:true,index:true}, role:{type:String,enum:['user','responder'],required:true},
  decision:{type:String,enum:['approved','rejected'],required:true},
  token:{type:String,required:true,select:false}, deviceId:{type:String,select:false}, platform:{type:String,enum:['android'],default:'android'},
  status:{type:String,enum:['pending','processing','sent','failed','suppressed'],default:'pending'},
  attempts:{type:Number,default:0}, nextAttemptAt:{type:Date,default:Date.now}, lockedUntil:Date,
  lastError:String, sentAt:Date,
  createdAt:{type:Date,default:Date.now,expires:30*24*60*60},
});
schema.index({status:1,nextAttemptAt:1});
export default mongoose.models.RegistrationNotificationJob || mongoose.model('RegistrationNotificationJob',schema);
