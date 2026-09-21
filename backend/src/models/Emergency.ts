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

export interface ITimelineEvent {
  event: string;
  at: Date;
  actorId?: mongoose.Types.ObjectId;
  actorRole?: 'user' | 'responder' | 'admin' | 'system';
  note?: string;
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
  currentLocation: {
    type: 'Point';
    coordinates: [number, number];
    accuracyMeters?: number;
    capturedAt: Date;
  };
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
    currentLocation: {
      type: { type: String, enum: ['Point'], required: true, default: 'Point' },
      coordinates: { type: [Number], required: true },
      accuracyMeters: { type: Number, min: 0, max: 5000 },
      capturedAt: { type: Date, required: true },
    },
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
emergencySchema.index({ currentLocation: '2dsphere' });
emergencySchema.index({ outsideScopeFlag: 1, status: 1 });

export const Emergency = mongoose.model<IEmergency>('Emergency', emergencySchema);
