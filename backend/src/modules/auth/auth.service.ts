import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Admin, RefreshToken, Responder, User } from '../../models/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import type { AuthRole } from '../../shared/types/http.js';
import * as filesService from '../files/files.service.js';
import {
  hashRefreshToken,
  mintRefreshToken,
  signAccessToken,
  verifyRefreshToken,
} from './jwt.js';
import type {
  LoginInput,
  RegisterResponderInput,
  RegisterUserInput,
} from './auth.schemas.js';

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

const SALT_ROUNDS = 10;

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  account: {
    id: string;
    email: string;
    role: AuthRole;
    name?: string;
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    isApproved?: boolean;
    responderRole?: string;
    department?: string;
    agencyType?: string;
    stationName?: string;
    position?: string;
    coverageArea?: string;
    dutyStatus?: string;
  };
}

function clientMeta(req: Request): { ip?: string; userAgent?: string } {
  const fwd = req.header('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0]?.trim() : req.ip) ?? undefined;
  const ua = req.header('user-agent') ?? undefined;
  return { ip, userAgent: ua?.slice(0, 250) };
}

async function persistRefresh(
  accountId: string,
  role: AuthRole,
  meta: { ip?: string; userAgent?: string },
): Promise<{ token: string }> {
  const minted = mintRefreshToken(accountId, role);
  await RefreshToken.create({
    jti: minted.jti,
    tokenHash: minted.tokenHash,
    accountId,
    role,
    expiresAt: minted.expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { token: minted.token };
}

export interface RegisterUserFiles {
  faceCapture: Express.Multer.File;
  proofOfResidency: Express.Multer.File;
}

export async function registerUser(
  input: RegisterUserInput,
  req: Request,
  files: RegisterUserFiles,
): Promise<AuthResult> {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');
  }

  const dob = input.dateOfBirth instanceof Date
    ? input.dateOfBirth
    : new Date(input.dateOfBirth);
  const age = ageFromDob(dob);

  const faceFileId = await filesService.uploadBuffer(
    files.faceCapture.buffer,
    files.faceCapture.originalname || 'face.jpg',
    files.faceCapture.mimetype,
    { ownerType: 'user', purpose: 'face_capture' },
  );

  let proofFileId: Awaited<ReturnType<typeof filesService.uploadBuffer>>;
  try {
    proofFileId = await filesService.uploadBuffer(
      files.proofOfResidency.buffer,
      files.proofOfResidency.originalname || 'id.jpg',
      files.proofOfResidency.mimetype,
      { ownerType: 'user', purpose: 'proof_of_residency' },
    );
  } catch (err) {
    await filesService.deleteFile(faceFileId);
    throw err;
  }

  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  let user;
  try {
    user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: hashed,
      municipality: input.municipality,
      barangay: input.barangay,
      streetAddress: input.streetAddress,
      dateOfBirth: dob,
      age,
      bloodType: input.bloodType,
      emergencyContactName: input.emergencyContactName,
      emergencyContactNumber: input.emergencyContactNumber,
      faceCaptureFileId: faceFileId,
      proofOfResidencyFileId: proofFileId,
      contacts: [],
      /*
        The consent form tells the resident, in writing, that their grant is
        saved to their account with a timestamp. This is that record. An older
        app that sends nothing leaves the log empty rather than inventing a
        grant nobody gave.
      */
      consentLog:
        input.consentVersion && input.consentScopes?.length
          ? [
              {
                version: input.consentVersion,
                scopes: input.consentScopes,
                action: 'granted' as const,
                recordedAt: new Date(),
              },
            ]
          : [],
    });
  } catch (err) {
    await filesService.deleteFile(faceFileId);
    await filesService.deleteFile(proofFileId);
    throw err;
  }
  await Promise.all([
    filesService.updateFileOwner(faceFileId, user.id),
    filesService.updateFileOwner(proofFileId, user.id),
  ]);

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: 'user',
  });
  const { token: refreshToken } = await persistRefresh(user.id, 'user', clientMeta(req));

  return {
    accessToken,
    refreshToken,
    account: {
      id: user.id,
      email: user.email,
      role: 'user',
      name: user.name,
      approvalStatus: user.approvalStatus,
      isApproved: user.isApproved,
    },
  };
}

export interface RegisterResponderFiles {
  faceCapture?: Express.Multer.File;
  credential?: Express.Multer.File;
}

export async function registerResponder(
  input: RegisterResponderInput,
  req: Request,
  files?: RegisterResponderFiles,
): Promise<AuthResult> {
  const existing = await Responder.findOne({
    $or: [{ email: input.email }, { badgeId: input.badgeId }],
  });
  if (existing) {
    throw new AppError(
      'Email or badge ID already registered',
      409,
      'RESPONDER_TAKEN',
    );
  }

  let faceCaptureFileId: Awaited<ReturnType<typeof filesService.uploadBuffer>> | undefined;
  let credentialFileId: Awaited<ReturnType<typeof filesService.uploadBuffer>> | undefined;

  if (files?.faceCapture) {
    faceCaptureFileId = await filesService.uploadBuffer(
      files.faceCapture.buffer,
      files.faceCapture.originalname || 'face.jpg',
      files.faceCapture.mimetype,
      { ownerType: 'responder', purpose: 'face_capture' },
    );
  }
  if (files?.credential) {
    try {
      credentialFileId = await filesService.uploadBuffer(
        files.credential.buffer,
        files.credential.originalname || 'credential.jpg',
        files.credential.mimetype,
        { ownerType: 'responder', purpose: 'credential' },
      );
    } catch (err) {
      if (faceCaptureFileId) await filesService.deleteFile(faceCaptureFileId);
      throw err;
    }
  }

  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  let responder;
  try {
    responder = await Responder.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: hashed,
      badgeId: input.badgeId,
      department: input.department,
      agencyType: input.agencyType,
      stationName: input.stationName,
      position: input.position,
      coverageArea: input.coverageArea,
      faceCaptureFileId,
      credentialFileId,
      isOnDuty: false,
    });
  } catch (err) {
    if (faceCaptureFileId) await filesService.deleteFile(faceCaptureFileId);
    if (credentialFileId) await filesService.deleteFile(credentialFileId);
    throw err;
  }
  await Promise.all([
    faceCaptureFileId ? filesService.updateFileOwner(faceCaptureFileId, responder.id) : undefined,
    credentialFileId ? filesService.updateFileOwner(credentialFileId, responder.id) : undefined,
  ]);

  const accessToken = signAccessToken({
    sub: responder.id,
    email: responder.email,
    role: 'responder',
  });
  const { token: refreshToken } = await persistRefresh(
    responder.id,
    'responder',
    clientMeta(req),
  );

  return {
    accessToken,
    refreshToken,
    account: {
      id: responder.id,
      email: responder.email,
      role: 'responder',
      name: responder.name,
      approvalStatus: responder.approvalStatus,
      isApproved: responder.isApproved,
      responderRole: responder.responderRole,
      department: responder.department,
      agencyType: responder.agencyType,
      stationName: responder.stationName,
      position: responder.position,
      coverageArea: responder.coverageArea,
      dutyStatus: responder.dutyStatus,
    },
  };
}

export async function login(input: LoginInput, req: Request): Promise<AuthResult> {
  const role = input.role;

  if (!role || role === 'admin') {
    const admin = await Admin.findOne({ email: input.email });
    if (admin) {
      if (!admin.isActive) {
        throw new AppError('Admin account disabled', 403, 'ACCOUNT_DISABLED');
      }
      const ok = await bcrypt.compare(input.password, admin.password);
      if (!ok) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      admin.lastLoginAt = new Date();
      await admin.save();
      const accessToken = signAccessToken({
        sub: admin.id,
        email: admin.email,
        role: 'admin',
      });
      const { token: refreshToken } = await persistRefresh(
        admin.id,
        'admin',
        clientMeta(req),
      );
      return {
        accessToken,
        refreshToken,
        account: { id: admin.id, email: admin.email, role: 'admin', name: admin.name },
      };
    }
    if (role === 'admin') throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (!role || role === 'user') {
    const user = await User.findOne({ email: input.email });
    if (user) {
      const ok = await bcrypt.compare(input.password, user.password);
      if (!ok) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      if (user.approvalStatus !== 'approved' || !user.isApproved) {
        throw new AppError(
          `Account ${user.approvalStatus}`,
          403,
          'ACCOUNT_NOT_APPROVED',
        );
      }
      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        role: 'user',
      });
      const { token: refreshToken } = await persistRefresh(
        user.id,
        'user',
        clientMeta(req),
      );
      return {
        accessToken,
        refreshToken,
        account: {
          id: user.id,
          email: user.email,
          role: 'user',
          name: user.name,
          approvalStatus: user.approvalStatus,
          isApproved: user.isApproved,
        },
      };
    }
    if (role === 'user') throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
  }

  if (!role || role === 'responder') {
    const responder = await Responder.findOne({ email: input.email });
    if (responder) {
      const ok = await bcrypt.compare(input.password, responder.password);
      if (!ok) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      if (responder.approvalStatus !== 'approved' || !responder.isApproved) {
        throw new AppError(
          `Account ${responder.approvalStatus}`,
          403,
          'ACCOUNT_NOT_APPROVED',
        );
      }
      const accessToken = signAccessToken({
        sub: responder.id,
        email: responder.email,
        role: 'responder',
      });
      const { token: refreshToken } = await persistRefresh(
        responder.id,
        'responder',
        clientMeta(req),
      );
      return {
        accessToken,
        refreshToken,
        account: {
          id: responder.id,
          email: responder.email,
          role: 'responder',
          name: responder.name,
          approvalStatus: responder.approvalStatus,
          isApproved: responder.isApproved,
          responderRole: responder.responderRole,
          department: responder.department,
          agencyType: responder.agencyType,
          stationName: responder.stationName,
          position: responder.position,
          coverageArea: responder.coverageArea,
          dutyStatus: responder.dutyStatus,
        },
      };
    }
  }

  throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
}

export async function refresh(
  rawRefreshToken: string,
  req: Request,
): Promise<AuthResult> {
  let claims;
  try {
    claims = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH');
  }
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await RefreshToken.findOne({ jti: claims.jti, tokenHash });
  if (!stored) throw new AppError('Refresh token not recognized', 401, 'INVALID_REFRESH');
  if (stored.revokedAt) throw new AppError('Refresh token revoked', 401, 'INVALID_REFRESH');
  if (stored.expiresAt.getTime() < Date.now()) {
    throw new AppError('Refresh token expired', 401, 'INVALID_REFRESH');
  }

  const accountId = stored.accountId.toString();
  const role = stored.role;

  let email: string;
  let name: string | undefined;
  const responderAccount: Partial<AuthResult['account']> = {};
  if (role === 'user') {
    const u = await User.findById(accountId);
    if (!u) throw new AppError('Account not found', 401, 'ACCOUNT_GONE');
    if (u.approvalStatus !== 'approved' || !u.isApproved) {
      throw new AppError('Account no longer approved', 403, 'ACCOUNT_NOT_APPROVED');
    }
    email = u.email;
    name = u.name;
  } else if (role === 'responder') {
    const r = await Responder.findById(accountId);
    if (!r) throw new AppError('Account not found', 401, 'ACCOUNT_GONE');
    if (r.approvalStatus !== 'approved' || !r.isApproved) {
      throw new AppError('Account no longer approved', 403, 'ACCOUNT_NOT_APPROVED');
    }
    email = r.email;
    name = r.name;
    Object.assign(responderAccount, {
      responderRole: r.responderRole,
      department: r.department,
      agencyType: r.agencyType,
      stationName: r.stationName,
      position: r.position,
      coverageArea: r.coverageArea,
      dutyStatus: r.dutyStatus,
    });
  } else {
    const a = await Admin.findById(accountId);
    if (!a) throw new AppError('Account not found', 401, 'ACCOUNT_GONE');
    if (!a.isActive) throw new AppError('Admin disabled', 403, 'ACCOUNT_DISABLED');
    email = a.email;
    name = a.name;
  }

  const accessToken = signAccessToken({ sub: accountId, email, role });
  const minted = mintRefreshToken(accountId, role);
  const meta = clientMeta(req);
  await RefreshToken.create({
    jti: minted.jti,
    tokenHash: minted.tokenHash,
    accountId,
    role,
    expiresAt: minted.expiresAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  stored.revokedAt = new Date();
  stored.replacedBy = minted.jti;
  await stored.save();

  return {
    accessToken,
    refreshToken: minted.token,
    account: { id: accountId, email, role, name, ...responderAccount },
  };
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function changePassword(
  accountId: string,
  role: AuthRole,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const account =
    role === 'user'
      ? await User.findById(accountId)
      : role === 'responder'
        ? await Responder.findById(accountId)
        : await Admin.findById(accountId);
  if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
  const ok = await bcrypt.compare(currentPassword, account.password);
  if (!ok) {
    throw new AppError('Current password is incorrect', 400, 'INVALID_PASSWORD');
  }
  account.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await account.save();
  await RefreshToken.updateMany(
    { accountId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getMe(accountId: string, role: AuthRole) {
  if (role === 'user') {
    const u = await User.findById(accountId).select('-password').lean();
    if (!u) throw new AppError('Account not found', 404, 'NOT_FOUND');
    return { role: 'user' as const, account: u };
  }
  if (role === 'responder') {
    const r = await Responder.findById(accountId).select('-password').lean();
    if (!r) throw new AppError('Account not found', 404, 'NOT_FOUND');
    return { role: 'responder' as const, account: r };
  }
  const a = await Admin.findById(accountId).select('-password').lean();
  if (!a) throw new AppError('Account not found', 404, 'NOT_FOUND');
  return { role: 'admin' as const, account: a };
}
