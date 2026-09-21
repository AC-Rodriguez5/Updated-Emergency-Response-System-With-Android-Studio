import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { BleDevice, User } from '../../models/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';

export async function deviceAuthGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const match = req.header('authorization')?.match(/^Device ([A-Za-z0-9_-]{32,128})$/);
    const deviceId = req.header('x-device-id') ??
      (typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined);
    if (!match || !deviceId) {
      throw new AppError('Device authentication failed', 401, 'INVALID_DEVICE_CREDENTIALS');
    }
    const tokenHash = createHash('sha256').update(match[1]).digest('hex');
    const device = await BleDevice.findOne({
      deviceId,
      pairingStatus: 'paired',
      deviceTokenHash: tokenHash,
    }).select('+deviceTokenHash');
    if (!device) {
      throw new AppError('Device authentication failed', 401, 'INVALID_DEVICE_CREDENTIALS');
    }
    const user = await User.findById(device.userId).select('email isApproved approvalStatus');
    if (!user || !user.isApproved || user.approvalStatus !== 'approved') {
      throw new AppError(
        'The paired account is not approved',
        403,
        'DEVICE_ACCOUNT_UNAVAILABLE',
      );
    }
    req.auth = { accountId: String(user._id), email: user.email, role: 'user' };
    next();
  } catch (error) {
    next(error);
  }
}
