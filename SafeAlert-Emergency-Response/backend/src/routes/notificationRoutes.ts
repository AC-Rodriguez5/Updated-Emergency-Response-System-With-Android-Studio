import { Router } from 'express';
import { z } from 'zod';
import PushDevice from '../models/PushDevice.ts';
import { requireAuth,requireRole } from '../middleware/authMiddleware.ts';
import { handler,success } from '../shared/http.ts';
import { apiLimiter } from '../middleware/rateLimitMiddleware.ts';
const router=Router();router.use(requireAuth,requireRole(['user','responder']),apiLimiter);
router.post('/devices',handler(async(req,res)=>{
  const data=z.object({deviceId:z.string().min(8).max(200),token:z.string().min(20).max(4096),platform:z.literal('android')}).strict().parse(req.body);
  // A device token belongs to its latest authenticated account; no location is stored here.
  await PushDevice.deleteMany({token:data.token,accountId:{$ne:req.user!.userId}});
  await PushDevice.updateOne({accountId:req.user!.userId,deviceId:data.deviceId},{$set:{...data,sessionId:req.user!.sessionId,role:req.user!.role,lastSeenAt:new Date()}},{upsert:true,runValidators:true});
  return success(res,{deviceId:data.deviceId},201);
}));
router.delete('/devices/:deviceId',handler(async(req,res)=>{await PushDevice.deleteOne({accountId:req.user!.userId,deviceId:req.params.deviceId});return success(res,{removed:true});}));
export default router;

