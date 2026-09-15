import { z } from 'zod';
import { createHash } from 'node:crypto';
import UploadedFile from '../models/UploadedFile.ts';
import RegistrationSession from '../models/RegistrationSession.ts';
import Emergency from '../models/Emergency.ts';
import { validateAndSanitizeFile } from '../middleware/uploadMiddleware.ts';
import { asyncHandler,objectIdSchema,httpError } from '../services/identity.ts';
import { recordAudit } from '../services/audit.ts';

export const uploadDocument = asyncHandler(async (req,res) => {
  const {purpose,source} = z.object({
    purpose:z.enum(['proof_of_residency','face_capture','credential']),
    source:z.enum(['camera','file']),
  }).strict().parse(req.body);
  if (!req.file) throw httpError(400,'FILE_REQUIRED','Choose a file to upload.');
  if (purpose==='credential' && req.registrationRole!=='responder') throw httpError(403,'FORBIDDEN','Credential uploads require a responder registration session.');
  if (purpose==='face_capture' && (source!=='camera' || !req.file.mimetype.startsWith('image/'))) throw httpError(400,'CAMERA_REQUIRED','Face capture must be an image taken through the camera.');
  if (await UploadedFile.countDocuments({registrationSessionId:req.registrationSessionId}) >= 6) throw httpError(429,'UPLOAD_LIMIT','Registration upload limit reached. Start a new registration session.');
  const {data,mimeType} = await validateAndSanitizeFile(req.file);
  const session = await RegistrationSession.findOne({_id:req.registrationSessionId,consumedAt:{$exists:false},expiresAt:{$gt:new Date()}});
  if (!session) throw httpError(401,'INVALID_REGISTRATION_SESSION','Registration session expired.');
  const file = await UploadedFile.create({
    registrationSessionId:req.registrationSessionId,purpose,source,mimeType,size:data.length,data,
    sha256:createHash('sha256').update(data).digest('hex'),
    expiresAt:new Date(Date.now()+24*60*60*1000),
  });
  res.status(201).json({data:{id:String(file._id),purpose,mimeType,size:data.length},requestId:req.id});
});
export const getDocument = asyncHandler(async (req,res) => {
  const id = objectIdSchema.parse(req.params.id);
  const file = await UploadedFile.findById(id).select('+data');
  if (!file || (req.user!.role!=='admin' && (file.ownerId!==req.user!.userId || file.ownerRole!==req.user!.role))) throw httpError(404,'NOT_FOUND','Document not found.');
  if (req.user!.role==='admin') {
    await recordAudit({actorId:req.user!.userId,actorRole:'admin',action:'document.viewed',targetId:id,targetType:'document',details:{ownerId:file.ownerId,purpose:file.purpose}});
  }
  const extension = file.mimeType==='application/pdf'?'pdf':'png';
  res.set({
    'Content-Type':file.mimeType,
    'Content-Disposition':(file.mimeType==='application/pdf'?'attachment':'inline')+'; filename="document-'+id+'.'+extension+'"',
    'Cache-Control':'private, no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox",
  });
  res.send(Buffer.from(file.data));
});

export const uploadResponsePhoto = asyncHandler(async (req,res) => {
  const {emergencyId} = z.object({emergencyId:objectIdSchema}).strict().parse(req.body);
  if (!req.file || !req.file.mimetype.startsWith('image/')) throw httpError(400,'IMAGE_REQUIRED','Choose an image for the response report.');
  const assigned = await Emergency.exists({_id:emergencyId,assignedResponderId:req.user!.userId,status:{$in:['assigned','responder_on_the_way','responder_nearby']}});
  if (!assigned) throw httpError(404,'NOT_FOUND','An active assigned emergency is required.');
  if (await UploadedFile.countDocuments({emergencyId,ownerId:req.user!.userId,purpose:'response_photo'})>=10) throw httpError(409,'PHOTO_LIMIT','This emergency already has ten uploaded response photos.');
  const {data,mimeType} = await validateAndSanitizeFile(req.file);
  const file = await UploadedFile.create({ownerId:req.user!.userId,ownerRole:'responder',emergencyId,purpose:'response_photo',source:'file',mimeType,size:data.length,data,sha256:createHash('sha256').update(data).digest('hex')});
  res.status(201).json({data:{id:String(file._id),purpose:'response_photo',mimeType,size:data.length},requestId:req.id});
});
