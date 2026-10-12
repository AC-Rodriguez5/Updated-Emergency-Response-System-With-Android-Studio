import mongoose, { Schema } from 'mongoose';
const bleDeviceSchema = new Schema({
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
}, { timestamps: true });
bleDeviceSchema.index({ deviceId: 1 }, { unique: true });
bleDeviceSchema.index({ deviceId: 1, pairingStatus: 1 });
// The admin fleet view sorts by how recently each device was heard from.
bleDeviceSchema.index({ pairingStatus: 1, lastSeenAt: -1 });
export const BleDevice = mongoose.model('BleDevice', bleDeviceSchema);
