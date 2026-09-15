import mongoose, { Schema, Document } from 'mongoose';
export interface IAdminUser extends Document {
  name: string; email: string; username?: string; passwordHash: string; role: 'admin';
  status: 'approved' | 'suspended'; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IAdminUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin'], default: 'admin' },
  status: { type: String, enum: ['approved', 'suspended'], default: 'approved' },
}, { timestamps: true });
export const AdminUser = mongoose.models.AdminUser as mongoose.Model<IAdminUser> || mongoose.model<IAdminUser>('AdminUser', schema);
export default AdminUser;
