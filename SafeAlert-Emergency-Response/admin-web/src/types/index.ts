export type AccountRole = 'admin' | 'user' | 'responder';
export type RegistrationType = 'user' | 'responder';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export interface Account { id: string; name: string; email: string; role: AccountRole; status: RegistrationStatus }
export interface AuthSession { accessToken: string; refreshToken: string; account: Account }
export interface PageMeta { page: number; limit: number; total: number }
export interface Envelope<T> { data: T; requestId: string; meta?: PageMeta }
export interface Registration {
  id: string; type: RegistrationType; name: string; email: string; phone?: string;
  status: RegistrationStatus; dateOfBirth?: string; address?: string | Record<string, unknown>;
  municipality?: string; coverageArea?: string; agencyType?: string; department?: string;
  credentialNumber?: string; proofOfResidencyId?: string; faceCaptureId?: string; credentialId?: string;
  rejectionReason?: string; createdAt: string;
}
export interface GeoLocation { lat: number; lng: number; accuracyMeters?: number; capturedAt?: string }
export const emergencyStatuses = ['pending', 'assigned', 'responder_on_the_way', 'responder_nearby', 'responder_report_submitted', 'resolved', 'cancelled', 'false_alarm'] as const;
export type EmergencyStatus = typeof emergencyStatuses[number];
export const emergencyTypes = ['medical', 'crime', 'fire', 'general_sos'] as const;
export type EmergencyType = typeof emergencyTypes[number];
export interface TimelineEvent { id?: string; name?: string; from?: string; to?: string; status?: EmergencyStatus; action?: string; actorId?: string; actorRole?: AccountRole; reason?: string; at?: string; createdAt?: string; timestamp?: string }
export interface ResponseReport { arrivalTimestamp?: string; situationNotes?: string; actionTaken?: string; photoIds?: string[]; summary?: string; actionsTaken?: string; outcome?: string; notes?: string; submittedAt?: string; responderId?: string }
export interface Emergency {
  id: string; userId: string; assignedResponderId?: string; type: EmergencyType;
  source: 'mobile_app' | 'iot_ble'; status: EmergencyStatus; location: GeoLocation;
  responderLocation?: GeoLocation; notes?: string; timeline: TimelineEvent[];
  report?: ResponseReport; resolutionNotes?: string; createdAt: string; updatedAt: string;
  user?: Pick<Account, 'id' | 'name'> & { phone?: string };
  responder?: Pick<Account, 'id' | 'name'> & { phone?: string; agencyType?: string };
}
export interface LiveResponder { id: string; name: string; agencyType?: string; isOnDuty: boolean; location?: GeoLocation; lastSeenAt?: string }
export interface AnalyticsSummary {
  total: number; active: number; resolved: number; cancelled: number; falseAlarm: number;
  pending?: number; staleGps?: number; averageResponseSeconds?: number | null;
  pendingRegistrations: { users: number; responders: number };
  responders: { total: number; onDuty: number }; averageResolutionSeconds: number | null;
}
export interface MonthlyCount { month: string; total: number; resolved: number; byType?: Record<string, number> }
export interface ResolutionTimes { averageSeconds: number | null; medianSeconds: number | null; count: number }
export interface AuditLog { id: string; actorId: string; actorRole: AccountRole; action: string; targetId: string; targetType: string; reason?: string; createdAt: string }


