import rateLimit from 'express-rate-limit';
import type { Request,Response } from 'express';
const actorKey=(req:Request)=>req.user?req.user.role+':'+req.user.userId:req.ip||'unknown';
const failure=(req:Request,res:Response)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests. Wait briefly before trying again.'},requestId:req.id});
const base={standardHeaders:true,legacyHeaders:false,handler:failure};
export const apiLimiter=rateLimit({...base,windowMs:60_000,max:300,keyGenerator:actorKey});
export const locationLimiter=rateLimit({...base,windowMs:60_000,max:120,keyGenerator:actorKey});
export const emergencyLimiter=rateLimit({...base,windowMs:60_000,max:10,keyGenerator:actorKey});
export const loginLimiter=rateLimit({...base,windowMs:15*60_000,max:5,skipSuccessfulRequests:true,keyGenerator:req=>req.ip+':'+String(req.body?.role||'')+':'+String(req.body?.email||'').trim().toLowerCase()});
// Separate preparation from actual submissions so an upload session doesn't consume a registration attempt.
export const registrationSessionLimiter=rateLimit({...base,windowMs:60*60_000,max:10});
export const registerLimiter=rateLimit({...base,windowMs:60*60_000,max:10});
// Coarse IP protection applies before token lookup; precise budgeting stays with the account across rotations.
export const refreshIpLimiter=rateLimit({...base,windowMs:60*60_000,max:600});
export const refreshLimiter=rateLimit({...base,windowMs:60*60_000,max:30,keyGenerator:req=>req.refreshAccountId||req.ip||'unknown'});
// Exhausting refresh attempts must not prevent the account from signing out.
export const logoutLimiter=rateLimit({...base,windowMs:60*60_000,max:30,keyGenerator:req=>req.refreshAccountId||req.ip||'unknown'});
export const adminLimiter=rateLimit({...base,windowMs:60_000,max:60,keyGenerator:actorKey});
export const uploadLimiter=rateLimit({...base,windowMs:60*60_000,max:20,keyGenerator:req=>req.registrationSessionId?'registration:'+req.registrationSessionId:actorKey(req)});
