import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string; email: string; passwordHash: string; phone: string;
  dateOfBirth: Date; age: number; address: string; coverageArea: string; consentLocation: boolean;
  proofOfResidencyId?: mongoose.Types.ObjectId; faceCaptureId?: mongoose.Types.ObjectId;
  proofOfResidencyUrl?: string; faceCaptureUrl?: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended'; role: 'user';
  rejectionReason?: string; reviewedAt?: Date; reviewedBy?: mongoose.Types.ObjectId;
  pushToken?: string; registrationPushDeviceId?: string; registrationPushPlatform?: 'android'; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true }, age: { type: Number, required: true },
  address: { type: String, required: true, trim: true },
  coverageArea: { type: String, trim: true, lowercase: true, index: true },
  proofOfResidencyId: { type: Schema.Types.ObjectId, ref: 'UploadedFile' },
  faceCaptureId: { type: Schema.Types.ObjectId, ref: 'UploadedFile' },
  proofOfResidencyUrl: { type: String, select: false }, faceCaptureUrl: { type: String, select: false },
  consentLocation: { type: Boolean, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending', index: true },
  role: { type: String, enum: ['user'], default: 'user' },
  rejectionReason: String, reviewedAt: Date, reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  pushToken: { type: String, select: false },
  registrationPushDeviceId: { type: String, select: false }, registrationPushPlatform: { type: String, enum:['android'], select:false },
}, { timestamps: true });
schema.index({ createdAt: -1 });
export const User = mongoose.models.User as mongoose.Model<IUser> || mongoose.model<IUser>('User', schema);
export default User;
