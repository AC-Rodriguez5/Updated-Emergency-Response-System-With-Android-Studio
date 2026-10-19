import mongoose, { Schema, Document } from 'mongoose';

export type EmergencyType = 'medical' | 'crime' | 'fire' | 'general_sos';
export type EmergencySource = 'mobile_app' | 'iot_keychain' | 'iot_device';
export type EmergencyPriority = 'low' | 'medium' | 'high' | 'critical';
export type EmergencyStatus =
  | 'pending'
  | 'assigned'
  | 'responder_on_the_way'
  | 'responder_nearby'
  | 'arrived'
  | 'resolved'
  | 'cancelled';

/**
 * `pending` means the incident exists but no position is known yet. The hardware
 * panic button deliberately raises the alert on the button press and only then
 * starts hunting for a GNSS fix, so an incident can live for a minute or two with
 * no coordinates at all. Every consumer must treat `currentLocation` as absent
 * while this is `pending`.
 */
export type EmergencyLocationStatus = 'pending' | 'fixed';

/**
 * Who a note on the incident is for.
 *
 * `dispatch` is the working channel between a dispatcher and the responder, and
 * the person in the emergency never sees it: "scene not secure, hold back" is
 * necessary to say and would be terrifying to read about yourself. `all` is
 * deliberately addressed to them as well.
 */
export type TimelineAudience = 'dispatch' | 'all';

export interface ITimelineEvent {
  event: string;
  at: Date;
  actorId?: mongoose.Types.ObjectId;
  actorRole?: 'user' | 'responder' | 'admin' | 'system';
  note?: string;
  /**
   * A canned update picked from a list rather than typed — `on_scene`,
   * `need_backup`, `transporting`. One tap beats a paragraph when the sender is
   * holding a torch, and every reader renders the same words for it.
   */
  code?: string;
  audience?: TimelineAudience;
  reportType?: 'arrival' | 'field_report' | 'follow_up' | 'resolution_request';
  reportStatus?: 'submitted' | 'reviewed' | 'needs_update' | 'accepted';
}

export interface IEmergencyUserSnapshot {
  fullName?: string;
  age?: number;
  dateOfBirth?: Date;
  phone?: string;
  faceCaptureFileId?: mongoose.Types.ObjectId;
  proofOfResidencyFileId?: mongoose.Types.ObjectId;
  bloodType?: string;
  streetAddress?: string;
  barangay?: string;
  municipality?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
}

export interface IEmergency extends Document {
  type: EmergencyType;
  source: EmergencySource;
  priority: EmergencyPriority;
  status: EmergencyStatus;
  userId: mongoose.Types.ObjectId;
  assignedResponderId?: mongoose.Types.ObjectId;
  /**
   * When the assigned responder confirmed they are taking it.
   *
   * A responder who accepts from the feed acknowledges by the act of accepting.
   * A dispatcher's assignment does not: assigning a phone in someone's pocket is
   * not the same as assigning a person, so it stays empty until the responder
   * answers, and [assignmentDeadlineAt] decides how long that may take.
   */
  assignmentAckAt?: Date;
  /** When an unanswered assignment stops being believed. */
  assignmentDeadlineAt?: Date;
  /** Set by the dispatch watchdog when nobody has taken an incident in time. */
  dispatchOverdueAt?: Date;
  currentLocation?: {
    type: 'Point';
    coordinates: [number, number];
    accuracyMeters?: number;
    capturedAt: Date;
  };
  locationStatus: EmergencyLocationStatus;
  locationRevision: number;
  locationFirstFixAt?: Date;
  /**
   * When the retention sweep erased this incident's coordinates.
   *
   * Set so an old incident with no position reads as erased on schedule rather
   * than as one where the fix never arrived. `locationStatus` is left as it
   * was: it describes what happened during the incident, which is still true.
   */
  locationRedactedAt?: Date;
  lastLocationAt?: Date;
  trackingActive: boolean;
  isInsideTanza: boolean;
  barangay?: string;
  municipality?: string;
  outsideScopeFlag: boolean;
  bleEventId?: string;
  hardwareEventId?: string;
  sourceDeviceId?: string;
  buttonType?: EmergencyType;
  deviceBatteryAtTrigger?: number;
  hardwareAuthMethod?: 'fingerprint';
  gnssHdop?: number;
  gnssSatellites?: number;
  deliveryTransports?: Array<'ble' | 'lte'>;
  idempotencyKey?: string;
  notes?: string;
  userSnapshot?: IEmergencyUserSnapshot;
  timeline: mongoose.Types.DocumentArray<ITimelineEvent & mongoose.Types.Subdocument>;
  resolvedAt?: Date;
  resolvedBy?: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const timelineEventSchema = new Schema<ITimelineEvent>(
  {
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
  },
  { _id: true },
);

const userSnapshotSchema = new Schema<IEmergencyUserSnapshot>(
  {
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
  },
  { _id: false },
);

// A single-nested schema rather than an inline nested path. A nested path with a
// `default` on `type` makes Mongoose materialise `{ type: 'Point' }` with no
// coordinates the moment the parent document is created, and MongoDB rejects that
// half-built shape when it reaches the 2dsphere index. As a subdocument the field
// stays genuinely absent until a real fix arrives, and a 2dsphere index already
// skips documents that do not have the field at all.
const currentLocationSchema = new Schema<NonNullable<IEmergency['currentLocation']>>(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true },
    accuracyMeters: { type: Number, min: 0, max: 5000 },
    capturedAt: { type: Date, required: true },
  },
  { _id: false },
);

const emergencySchema = new Schema<IEmergency>(
  {
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
    locationRedactedAt: { type: Date },
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
  },
  { timestamps: true },
);

emergencySchema.index({ status: 1, createdAt: -1 });
emergencySchema.index({ userId: 1, createdAt: -1 });
emergencySchema.index({ assignedResponderId: 1, status: 1 });
emergencySchema.index({ source: 1, createdAt: -1 });
emergencySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
emergencySchema.index(
  { userId: 1, sourceDeviceId: 1, hardwareEventId: 1 },
  {
    unique: true,
    partialFilterExpression: { hardwareEventId: { $type: 'string' } },
  },
);
// The dispatch watchdog sweeps on exactly these two shapes.
emergencySchema.index({ status: 1, assignmentDeadlineAt: 1 });
emergencySchema.index({ status: 1, dispatchOverdueAt: 1, createdAt: 1 });
emergencySchema.index({ currentLocation: '2dsphere' });
emergencySchema.index({ outsideScopeFlag: 1, status: 1 });
// The panic button re-posts its position every few seconds against this triple.
emergencySchema.index({ sourceDeviceId: 1, hardwareEventId: 1, trackingActive: 1 });

export const Emergency = mongoose.model<IEmergency>('Emergency', emergencySchema);
