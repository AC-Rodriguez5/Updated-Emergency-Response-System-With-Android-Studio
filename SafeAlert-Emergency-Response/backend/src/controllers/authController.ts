import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { z } from 'zod';
import RegistrationSession from '../models/RegistrationSession.ts';
import UploadedFile from '../models/UploadedFile.ts';
import RefreshToken, { AuthSession } from '../models/RefreshToken.ts';
import { recordAudit } from '../services/audit.ts';
import { emitRegistration } from '../config/socket.ts';
import {
  asyncHandler, accountModel, calculateAge, hashToken, opaqueToken, httpError,
  userRegistrationSchema, responderRegistrationSchema, loginSchema, tokenSchema,
  safeAccount, assertApproved, issueSession, rotateSession, revokeSession, type AccountRole,
} from '../services/identity.ts';

export const createRegistrationSession = asyncHandler(async (req,res) => {
  const { role } = z.object({role:z.enum(['user','responder'])}).strict().parse(req.body);
  const sessionToken = opaqueToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await RegistrationSession.create({ role, tokenHash: hashToken(sessionToken), expiresAt });
  res.status(201).json({ data: { sessionToken, expiresAt }, requestId: req.id });
});
const register = (role: 'user'|'responder') => asyncHandler(async (req,res) => {
  const parsed = (role === 'user' ? userRegistrationSchema : responderRegistrationSchema).parse(req.body);
  const date = new Date(parsed.dateOfBirth);
  const age = calculateAge(date);
  if (date.toISOString().slice(0,10) !== parsed.dateOfBirth.slice(0,10) || age < 0 || age > 130 || date > new Date()) throw httpError(400,'INVALID_BIRTH_DATE','Enter a valid date of birth.');
  if (parsed.age !== undefined && parsed.age !== age) throw httpError(400,'INVALID_AGE','Age does not match date of birth.');
  if (parsed.confirmPassword !== undefined && parsed.password !== parsed.confirmPassword) throw httpError(400,'PASSWORD_MISMATCH','Passwords must match.');
  const session = await RegistrationSession.findOne({ tokenHash: hashToken(parsed.registrationToken), role, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!session) throw httpError(401,'INVALID_REGISTRATION_SESSION','Registration session expired. Start registration again.');
  const required = [
    {id:parsed.proofOfResidencyId,purpose:'proof_of_residency'},
    {id:parsed.faceCaptureId,purpose:'face_capture'},
    ...(role === 'responder' ? [{id:(parsed as z.infer<typeof responderRegistrationSchema>).credentialId,purpose:'credential'}] : []),
  ];
  if (new Set(required.map(file => file.id)).size !== required.length) throw httpError(400,'INVALID_DOCUMENTS','Provide separate documents for each required purpose.');
  const { password, confirmPassword, registrationToken, age: _age, deviceId, platform, ...profile } = parsed;
  const passwordHash = await bcrypt.hash(password,12);
  let account: any;
  try {
    await mongoose.connection.transaction(async transaction => {
      const claimed = await RegistrationSession.findOneAndUpdate({ _id:session._id, consumedAt:{$exists:false}, expiresAt:{$gt:new Date()} },{$set:{consumedAt:new Date()}},{session:transaction});
      if (!claimed) throw httpError(409,'REGISTRATION_ALREADY_SUBMITTED','This registration session has already been submitted.');
      for (const file of required) {
        if (!await UploadedFile.exists({ _id:file.id, registrationSessionId:session._id, ownerId:{$exists:false}, purpose:file.purpose, expiresAt:{$gt:new Date()} }).session(transaction))
          throw httpError(400,'INVALID_DOCUMENTS','Required registration documents are missing or do not belong to this session.');
      }
      [account] = await accountModel(role).create([{ ...profile, registrationPushDeviceId:deviceId, registrationPushPlatform:platform, dateOfBirth:date, age, passwordHash, role, status:'pending' }],{session:transaction});
      await UploadedFile.updateMany({ _id:{$in:required.map(file=>file.id)}, registrationSessionId:session._id },{$set:{ownerId:String(account._id),ownerRole:role},$unset:{expiresAt:1}},{session:transaction});
      await recordAudit({ actorId:String(account._id),actorRole:role,action:'registration.submitted',targetId:String(account._id),targetType:role },transaction);
    });
  } catch (error: any) {
    if (error.code === 11000) throw httpError(409,'REGISTRATION_CONFLICT','Unable to register with these details. Sign in or contact support.');
    throw error;
  }
  const data = safeAccount(account,role);
  emitRegistration('registration.created',{id:String(account._id),type:role,status:'pending'});
  res.status(201).json({data,requestId:req.id});
});
export const registerUser = register('user');
export const registerResponder = register('responder');
export const login = asyncHandler(async (req,res) => {
  const {email,password,role,rememberMe} = loginSchema.parse(req.body);
  const filter = role === 'admin' ? {$or:[{email},{username:email}]} : {email};
  const account = await accountModel(role).findOne(filter).select('+passwordHash');
  // Equal-cost comparison avoids revealing whether an identifier exists through timing.
  const hash = account?.passwordHash || '$2a$12$C6UzMDM.H6dfI/f/IKcEe.5oFfNVyZl4vYRLSHYUGGLDX.rUfaZL.';
  const valid = await bcrypt.compare(password,hash);
  if (!account || !valid) throw httpError(401,'INVALID_CREDENTIALS','Invalid email or password.');
  assertApproved(account,role);
  res.json({data:await issueSession(account,role,rememberMe),requestId:req.id});
});
export const refresh = asyncHandler(async (req,res) => {
  const {refreshToken} = tokenSchema.parse(req.body);
  const stored = await RefreshToken.findOne({tokenHash:hashToken(refreshToken)});
  if (!stored || !stored.familyId || !['user','responder','admin'].includes(stored.role)) throw httpError(401,'INVALID_REFRESH_TOKEN','Session is no longer valid. Sign in again.');
  if (stored.consumedAt || stored.revokedAt || stored.expiresAt <= new Date()) {
    await revokeSession(stored.familyId);
    throw httpError(401,'REFRESH_REUSE','Session is no longer valid. Sign in again.');
  }
  const session = await AuthSession.findOne({_id:stored.familyId,revokedAt:{$exists:false},expiresAt:{$gt:new Date()}});
  if (!session) throw httpError(401,'INVALID_REFRESH_TOKEN','Session is no longer valid. Sign in again.');
  const account = await accountModel(stored.role).findById(stored.accountId);
  if (!account) { await revokeSession(stored.familyId); throw httpError(401,'INVALID_REFRESH_TOKEN','Session is no longer valid. Sign in again.'); }
  assertApproved(account,stored.role);
  const claimed = await RefreshToken.findOneAndUpdate({_id:stored._id,consumedAt:{$exists:false},revokedAt:{$exists:false}},{$set:{consumedAt:new Date()}});
  if (!claimed) { await revokeSession(stored.familyId); throw httpError(401,'REFRESH_REUSE','Session is no longer valid. Sign in again.'); }
  res.json({data:await rotateSession(account,stored.role,stored.familyId,stored.expiresAt),requestId:req.id});
});
export const logout = asyncHandler(async (req,res) => {
  const {refreshToken} = tokenSchema.parse(req.body);
  const stored = await RefreshToken.findOne({tokenHash:hashToken(refreshToken)});
  if (stored) await revokeSession(stored.familyId);
  res.json({data:{loggedOut:true},requestId:req.id});
});
export const me = asyncHandler(async (req,res) => {
  const role = req.user!.role as AccountRole;
  const account = await accountModel(role).findById(req.user!.userId);
  if (!account) throw httpError(401,'UNAUTHORIZED','Account no longer exists.');
  res.json({data:safeAccount(account,role),requestId:req.id});
});
