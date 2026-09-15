import mongoose, { Schema, Document } from 'mongoose';
export interface IResponder extends Document {
  name: string; email: string; passwordHash: string; phone: string; dateOfBirth: Date; age: number;
  address: string; consentLocation: boolean;
  agencyType: 'police' | 'fire' | 'medical' | 'rescue' | 'other'; departmentName: string;
  responderRole: string; credentialNumber?: string; coverageArea: string;
  proofOfResidencyId?: mongoose.Types.ObjectId; faceCaptureId?: mongoose.Types.ObjectId; credentialId?: mongoose.Types.ObjectId;
  credentialUrl?: string; faceCaptureUrl?: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended'; role: 'responder'; isOnDuty: boolean;
  rejectionReason?: string; reviewedAt?: Date; reviewedBy?: mongoose.Types.ObjectId;
  pushToken?: string; registrationPushDeviceId?: string; registrationPushPlatform?: 'android'; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IResponder>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false }, phone: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true }, age: { type: Number, required: true },
  address: { type: String, trim: true }, consentLocation: { type: Boolean, default: false },
  agencyType: { type: String, enum: ['police', 'fire', 'medical', 'rescue', 'other'], required: true, index: true },
  departmentName: { type: String, required: true, trim: true }, responderRole: { type: String, required: true, trim: true },
  credentialNumber: { type: String, trim: true }, coverageArea: { type: String, required: true, trim: true, lowercase: true, index: true },
  proofOfResidencyId: { type: Schema.Types.ObjectId, ref: 'UploadedFile' },
  faceCaptureId: { type: Schema.Types.ObjectId, ref: 'UploadedFile' },
  credentialId: { type: Schema.Types.ObjectId, ref: 'UploadedFile' },
  credentialUrl: { type: String, select: false }, faceCaptureUrl: { type: String, select: false },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending', index: true },
  role: { type: String, enum: ['responder'], default: 'responder' }, isOnDuty: { type: Boolean, default: false },
  rejectionReason: String, reviewedAt: Date, reviewedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
  pushToken: { type: String, select: false },
  registrationPushDeviceId: { type: String, select: false }, registrationPushPlatform: { type: String, enum:['android'], select:false },
}, { timestamps: true });
schema.index({ createdAt: -1 });
export const Responder = mongoose.models.Responder as mongoose.Model<IResponder> || mongoose.model<IResponder>('Responder', schema);
export default Responder;
