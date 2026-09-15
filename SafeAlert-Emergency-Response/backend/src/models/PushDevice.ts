import mongoose, { Schema } from 'mongoose';
const schema = new Schema({ sessionId: { type: String, required: true, index: true }, accountId: { type: String, required: true }, role: { type: String, required: true }, deviceId: { type: String, required: true }, token: { type: String, required: true, select: false }, platform: { type: String, enum: ['android'], required: true }, lastSeenAt: { type: Date, default: Date.now } }, { timestamps: true });
schema.index({ accountId: 1, deviceId: 1 }, { unique: true });
schema.index({ token: 1 }, { unique: true });
export default mongoose.model('PushDevice', schema);

