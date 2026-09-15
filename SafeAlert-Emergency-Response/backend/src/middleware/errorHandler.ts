import type { Request,Response,NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
export function errorHandler(error:unknown,req:Request,res:Response,_next:NextFunction){
  if(res.headersSent)return;
  if(error instanceof ZodError)return res.status(400).json({requestId:req.id,error:{code:'VALIDATION_ERROR',message:'Some fields need to be corrected.',details:error.issues.map(issue=>({path:issue.path,message:issue.message}))}});
  const err=error as {status?:number;statusCode?:number;code?:string|number;message?:string};
  let status=err?.status||err?.statusCode||500;let code=typeof err?.code==='string'?err.code:'INTERNAL_ERROR';
  if(error instanceof mongoose.Error.CastError||error instanceof mongoose.Error.ValidationError){status=400;code='VALIDATION_ERROR';}
  if(error instanceof MulterError){status=error.code==='LIMIT_FILE_SIZE'?413:400;code=error.code==='LIMIT_FILE_SIZE'?'FILE_TOO_LARGE':error.code;}
  if(err?.code===11000){status=409;code='RECORD_CONFLICT';}
  if(status>=500)console.error(JSON.stringify({level:'error',event:'request_failed',requestId:req.id,code}));
  const message=status>=500?'The request could not be completed. Try again.':err?.code===11000?'A conflicting record already exists.':err?.message||'Request could not be completed.';
  return res.status(status).json({requestId:req.id,error:{code,message}});
}
