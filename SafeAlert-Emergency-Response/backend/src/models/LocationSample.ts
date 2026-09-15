import mongoose, { Schema } from 'mongoose';
import { geoLocationSchema } from './Emergency.ts';
const schema = new Schema({
  emergencyId: { type: Schema.Types.ObjectId, index: true }, actorId: { type: String, required: true },
  actorType: { type: String, enum: ['user','responder'], required: true }, location: { type: geoLocationSchema, required: true },
  capturedAt: { type: Date, required: true }, createdAt: { type: Date, default: Date.now, expires: 2592000 },
});
schema.index({ emergencyId: 1, createdAt: -1 });
schema.index({ actorId: 1, capturedAt: 1 }, { unique: true });
export default mongoose.model('LocationSample', schema);
