import {Router} from 'express';
import {z} from 'zod';
import {requireAuth} from '../middleware/authMiddleware.ts';
import {apiLimiter} from '../middleware/rateLimitMiddleware.ts';
import {handler,success} from '../shared/http.ts';
import ClientDiagnostic from '../models/ClientDiagnostic.ts';
const router=Router();router.use(requireAuth,apiLimiter);
router.post('/',handler(async(req,res)=>{
  // Only symbolic frames, never exception messages, device identifiers or URLs.
  const data=z.object({eventId:z.string().uuid(),platform:z.enum(['android','admin_web']),code:z.string().regex(/^[A-Za-z0-9_]{1,80}$/),frames:z.array(z.string().regex(/^[A-Za-z0-9_.$<>-]{1,160}$/)).max(20),fatal:z.boolean(),capturedAt:z.string().datetime()}).strict().parse(req.body);
  await ClientDiagnostic.updateOne({accountId:req.user!.userId,eventId:data.eventId},{$setOnInsert:{...data,accountId:req.user!.userId,role:req.user!.role}},{upsert:true});
  return success(res,{received:true},201);
}));
export default router;
