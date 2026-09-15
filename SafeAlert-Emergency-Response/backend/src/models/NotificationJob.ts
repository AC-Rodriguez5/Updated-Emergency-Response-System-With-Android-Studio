import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  eventId: { type: String, required: true, unique: true }, emergencyId: { type: String, required: true },
  event: { type: String, required: true }, status: { type: String, enum: ['pending', 'processing', 'sent', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now }, lockedUntil: Date,
  deliveredDeviceIds: { type: [String], default: [] }, lastError: String, createdAt: { type: Date, default: Date.now, expires: 2592000 },
});
schema.index({ status: 1, nextAttemptAt: 1 });
export default mongoose.model('NotificationJob', schema);
