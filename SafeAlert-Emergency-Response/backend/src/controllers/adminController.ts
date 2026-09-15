import { z } from 'zod';
import mongoose from 'mongoose';
import { asyncHandler, accountModel, objectIdSchema, safeText, safeAccount, httpError } from '../services/identity.ts';
import { recordAudit } from '../services/audit.ts';
import { emitRegistration } from '../config/socket.ts';
import { AuthSession } from '../models/RefreshToken.ts';
import { enqueueRegistrationPush } from '../services/registrationNotifications.ts';
import UploadedFile from '../models/UploadedFile.ts';

const listSchema = z.object({
  type:z.enum(['user','responder']).default('user'),
  status:z.enum(['pending','approved','rejected','suspended']).default('pending'),
  page:z.coerce.number().int().min(1).max(100000).default(1),
  limit:z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const getPendingRegistrations = asyncHandler(async (req,res) => {
  const {type,status,page,limit} = listSchema.parse(req.query);
  const model = accountModel(type);
  const [records,total] = await Promise.all([
    model.find({status}).sort({createdAt:1,_id:1}).skip((page-1)*limit).limit(limit),
    model.countDocuments({status}),
  ]);
  res.json({data:records.map((item:any)=>({...safeAccount(item,type),type})),meta:{page,limit,total},requestId:req.id});
});
export const getRegistration = asyncHandler(async (req,res) => {
  const id=objectIdSchema.parse(req.params.id);
  const {type}=z.object({type:z.enum(['user','responder'])}).strict().parse(req.query);
  const record=await accountModel(type).findById(id);
  if(!record)throw httpError(404,'NOT_FOUND','Registration not found.');
  res.json({data:{...safeAccount(record,type),type},requestId:req.id});
});
const reviewSchema = z.object({type:z.enum(['user','responder']),reason:safeText(0,1000).optional()}).strict();
const review = (status: 'approved'|'rejected') => asyncHandler(async (req,res) => {
  const id = objectIdSchema.parse(req.params.id);
  const {type,reason} = reviewSchema.parse(req.body);
  const model = accountModel(type);
  let record: any;
  await mongoose.connection.transaction(async transaction => {
    if(status==='approved'){
      const applicant=await model.findById(id).session(transaction);
      if(!applicant)throw httpError(404,'NOT_FOUND','Registration not found.');
      const required=type==='responder'?['proofOfResidencyId','faceCaptureId','credentialId']:['proofOfResidencyId','faceCaptureId'];
      const ids=required.map(field=>applicant.get(field)).filter(Boolean);
      if(ids.length!==required.length||await UploadedFile.countDocuments({_id:{$in:ids},ownerId:id}).session(transaction)!==required.length)throw httpError(409,'EVIDENCE_REQUIRED','Required registration evidence is missing. Ask the applicant to resubmit before approval.');
    }
    record = await model.findOneAndUpdate({_id:id,status:'pending'},{
      $set:{status,reviewedAt:new Date(),reviewedBy:req.user!.userId,...(status==='rejected'?{rejectionReason:reason||'Registration rejected by administrator.'}:{})},
      ...(status==='approved'?{$unset:{rejectionReason:1}}:{}),
    },{new:true,runValidators:true,session:transaction}).select('+pushToken +registrationPushDeviceId +registrationPushPlatform');
    if (!record) {
      if (!await model.exists({_id:id}).session(transaction)) throw httpError(404,'NOT_FOUND','Registration not found.');
      throw httpError(409,'INVALID_REGISTRATION_STATE','Only pending registrations can be reviewed.');
    }
    await recordAudit({actorId:req.user!.userId,actorRole:'admin',action:'registration.'+status,targetId:id,targetType:type,reason},transaction);
    await enqueueRegistrationPush(record,type,status,transaction);
  });
  const data = {...safeAccount(record,type),type};
  emitRegistration('registration.reviewed',{id,type,status});
  res.json({data,requestId:req.id});
});
export const approveRegistration = review('approved');
export const rejectRegistration = review('rejected');
export const suspendAccount = asyncHandler(async (req,res) => {
  const id = objectIdSchema.parse(req.params.id);
  const {type,reason} = z.object({type:z.enum(['user','responder']),reason:safeText(1,1000)}).strict().parse(req.body);
  let record: any;
  await mongoose.connection.transaction(async transaction => {
    record = await accountModel(type).findOneAndUpdate({_id:id,status:'approved'},{$set:{status:'suspended',reviewedBy:req.user!.userId,reviewedAt:new Date()}},{new:true,session:transaction});
    if (!record) throw httpError(409,'INVALID_ACCOUNT_STATE','Only approved accounts can be suspended.');
    await AuthSession.updateMany({accountId:id,role:type},{$set:{revokedAt:new Date()}},{session:transaction});
    await recordAudit({actorId:req.user!.userId,actorRole:'admin',action:'account.suspended',targetId:id,targetType:type,reason},transaction);
  });
  res.json({data:safeAccount(record,type),requestId:req.id});
});
