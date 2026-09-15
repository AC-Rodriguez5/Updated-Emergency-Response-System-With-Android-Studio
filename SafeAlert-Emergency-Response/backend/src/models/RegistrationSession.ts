import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  role: { type: String, enum: ['user', 'responder'], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: Date,
}, { timestamps: true });
export const RegistrationSession = mongoose.models.RegistrationSession || mongoose.model('RegistrationSession', schema);
export default RegistrationSession;
