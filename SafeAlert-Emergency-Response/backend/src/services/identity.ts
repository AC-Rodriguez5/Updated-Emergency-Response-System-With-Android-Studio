import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import User from '../models/User.ts';
import Responder from '../models/Responder.ts';
import AdminUser from '../models/AdminUser.ts';
import RefreshToken, { AuthSession } from '../models/RefreshToken.ts';
import { env } from '../config/environment.ts';

export type AccountRole = 'user' | 'responder' | 'admin';
export const roleSchema = z.enum(['user', 'responder', 'admin']);
export const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid record ID');
export const safeText = (min: number, max: number) => z.string().trim().min(min).max(max).regex(/^[^<>\u0000-\u001f]*$/, 'Markup and control characters are not permitted');
export const passwordSchema = z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password exceeds 72 bytes');
export const tokenSchema = z.object({ refreshToken: z.string().min(32).max(256) }).strict();
const registrationFields = {
  name: safeText(2,100), email: z.string().trim().email().max(254).toLowerCase(),
  password: passwordSchema, confirmPassword: z.string().optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{10,20}$/),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/).refine(value => Number.isFinite(Date.parse(value)), 'Invalid date of birth'),
  age: z.number().int().min(0).max(130).optional(),
  address: safeText(5,255), coverageArea: safeText(2,100).transform(value => value.toLowerCase()),
  consentLocation: z.literal(true),
  registrationToken: z.string().min(32).max(256),
  proofOfResidencyId: objectIdSchema, faceCaptureId: objectIdSchema,
  pushToken: z.string().trim().min(1).max(4096).optional(),
  deviceId: z.string().uuid().optional(), platform:z.literal('android').optional(),
};
const validatePushRegistration = (value:{pushToken?:string;deviceId?:string;platform?:string},ctx:z.RefinementCtx) => {
  if ([value.pushToken,value.deviceId,value.platform].some(Boolean) && ![value.pushToken,value.deviceId,value.platform].every(Boolean))
    ctx.addIssue({code:'custom',path:['pushToken'],message:'Provide pushToken, deviceId, and platform together.'});
};
export const userRegistrationSchema = z.object(registrationFields).strict().superRefine(validatePushRegistration);
export const responderRegistrationSchema = z.object({
  ...registrationFields,
  agencyType: z.enum(['police','fire','medical','rescue','other']),
  departmentName: safeText(2,100), responderRole: safeText(2,100),
  credentialNumber: safeText(0,100).optional(), credentialId: objectIdSchema,
}).strict().superRefine(validatePushRegistration);
export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254).transform(value => value.toLowerCase()),
  password: z.string().min(1).max(256), role: roleSchema, rememberMe: z.boolean().default(false),
}).strict();
export function httpError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}
export const asyncHandler = (handler: (req: Request,res: Response,next: NextFunction) => Promise<unknown>) =>
  (req: Request,res: Response,next: NextFunction) => { Promise.resolve(handler(req,res,next)).catch(next); };
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function opaqueToken(): string { return randomBytes(48).toString('base64url'); }
export function accountModel(role: AccountRole): any { return role === 'admin' ? AdminUser : role === 'responder' ? Responder : User; }
export function safeAccount(account: any, role: AccountRole): Record<string, unknown> {
  const raw = account.toObject ? account.toObject() : account;
  const fields = ['name','email','username','phone','dateOfBirth','address','coverageArea','consentLocation','agencyType','departmentName','responderRole','credentialNumber','isOnDuty','proofOfResidencyId','faceCaptureId','credentialId','rejectionReason','reviewedAt','createdAt','updatedAt'];
  const safe: Record<string, unknown> = { id: String(raw._id), role, status: raw.status ?? (role === 'admin' ? 'approved' : 'pending') };
  for (const key of fields) if (raw[key] !== undefined) safe[key] = raw[key];
  if (raw.dateOfBirth) safe.age = calculateAge(new Date(raw.dateOfBirth));
  return safe;
}
export function calculateAge(date: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (now.getUTCMonth() < date.getUTCMonth() || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--;
  return age;
}
export function assertApproved(account: any, role: AccountRole): void {
  const status = account?.status ?? (role === 'admin' ? 'approved' : 'pending');
  if (status === 'pending') throw httpError(403,'ACCOUNT_PENDING','Account pending admin approval.');
  if (status === 'rejected') throw httpError(403,'ACCOUNT_REJECTED','Account registration was rejected. Contact support for details.');
  if (status !== 'approved') throw httpError(403,'ACCOUNT_SUSPENDED','Account access is suspended.');
}
export async function issueSession(account: any, role: AccountRole, rememberMe: boolean) {
  const familyId = randomUUID();
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000);
  await AuthSession.create({ _id: familyId, accountId: String(account._id), role, expiresAt });
  return rotateSession(account, role, familyId, expiresAt);
}
export async function rotateSession(account: any, role: AccountRole, familyId: string, expiresAt: Date) {
  const refreshToken = opaqueToken();
  await RefreshToken.create({ accountId: String(account._id), role, familyId, tokenHash: hashToken(refreshToken), expiresAt });
  const accessToken = jwt.sign({ userId: String(account._id), role, sid: familyId }, env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '15m', issuer: 'safealert', audience: 'safealert-clients', subject: String(account._id),
  });
  return { accessToken, refreshToken, account: safeAccount(account,role) };
}
export async function revokeSession(familyId: string): Promise<void> {
  const revokedAt = new Date();
  await AuthSession.updateOne({ _id: familyId }, { $set: { revokedAt } });
  await RefreshToken.updateMany({ familyId, revokedAt: { $exists: false } }, { $set: { revokedAt } });
}
