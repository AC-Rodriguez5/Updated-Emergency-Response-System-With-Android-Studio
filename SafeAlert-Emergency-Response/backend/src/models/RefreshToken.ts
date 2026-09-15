import mongoose, { Schema, Document } from 'mongoose';
export interface IRefreshToken extends Document {
  accountId: string; role: 'user' | 'responder' | 'admin'; tokenHash: string;
  familyId: string; expiresAt: Date; consumedAt?: Date; revokedAt?: Date; createdAt: Date;
}
const schema = new Schema<IRefreshToken>({
  accountId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'responder', 'admin'], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  familyId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: Date, revokedAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } });
export const RefreshToken = mongoose.models.RefreshToken as mongoose.Model<IRefreshToken> || mongoose.model<IRefreshToken>('RefreshToken', schema);
export default RefreshToken;

// Session revocation is authoritative even if refresh rotation races with logout/reuse.
const sessionSchema = new Schema({
  _id: { type: String, required: true }, accountId: { type: String, required: true, index: true },
  role: { type: String, enum: ['user', 'responder', 'admin'], required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, revokedAt: Date,
}, { timestamps: true });
export const AuthSession = mongoose.models.AuthSession || mongoose.model('AuthSession', sessionSchema);
