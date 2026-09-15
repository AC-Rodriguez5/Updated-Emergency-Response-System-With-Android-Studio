import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  registrationSessionId: { type: Schema.Types.ObjectId, ref: 'RegistrationSession', index: true },
  ownerId: { type: String, index: true }, ownerRole: { type: String, enum: ['user', 'responder'] },
  emergencyId: { type: Schema.Types.ObjectId, ref: 'Emergency', index: true },
  purpose: { type: String, enum: ['proof_of_residency', 'face_capture', 'credential', 'response_photo'], required: true },
  source: { type: String, enum: ['camera', 'file'], required: true },
  mimeType: { type: String, required: true }, size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false }, sha256: { type: String, required: true, select: false },
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true });
export const UploadedFile = mongoose.models.UploadedFile || mongoose.model('UploadedFile', schema);
export default UploadedFile;
