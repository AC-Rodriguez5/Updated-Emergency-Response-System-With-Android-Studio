import mongoose, { Schema } from 'mongoose';
const timelineEventSchema = new Schema({
    event: { type: String, required: true, trim: true, maxlength: 80 },
    at: { type: Date, required: true, default: Date.now },
    actorId: { type: Schema.Types.ObjectId },
    actorRole: { type: String, enum: ['user', 'responder', 'admin', 'system'] },
    note: { type: String, trim: true, maxlength: 1000 },
    code: { type: String, trim: true, maxlength: 40 },
    audience: { type: String, enum: ['dispatch', 'all'] },
    reportType: {
        type: String,
        enum: ['arrival', 'field_report', 'follow_up', 'resolution_request'],
    },
    reportStatus: {
        type: String,
        enum: ['submitted', 'reviewed', 'needs_update', 'accepted'],
    },
}, { _id: true });
const userSnapshotSchema = new Schema({
    fullName: { type: String, trim: true, maxlength: 120 },
    age: { type: Number, min: 0, max: 150 },
    dateOfBirth: { type: Date },
    phone: { type: String, trim: true, maxlength: 20 },
    faceCaptureFileId: { type: Schema.Types.ObjectId },
    proofOfResidencyFileId: { type: Schema.Types.ObjectId },
    bloodType: { type: String, trim: true, maxlength: 8 },
    streetAddress: { type: String, trim: true, maxlength: 250 },
    barangay: { type: String, trim: true, maxlength: 120 },
    municipality: { type: String, trim: true, maxlength: 120 },
    emergencyContactName: { type: String, trim: true, maxlength: 120 },
    emergencyContactNumber: { type: String, trim: true, maxlength: 20 },
}, { _id: false });
// A single-nested schema rather than an inline nested path. A nested path with a
// `default` on `type` makes Mongoose materialise `{ type: 'Point' }` with no
// coordinates the moment the parent document is created, and MongoDB rejects that
// half-built shape when it reaches the 2dsphere index. As a subdocument the field
// stays genuinely absent until a real fix arrives, and a 2dsphere index already
// skips documents that do not have the field at all.
const currentLocationSchema = new Schema({
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true },
    accuracyMeters: { type: Number, min: 0, max: 5000 },
    capturedAt: { type: Date, required: true },
}, { _id: false });
const emergencySchema = new Schema({
    type: {
        type: String,
        enum: ['medical', 'crime', 'fire', 'general_sos'],
        required: true,
    },
    source: {
        type: String,
        enum: ['mobile_app', 'iot_keychain', 'iot_device'],
        required: true,
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
        required: true,
    },
    status: {
        type: String,
        enum: [
            'pending',
            'assigned',
            'responder_on_the_way',
            'responder_nearby',
            'arrived',
            'resolved',
            'cancelled',
        ],
        default: 'pending',
        required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedResponderId: { type: Schema.Types.ObjectId, ref: 'Responder' },
    assignmentAckAt: { type: Date },
    assignmentDeadlineAt: { type: Date },
    dispatchOverdueAt: { type: Date },
    currentLocation: { type: currentLocationSchema, required: false },
    locationStatus: {
        type: String,
        enum: ['pending', 'fixed'],
        default: 'fixed',
        required: true,
    },
    locationRevision: { type: Number, default: 0, min: 0, required: true },
    locationFirstFixAt: { type: Date },
    lastLocationAt: { type: Date },
    // True while the hardware button should keep streaming its position. Cleared
    // when the incident is resolved or cancelled, which is how the device learns
    // to stop transmitting.
    trackingActive: { type: Boolean, default: false, required: true },
    isInsideTanza: { type: Boolean, default: false, required: true },
    barangay: { type: String, trim: true, maxlength: 120 },
    municipality: { type: String, trim: true, maxlength: 120 },
    outsideScopeFlag: { type: Boolean, default: false, required: true },
    bleEventId: { type: String, trim: true, maxlength: 100 },
    hardwareEventId: { type: String, trim: true, maxlength: 100 },
    sourceDeviceId: { type: String, trim: true, maxlength: 100 },
    buttonType: { type: String, enum: ['medical', 'crime', 'fire', 'general_sos'] },
    deviceBatteryAtTrigger: { type: Number, min: 0, max: 100 },
    hardwareAuthMethod: { type: String, enum: ['fingerprint'] },
    gnssHdop: { type: Number, min: 0, max: 99 },
    gnssSatellites: { type: Number, min: 0, max: 100 },
    deliveryTransports: [{ type: String, enum: ['ble', 'lte'] }],
    idempotencyKey: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 500 },
    userSnapshot: { type: userSnapshotSchema },
    timeline: { type: [timelineEventSchema], default: [] },
    resolvedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId },
    cancelledAt: { type: Date },
}, { timestamps: true });
emergencySchema.index({ status: 1, createdAt: -1 });
emergencySchema.index({ userId: 1, createdAt: -1 });
emergencySchema.index({ assignedResponderId: 1, status: 1 });
emergencySchema.index({ source: 1, createdAt: -1 });
emergencySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
emergencySchema.index({ userId: 1, sourceDeviceId: 1, hardwareEventId: 1 }, {
    unique: true,
    partialFilterExpression: { hardwareEventId: { $type: 'string' } },
});
// The dispatch watchdog sweeps on exactly these two shapes.
emergencySchema.index({ status: 1, assignmentDeadlineAt: 1 });
emergencySchema.index({ status: 1, dispatchOverdueAt: 1, createdAt: 1 });
emergencySchema.index({ currentLocation: '2dsphere' });
emergencySchema.index({ outsideScopeFlag: 1, status: 1 });
// The panic button re-posts its position every few seconds against this triple.
emergencySchema.index({ sourceDeviceId: 1, hardwareEventId: 1, trackingActive: 1 });
export const Emergency = mongoose.model('Emergency', emergencySchema);
