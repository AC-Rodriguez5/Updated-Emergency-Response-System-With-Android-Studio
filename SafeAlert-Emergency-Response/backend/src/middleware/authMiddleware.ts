import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/environment.ts';
import RefreshToken, { AuthSession } from '../models/RefreshToken.ts';
import { accountModel, assertApproved, httpError, roleSchema, objectIdSchema, asyncHandler } from '../services/identity.ts';
import RegistrationSession from '../models/RegistrationSession.ts';
import { hashToken } from '../services/identity.ts';

export interface AuthPayload {
  userId: string; role: 'user' | 'responder' | 'admin';
  status: 'pending' | 'approved' | 'rejected' | 'suspended'; sessionId: string;
}
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      registrationSessionId?: string;
      registrationRole?: 'user' | 'responder';
      refreshAccountId?: string;
    }
  }
}
const claimsSchema = z.object({ userId: objectIdSchema, role: roleSchema, sid: z.string().uuid(), sub: objectIdSchema });
export async function authenticateAccessToken(token: string): Promise<AuthPayload> {
  let claims;
  try {
    claims = claimsSchema.parse(jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'safealert', audience: 'safealert-clients' }));
  } catch { throw httpError(401,'INVALID_TOKEN','Unauthorized: Invalid or expired token.'); }
  if (claims.sub !== claims.userId) throw httpError(401,'INVALID_TOKEN','Unauthorized: Invalid or expired token.');
  const [session, account] = await Promise.all([
    AuthSession.exists({ _id: claims.sid, accountId: claims.userId, role: claims.role, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }),
    accountModel(claims.role).findById(claims.userId).select('status role'),
  ]);
  if (!session || !account || account.role !== claims.role) throw httpError(401,'SESSION_REVOKED','Session is no longer valid. Sign in again.');
  assertApproved(account, claims.role);
  return { userId: claims.userId, role: claims.role, status: 'approved', sessionId: claims.sid };
}
export function bearerToken(req: Request): string {
  const match = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw httpError(401,'UNAUTHORIZED','Unauthorized: No token provided.');
  return match[1];
}
export const requireAuth = asyncHandler(async (req, _res, next) => {
  req.user = await authenticateAccessToken(bearerToken(req));
  next();
});
export const requireRole = (roles: Array<AuthPayload['role']>) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || !roles.includes(req.user.role)) return next(httpError(403,'FORBIDDEN','Forbidden: Insufficient permissions.'));
  next();
};
export const requireRegistrationSession = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  const session = await RegistrationSession.findOne({ tokenHash: hashToken(token), consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!session) throw httpError(401,'INVALID_REGISTRATION_SESSION','Registration session expired. Start registration again.');
  req.registrationSessionId = String(session._id);
  req.registrationRole = session.role;
  next();
});

// Identify a valid token's account for throttling; this does not authenticate a request.
export const identifyRefreshAccount = asyncHandler(async (req,_res,next) => {
  const token = req.body?.refreshToken;
  if (typeof token==='string' && token.length>=32 && token.length<=256) {
    const stored = await RefreshToken.findOne({tokenHash:hashToken(token)}).select('accountId role');
    if (stored && ['user','responder','admin'].includes(stored.role)) req.refreshAccountId=stored.role+':'+stored.accountId;
  }
  next();
});
