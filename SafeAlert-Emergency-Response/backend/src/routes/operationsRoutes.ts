import { Router } from 'express';
import { z } from 'zod';
import { requireAuth,requireRole } from '../middleware/authMiddleware.ts';
import { adminLimiter } from '../middleware/rateLimitMiddleware.ts';
import { activeStatuses,emergencyTypes,statuses,handler,pageQuery,success } from '../shared/http.ts';
import Emergency from '../models/Emergency.ts';
import User from '../models/User.ts';
import Responder from '../models/Responder.ts';
import AuditLog from '../models/AuditLog.ts';
import NotificationJob from '../models/NotificationJob.ts';
import ClientDiagnostic from '../models/ClientDiagnostic.ts';
import { emergencyDto } from '../services/emergencies.ts';
import { adminTransition } from '../controllers/emergencyController.ts';
const router=Router();router.use(requireAuth,requireRole(['admin']),adminLimiter);
router.post('/emergencies/:id/resolve',adminTransition('resolved'));
router.post('/emergencies/:id/cancel',adminTransition('cancelled'));
router.post('/emergencies/:id/false-alarm',adminTransition('false_alarm'));
router.get('/analytics/summary',handler(async(_req,res)=>{
  const [groups,users,responders,totalResponders,onDuty,times]=await Promise.all([
    Emergency.aggregate<{_id:string;count:number}>([{$group:{_id:'$status',count:{$sum:1}}}]),User.countDocuments({status:'pending'}),Responder.countDocuments({status:'pending'}),Responder.countDocuments({status:'approved'}),Responder.countDocuments({status:'approved',isOnDuty:true}),
    Emergency.aggregate<{average:number}>([{$match:{status:'resolved',resolvedAt:{$exists:true}}},{$group:{_id:null,average:{$avg:{$divide:[{$subtract:['$resolvedAt','$createdAt']},1000]}}}}]),
  ]);
  const counts=new Map(groups.map(g=>[g._id,g.count]));
  return success(res,{total:groups.reduce((sum,g)=>sum+g.count,0),active:activeStatuses.reduce((sum,s)=>sum+(counts.get(s)||0),0),resolved:counts.get('resolved')||0,cancelled:counts.get('cancelled')||0,falseAlarm:counts.get('false_alarm')||0,pendingRegistrations:{users,responders},responders:{total:totalResponders,onDuty},averageResolutionSeconds:times[0]?.average||0});
}));
router.get('/analytics/monthly',handler(async(_req,res)=>{
  const rows=await Emergency.aggregate([{$group:{_id:{$dateToString:{format:'%Y-%m',date:'$createdAt',timezone:'Asia/Manila'}},total:{$sum:1},resolved:{$sum:{$cond:[{$eq:['$status','resolved']},1,0]}}}},{$sort:{_id:-1}},{$limit:24}]);
  return success(res,rows.reverse().map(r=>({month:r._id,total:r.total,resolved:r.resolved})));
}));
router.get('/analytics/resolution-times',handler(async(_req,res)=>{
  const rows=await Emergency.aggregate<{seconds:number}>([{$match:{status:'resolved',resolvedAt:{$exists:true}}},{$project:{seconds:{$divide:[{$subtract:['$resolvedAt','$createdAt']},1000]}}},{$sort:{seconds:1}}]);
  const values=rows.map(r=>r.seconds).filter(v=>v>=0),n=values.length;
  return success(res,{count:n,averageSeconds:n?values.reduce((a,b)=>a+b,0)/n:0,medianSeconds:n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:0});
}));
router.get('/records/emergencies',handler(async(req,res)=>{
  const {page,limit}=pageQuery(req);const input=z.object({status:z.enum(statuses).optional(),type:z.enum(emergencyTypes).optional(),q:z.string().trim().max(100).optional()}).parse(req.query);
  const q=input.q?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const filter={...(input.status?{status:input.status}:{}),...(input.type?{type:input.type}:{}),...(q?{$or:[{notes:{$regex:q,$options:'i'}},{coverageArea:{$regex:q,$options:'i'}}]}:{})};
  const [rows,total]=await Promise.all([Emergency.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit),Emergency.countDocuments(filter)]);
  return success(res,await Promise.all(rows.map(emergencyDto)),200,{page,limit,total});
}));
router.get('/diagnostics',handler(async(req,res)=>{
  const {page,limit}=pageQuery(req);
  const [rows,total]=await Promise.all([ClientDiagnostic.find().sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),ClientDiagnostic.countDocuments()]);
  return success(res,rows.map(({_id,__v,...row})=>({...row,id:String(_id)})),200,{page,limit,total});
}));
router.get('/audit-logs',handler(async(req,res)=>{
  const {page,limit}=pageQuery(req);const q=z.string().max(100).optional().parse(req.query.q);
  const actorRole=z.enum(['user','responder','admin','system']).optional().parse(req.query.actorRole);
  const pattern=q?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const filter={...(actorRole?{actorRole}:{}),...(pattern?{$or:[{action:{$regex:pattern,$options:'i'}},{actorId:{$regex:pattern,$options:'i'}},{targetId:{$regex:pattern,$options:'i'}}]}:{})};
  const [rows,total]=await Promise.all([AuditLog.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean(),AuditLog.countDocuments(filter)]);
  return success(res,rows.map(({_id,__v,...row})=>({...row,id:String(_id)})),200,{page,limit,total});
}));
router.get('/operations',handler(async(_req,res)=>success(res,{notifications:{pending:await NotificationJob.countDocuments({status:{$in:['pending','processing']}}),failed:await NotificationJob.countDocuments({status:'failed'})},outboxPending:await Emergency.countDocuments({'outbox.0':{$exists:true}})})));
export default router;
