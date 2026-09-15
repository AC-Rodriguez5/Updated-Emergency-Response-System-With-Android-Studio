import type { Request,Response,NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
declare global { namespace Express { interface Request { id?:string } } }
export function requestIdMiddleware(req:Request,res:Response,next:NextFunction){
  const supplied=req.get('x-request-id');req.id=supplied&&/^[A-Za-z0-9_-]{1,80}$/.test(supplied)?supplied:randomUUID();
  res.setHeader('x-request-id',req.id);next();
}
