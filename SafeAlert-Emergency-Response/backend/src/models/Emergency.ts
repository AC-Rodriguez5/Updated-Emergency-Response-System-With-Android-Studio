import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { emergencyTypes, statuses } from '../shared/http.ts';
export const geoLocationSchema = new Schema({
  lat: { type: Number, required: true }, lng: { type: Number, required: true },
  accuracyMeters: { type: Number, required: true }, capturedAt: { type: Date, required: true },
  locationFreshness: { type: String, enum: ['current', 'last_known'], default: 'current' },
}, { _id: false });
const eventSchema = new Schema({
  id: { type: String, required: true }, name: { type: String, required: true },
  at: { type: Date, required: true }, actorId: String, actorRole: String, reason: String, from: String, to: String,
}, { _id: false });
const emergencySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  assignedResponderId: { type: Schema.Types.ObjectId, ref: 'Responder' },
  type: { type: String, enum: emergencyTypes, required: true }, source: { type: String, enum: ['mobile_app', 'iot_ble'], required: true },
  status: { type: String, enum: statuses, default: 'pending', required: true },
  coverageArea: { type: String, required: true, lowercase: true, trim: true },
  location: { type: geoLocationSchema, required: true }, responderLocation: geoLocationSchema,
  currentLocation: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
  idempotencyKey: { type: String, required: true }, requestHash: { type: String, required: true },
  notes: { type: String, maxlength: 500 }, bleEventId: String, deviceId: String,
  timeline: { type: [eventSchema], default: [] }, outbox: { type: [eventSchema], default: [], select: false },
  report: { arrivalTimestamp: Date, situationNotes: String, actionTaken: String, photoIds: [String] },
  assignedAt: Date, responderOnTheWayAt: Date, responderNearbyAt: Date, reportSubmittedAt: Date,
  resolvedAt: Date, resolvedByAdminId: String, resolutionNotes: String, cancellationReason: String,
}, { timestamps: true });
emergencySchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
emergencySchema.index({ userId: 1, deviceId: 1, bleEventId: 1 }, { unique: true, partialFilterExpression: { bleEventId: { $type: 'string' } } });
emergencySchema.index({ status: 1, coverageArea: 1, type: 1, createdAt: -1 });
emergencySchema.index({ userId: 1, createdAt: -1 });
emergencySchema.index({ assignedResponderId: 1, status: 1 });
emergencySchema.index({ currentLocation: '2dsphere' });
export type EmergencyRecord = InferSchemaType<typeof emergencySchema>;
export default mongoose.model('Emergency', emergencySchema);
