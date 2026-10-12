// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AdminAccount {
  id: string;
  email: string;
  name?: string;
  role: 'admin';
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  account: { id: string; email: string; role: string; name?: string };
}

// ─── Shared ──────────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface UserRegistration {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: 'user';
  isApproved: boolean;
  approvalStatus: ApprovalStatus;
  municipality?: string;
  barangay?: string;
  streetAddress?: string;
  bloodType?: string;
  age?: number;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  faceCaptureFileId?: string;
  proofOfResidencyFileId?: string;
  rejectionReason?: string;
  approvedAt?: string;
  rejectedAt?: string;
  createdAt: string;
}

export type ResponderRole =
  | 'medic'
  | 'fire_responder'
  | 'police_responder'
  | 'ambulance_driver'
  | 'disaster_response'
  | 'general_responder';

export type DutyStatus =
  | 'off_duty'
  | 'on_duty'
  | 'busy'
  | 'available'
  | 'offline'
  | 'suspended'
  | 'inactive'
  | 'unavailable'
  | 'rejected'
  | 'pending'
  | 'not_approved';

export interface ResponderRegistration {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  streetAddress?: string;
  dateOfBirth?: string;
  age?: number;
  responderRole?: ResponderRole;
  assignedAmbulanceUnitId?: string;
  role: 'responder';
  isApproved: boolean;
  approvalStatus: ApprovalStatus;
  badgeId?: string;
  department?: string;
  agencyType?: string;
  stationName?: string;
  position?: string;
  coverageArea?: string;
  dutyStatus?: DutyStatus;
  isOnDuty?: boolean;
  currentLocation?: { latitude: number; longitude: number };
  faceCaptureFileId?: string;
  credentialFileId?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface AmbulanceUnitOption {
  _id: string;
  unitNumber: number;
  unitName?: string;
  plateNumber?: string;
  availabilityStatus: AmbulanceAvailability;
  assignedResponderId?: string;
}

// ─── Emergency ───────────────────────────────────────────────────────────────

export type EmergencyType = 'medical' | 'crime' | 'fire' | 'general_sos';
/** `iot_device` is the fingerprint + panic-button wearable. */
export type EmergencySource = 'mobile_app' | 'iot_keychain' | 'iot_device';
export type EmergencyPriority = 'low' | 'medium' | 'high' | 'critical';
/**
 * `pending` means the incident is live but has no coordinates yet. The panic
 * button raises its alert on the button press and only then starts searching for
 * a GNSS fix, so `currentLocation` is genuinely absent until the first fix lands.
 */
export type EmergencyLocationStatus = 'pending' | 'fixed';
export type EmergencyStatus =
  | 'pending' | 'assigned' | 'responder_on_the_way' | 'responder_nearby'
  | 'arrived' | 'resolved' | 'cancelled';

export interface UserSnapshot {
  fullName?: string;
  age?: number;
  dateOfBirth?: string;
  phone?: string;
  faceCaptureFileId?: string;
  proofOfResidencyFileId?: string;
  bloodType?: string;
  streetAddress?: string;
  barangay?: string;
  municipality?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
  accuracyMeters?: number;
  capturedAt?: string;
}

export interface TimelineEvent {
  event: string;
  at: string;
  actorId?: string;
  actorRole?: string;
  note?: string;
  reportType?: 'arrival' | 'field_report' | 'follow_up' | 'resolution_request';
  reportStatus?: 'submitted' | 'reviewed' | 'needs_update' | 'accepted';
}

export interface Emergency {
  _id: string;
  type: EmergencyType;
  source: EmergencySource;
  priority: EmergencyPriority;
  status: EmergencyStatus;
  userId: string;
  assignedResponderId?: string;
  /** Absent while `locationStatus` is `pending`. */
  currentLocation?: GeoPoint;
  locationStatus: EmergencyLocationStatus;
  locationRevision: number;
  locationFirstFixAt?: string;
  lastLocationAt?: string;
  trackingActive: boolean;
  isInsideTanza: boolean;
  outsideScopeFlag: boolean;
  barangay?: string;
  municipality?: string;
  notes?: string;
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
  userSnapshot?: UserSnapshot;
  timeline: TimelineEvent[];
  resolvedAt?: string;
  resolvedBy?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Panic-button devices ─────────────────────────────────────────────────────

export type DeviceLinkStatus = 'online' | 'idle' | 'offline' | 'unpaired';

/**
 * Why a device could not raise an alert as it stands.
 *
 * `not_enrolled` is the one that matters: a paired device with no fingerprint
 * template physically cannot send an SOS, because the firmware requires a verified
 * finger before it accepts the button.
 */
export type DeviceReadiness =
  | 'ready'
  | 'not_enrolled'
  | 'unpaired'
  | 'owner_not_approved';

export interface DeviceOwner {
  id: string;
  name?: string;
  phone?: string;
  barangay?: string;
  approvalStatus?: string;
  isApproved: boolean;
}

export interface PanicDevice {
  id: string;
  deviceId: string;
  linkStatus: DeviceLinkStatus;
  readiness: DeviceReadiness;
  lastSeenAt?: string;
  lastCheckInAt?: string;
  secondsSinceSeen?: number;
  owner?: DeviceOwner;
  firmwareVersion?: string;
  batteryPercent?: number;
  fingerprintEnrolled: boolean;
  directCellularEnabled: boolean;
  lastTransport?: 'ble' | 'lte';
  pairedAt?: string;
  revokedAt?: string;
  revokedReason?: string;
  activeIncident?: {
    id: string;
    status: string;
    locationStatus: string;
    locationRevision: number;
    createdAt: string;
  };
  totalIncidents: number;
}

export interface DeviceFleetSummary {
  total: number;
  online: number;
  idle: number;
  offline: number;
  unpaired: number;
  needsAttention: number;
  tracking: number;
}

export interface DeviceFleet extends Paginated<PanicDevice> {
  summary: DeviceFleetSummary;
  thresholds: { onlineWithinSeconds: number; idleWithinSeconds: number };
}

// ─── Responder live location ──────────────────────────────────────────────────

export interface ResponderLiveLocation {
  responderId: string;
  name: string;
  agencyType?: string;
  dutyStatus?: string;
  currentLocation?: { latitude: number; longitude: number };
  lastSeen?: string;
}

// ─── Ambulance ────────────────────────────────────────────────────────────────

export type AmbulanceAvailability = 'available' | 'assigned' | 'maintenance' | 'out_of_service';
export type AmbulanceRequestType = 'emergency' | 'schedule' | 'transfer';
export type AmbulanceRequestStatus =
  | 'pending_review' | 'approved' | 'rejected' | 'assigned'
  | 'on_the_way' | 'arrived_pickup' | 'patient_onboard' | 'completed' | 'cancelled';

export interface AmbulanceUnit {
  _id: string;
  unitNumber: number;
  availabilityStatus: AmbulanceAvailability;
  assignedResponderId?: string;
  activeRequestId?: string;
  assignmentStartAt?: string;
  assignmentEndAt?: string;
}

export interface GeoLocationLabeled {
  type: 'Point';
  coordinates: [number, number];
  addressLabel: string;
  accuracyMeters?: number;
}

export interface PatientInfo {
  fullName: string;
  address: string;
  contactNumber: string;
  medicalCondition: string;
  specialRequirements?: string;
}

export interface SenderSnapshot {
  fullName?: string;
  age?: number;
  bloodType?: string;
  municipality?: string;
  barangay?: string;
  proofOfIndigencyFileId?: string;
  validIdFileId?: string;
  faceCaptureFileId?: string;
  proofOfResidencyFileId?: string;
}

export interface AmbulanceRequest {
  _id: string;
  requestType: AmbulanceRequestType;
  status: AmbulanceRequestStatus;
  senderUserId: string;
  senderSnapshot?: SenderSnapshot;
  patient: PatientInfo;
  accompanyingPerson?: { fullName: string; contactNumber: string };
  pickupLocation: GeoLocationLabeled;
  dropOffLocation: GeoLocationLabeled;
  requestedDate?: string;
  requestedTime?: string;
  transferDetails?: { originHospitalName?: string; destinationHospitalName?: string; referringDoctor?: string };
  notes?: string;
  isEmergencyPriority: boolean;
  isTanzaCitizenPriority: boolean;
  requiresImmediateReview: boolean;
  outsideScopeFlag: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  approvalNotes?: string;
  assignedAmbulanceUnitId?: string;
  assignedResponderId?: string;
  assignedAt?: string;
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLog {
  _id: string;
  actorId?: string;
  actorName?: string;
  actorRole: 'user' | 'responder' | 'admin' | 'system';
  action: string;
  module?: string;
  description?: string;
  reason?: string;
  severity?: AuditSeverity;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
  createdAt: string;
}

// ─── Paginated response ───────────────────────────────────────────────────────

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Socket event payloads ───────────────────────────────────────────────────

export interface EmergencyEventPayload {
  emergencyId: string;
  status: EmergencyStatus;
  type: EmergencyType;
  source: EmergencySource;
  priority: EmergencyPriority;
  userId: string;
  assignedResponderId?: string;
  isInsideTanza: boolean;
  outsideScopeFlag: boolean;
  barangay?: string;
  location?: GeoPoint;
  locationStatus: EmergencyLocationStatus;
  locationRevision: number;
  trackingActive: boolean;
  sourceDeviceId?: string;
  userSnapshot?: UserSnapshot;
  occurredAt: string;
}

export interface AmbulanceEventPayload {
  requestId: string;
  requestType: AmbulanceRequestType;
  status: AmbulanceRequestStatus;
  senderUserId: string;
  assignedResponderId?: string;
  assignedAmbulanceUnitId?: string;
  isEmergencyPriority: boolean;
  occurredAt: string;
}
