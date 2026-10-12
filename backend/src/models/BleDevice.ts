import mongoose, { Schema, Document } from 'mongoose';

export type BlePairingStatus = 'pending' | 'paired' | 'revoked';
export type BleSwitchState = 'on' | 'off';

export interface IBleDevice extends Document {
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  firmwareVersion?: string;
  bleServiceUuid?: string;
  batteryPercent?: number;
  /** Last contact of any kind: pairing, a check-in, an alert, or a streamed fix. */
  lastSeenAt?: Date;
  /**
   * Last liveness report relayed by the owner's phone while it held a Bluetooth
   * link to the device.
   *
   * Kept separate from `lastSeenAt` because the two answer different questions. A
   * device only contacts the backend by itself when it has an alert to send, so
   * without check-ins a perfectly healthy wearable looks days stale. This field is
   * the one that means "known to be powered and in range", and it is only ever as
   * fresh as the last time the owner's phone was nearby with the app running.
   */
  lastCheckInAt?: Date;
  lastRssi?: number;
  switchState?: BleSwitchState;
  hardwareProfile: 'fingerprint_gnss_lte';
  fingerprintEnrolled: boolean;
  directCellularEnabled: boolean;
  lastTransport?: 'ble' | 'lte';
  deviceTokenHash?: string;
  tokenIssuedAt?: Date;
  pairingStatus: BlePairingStatus;
  pairedAt?: Date;
  revokedAt?: Date;
  revokedReason?: string;
  revokedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bleDeviceSchema = new Schema<IBleDevice>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true, trim: true, maxlength: 100 },
    firmwareVersion: { type: String, trim: true, maxlength: 40 },
    bleServiceUuid: { type: String, trim: true, maxlength: 80 },
    batteryPercent: { type: Number, min: 0, max: 100 },
    lastSeenAt: { type: Date },
    lastCheckInAt: { type: Date },
    lastRssi: { type: Number, min: -200, max: 0 },
    switchState: { type: String, enum: ['on', 'off'] },
    hardwareProfile: {
      type: String,
      enum: ['fingerprint_gnss_lte'],
      default: 'fingerprint_gnss_lte',
      required: true,
    },
    fingerprintEnrolled: { type: Boolean, default: false, required: true },
    directCellularEnabled: { type: Boolean, default: false, required: true },
    lastTransport: { type: String, enum: ['ble', 'lte'] },
    deviceTokenHash: { type: String, select: false },
    tokenIssuedAt: { type: Date },
    pairingStatus: {
      type: String,
      enum: ['pending', 'paired', 'revoked'],
      default: 'pending',
      required: true,
    },
    pairedAt: { type: Date },
    revokedAt: { type: Date },
    revokedReason: { type: String, trim: true, maxlength: 250 },
    revokedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

bleDeviceSchema.index({ deviceId: 1 }, { unique: true });
bleDeviceSchema.index({ deviceId: 1, pairingStatus: 1 });
// The admin fleet view sorts by how recently each device was heard from.
bleDeviceSchema.index({ pairingStatus: 1, lastSeenAt: -1 });

export const BleDevice = mongoose.model<IBleDevice>('BleDevice', bleDeviceSchema);
