import mongoose, { Schema, Document } from 'mongoose';
export interface IAuditLog extends Document {
  actorId: string; actorRole: 'user' | 'responder' | 'admin' | 'system'; action: string;
  targetId?: string; targetType?: string; reason?: string; details?: Record<string, unknown>;
  adminId?: mongoose.Types.ObjectId; targetAccountId?: mongoose.Types.ObjectId; targetEmergencyId?: mongoose.Types.ObjectId;
  createdAt: Date;
}
const schema = new Schema<IAuditLog>({
  actorId: { type: String, required: true, immutable: true },
  actorRole: { type: String, enum: ['user', 'responder', 'admin', 'system'], required: true, immutable: true },
  action: { type: String, required: true, immutable: true },
  targetId: { type: String, immutable: true }, targetType: { type: String, immutable: true },
  reason: { type: String, immutable: true }, details: { type: Schema.Types.Mixed, immutable: true },
  adminId: { type: Schema.Types.ObjectId, immutable: true },
  targetAccountId: { type: Schema.Types.ObjectId, immutable: true }, targetEmergencyId: { type: Schema.Types.ObjectId, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ createdAt: -1 });
schema.index({ targetId: 1, createdAt: -1 });
export const AuditLog = mongoose.models.AuditLog as mongoose.Model<IAuditLog> || mongoose.model<IAuditLog>('AuditLog', schema);
export default AuditLog;
