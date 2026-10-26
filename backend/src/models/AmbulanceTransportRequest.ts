import mongoose, { Schema, Document } from 'mongoose';

import {
  CONSENT_BASES,
  CONSENT_SCOPES,
  type ConsentBasis,
  type ConsentScope,
} from '../shared/consent.js';

export type AmbulanceRequestType = 'emergency' | 'schedule' | 'transfer';
export type AmbulanceRequestStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'assigned'
  | 'on_the_way'
  | 'arrived_pickup'
  | 'patient_onboard'
  | 'completed'
  | 'cancelled';

export interface IGeoLocationLabeled {
  type: 'Point';
  coordinates: [number, number];
  addressLabel: string;
  accuracyMeters?: number;
}

export interface IPatientInfo {
  fullName: string;
  address: string;
  contactNumber: string;
  medicalCondition: string;
  specialRequirements?: string;
}

export interface IAccompanyingPerson {
  fullName: string;
  contactNumber: string;
}

export interface ITransferDetails {
  originHospitalName?: string;
  destinationHospitalName?: string;
  referringDoctor?: string;
}

export interface ISenderSnapshot {
  fullName?: string;
  age?: number;
  dateOfBirth?: Date;
  bloodType?: string;
  proofOfIndigencyFileId?: mongoose.Types.ObjectId;
  validIdFileId?: mongoose.Types.ObjectId;
  faceCaptureFileId?: mongoose.Types.ObjectId;
  proofOfResidencyFileId?: mongoose.Types.ObjectId;
  municipality?: string;
  barangay?: string;
}

/**
 * Why TanzAlert may hold this booking's contents, recorded with the booking.
 *
 * A transport request carries a named patient, their contact and their medical
 * condition — sensitive personal information, and often about somebody who
 * is not the account holder. The evidence that it was lawfully collected
 * belongs on the record it was collected for, not only on the account.
 */
export interface IRequestConsent {
  basis: ConsentBasis;
  /** The wording agreed to. Absent when the basis is not consent. */
  version?: string;
  scopes: ConsentScope[];
  recordedAt: Date;
}

export interface IAmbulanceTimelineEvent {
  event: string;
  at: Date;
  actorId?: mongoose.Types.ObjectId;
  actorRole?: 'user' | 'responder' | 'admin' | 'system';
  note?: string;
}

export interface IAmbulanceTransportRequest extends Document {
  requestType: AmbulanceRequestType;
  status: AmbulanceRequestStatus;
  senderUserId: mongoose.Types.ObjectId;
  senderSnapshot: ISenderSnapshot;
  /*
    Optional because the retention sweep erases them from a long-finished
    booking. Everything that reads one has to cope with a record whose personal
    contents are gone and whose skeleton — type, status, dates, unit, barangay,
    timeline — remains. See `personalDataRedactedAt`.
  */
  patient?: IPatientInfo;
  accompanyingPerson?: IAccompanyingPerson;
  pickupLocation?: IGeoLocationLabeled;
  dropOffLocation?: IGeoLocationLabeled;
  requestedDate?: Date;
  requestedTime?: string;
  estimatedPickupDurationMin?: number;
  estimatedTransportDurationMin?: number;
  transferDetails?: ITransferDetails;
  notes?: string;
  consent?: IRequestConsent;
  /**
   * When the retention sweep erased this booking's personal contents.
   *
   * Set so a bare old record reads as erased on schedule rather than as one
   * that was never filled in, and so the sweep never touches it twice.
   */
  personalDataRedactedAt?: Date;

  isEmergencyPriority: boolean;
  isTanzaCitizenPriority: boolean;
  requiresImmediateReview: boolean;
  outsideScopeFlag: boolean;

  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  rejectionReason?: string;
  approvalNotes?: string;
  priorityDecision?: string;

  assignedAmbulanceUnitId?: mongoose.Types.ObjectId;
  assignedResponderId?: mongoose.Types.ObjectId;
  assignedDriverId?: mongoose.Types.ObjectId;
  assignedAt?: Date;
  reservedFromAt?: Date;
  reservedUntilAt?: Date;

  timeline: mongoose.Types.DocumentArray<IAmbulanceTimelineEvent & mongoose.Types.Subdocument>;

  createdAt: Date;
  updatedAt: Date;
}

const geoLocationLabeledSchema = new Schema<IGeoLocationLabeled>(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true },
    addressLabel: { type: String, required: true, trim: true, minlength: 3, maxlength: 250 },
    accuracyMeters: { type: Number, min: 0, max: 5000 },
  },
  { _id: false },
);

const requestConsentSchema = new Schema<IRequestConsent>(
  {
    basis: { type: String, enum: CONSENT_BASES, required: true },
    version: { type: String, trim: true, maxlength: 20 },
    scopes: { type: [String], enum: CONSENT_SCOPES, required: true, default: [] },
    recordedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const patientSchema = new Schema<IPatientInfo>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    contactNumber: { type: String, required: true, trim: true, maxlength: 20 },
    medicalCondition: { type: String, required: true, trim: true, maxlength: 500 },
    specialRequirements: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const accompanyingPersonSchema = new Schema<IAccompanyingPerson>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    contactNumber: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const transferDetailsSchema = new Schema<ITransferDetails>(
  {
    originHospitalName: { type: String, trim: true, maxlength: 180 },
    destinationHospitalName: { type: String, trim: true, maxlength: 180 },
    referringDoctor: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const senderSnapshotSchema = new Schema<ISenderSnapshot>(
  {
    fullName: { type: String, trim: true, maxlength: 120 },
    age: { type: Number, min: 0, max: 150 },
    dateOfBirth: { type: Date },
    bloodType: { type: String, trim: true, maxlength: 8 },
    proofOfIndigencyFileId: { type: Schema.Types.ObjectId },
    validIdFileId: { type: Schema.Types.ObjectId },
    faceCaptureFileId: { type: Schema.Types.ObjectId },
    proofOfResidencyFileId: { type: Schema.Types.ObjectId },
    municipality: { type: String, trim: true, maxlength: 120 },
    barangay: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const ambulanceTimelineSchema = new Schema<IAmbulanceTimelineEvent>(
  {
    event: { type: String, required: true, trim: true, maxlength: 80 },
    at: { type: Date, required: true, default: Date.now },
    actorId: { type: Schema.Types.ObjectId },
    actorRole: { type: String, enum: ['user', 'responder', 'admin', 'system'] },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: true },
);

const ambulanceTransportRequestSchema = new Schema<IAmbulanceTransportRequest>(
  {
    requestType: { type: String, enum: ['emergency', 'schedule', 'transfer'], required: true },
    status: {
      type: String,
      enum: [
        'pending_review',
        'approved',
        'rejected',
        'assigned',
        'on_the_way',
        'arrived_pickup',
        'patient_onboard',
        'completed',
        'cancelled',
      ],
      default: 'pending_review',
      required: true,
    },
    senderUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderSnapshot: { type: senderSnapshotSchema, default: {} },
    patient: { type: patientSchema, required: false },
    accompanyingPerson: { type: accompanyingPersonSchema },
    pickupLocation: { type: geoLocationLabeledSchema, required: false },
    dropOffLocation: { type: geoLocationLabeledSchema, required: false },

    requestedDate: { type: Date },
    requestedTime: { type: String, trim: true, maxlength: 5 },
    estimatedPickupDurationMin: { type: Number, min: 0, max: 1440 },
    estimatedTransportDurationMin: { type: Number, min: 0, max: 1440 },
    transferDetails: { type: transferDetailsSchema },
    notes: { type: String, trim: true, maxlength: 500 },
    consent: { type: requestConsentSchema, required: false },
    personalDataRedactedAt: { type: Date },

    isEmergencyPriority: { type: Boolean, default: false, required: true },
    isTanzaCitizenPriority: { type: Boolean, default: false, required: true },
    requiresImmediateReview: { type: Boolean, default: false, required: true },
    outsideScopeFlag: { type: Boolean, default: false, required: true },

    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    approvalNotes: { type: String, trim: true, maxlength: 500 },
    priorityDecision: { type: String, trim: true, maxlength: 120 },

    assignedAmbulanceUnitId: { type: Schema.Types.ObjectId, ref: 'AmbulanceUnit' },
    assignedResponderId: { type: Schema.Types.ObjectId, ref: 'Responder' },
    assignedDriverId: { type: Schema.Types.ObjectId, ref: 'Responder' },
    assignedAt: { type: Date },
    reservedFromAt: { type: Date },
    reservedUntilAt: { type: Date },

    timeline: { type: [ambulanceTimelineSchema], default: [] },
  },
  { timestamps: true },
);

ambulanceTransportRequestSchema.index({ status: 1, createdAt: -1 });
ambulanceTransportRequestSchema.index({ senderUserId: 1, createdAt: -1 });
ambulanceTransportRequestSchema.index({ assignedAmbulanceUnitId: 1, status: 1 });
ambulanceTransportRequestSchema.index({ assignedResponderId: 1, status: 1 });
ambulanceTransportRequestSchema.index({ requestType: 1, status: 1 });
ambulanceTransportRequestSchema.index({ reservedFromAt: 1, reservedUntilAt: 1 });
ambulanceTransportRequestSchema.index({ pickupLocation: '2dsphere' });
ambulanceTransportRequestSchema.index({ dropOffLocation: '2dsphere' });

export const AmbulanceTransportRequest = mongoose.model<IAmbulanceTransportRequest>(
  'AmbulanceTransportRequest',
  ambulanceTransportRequestSchema,
);
