import mongoose, { Schema, Document } from 'mongoose';

export interface IBleDevice extends Document {
  userId: mongoose.Types.ObjectId;
  deviceId: string;
  deviceName: string;
  firmwareVersion?: string;
  lastPairedAt: Date;
  lastSeenAt: Date;
  batteryLevel?: number;
  status: 'active' | 'inactive' | 'unpaired';
  createdAt: Date;
  updatedAt: Date;
}

const BleDeviceSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: { type: String, required: true, unique: true, index: true },
  deviceName: { type: String, required: true },
  firmwareVersion: { type: String },
  lastPairedAt: { type: Date, required: true, default: Date.now },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  batteryLevel: { type: Number, min: 0, max: 100 },
  status: { type: String, enum: ['active', 'inactive', 'unpaired'], default: 'active', index: true }
}, { timestamps: true });

export default mongoose.model<IBleDevice>('BleDevice', BleDeviceSchema);