import type { Server as SocketServer } from 'socket.io';
import type { Types } from 'mongoose';
import type { IEmergency } from '../../models/index.js';
import { recordEmergencyNotification } from '../notifications/notifications.service.js';
import {
  RESPONDER_BROADCAST_ROOM,
  isHardwareSourced,
} from './responderRoleAccess.js';

export type EmergencyEventName =
  | 'emergency.created'
  | 'emergency.iot_keychain_created'
  | 'emergency.iot_device_created'
  | 'emergency.updated'
  | 'emergency.assigned'
  | 'emergency.assignment_acknowledged'
  | 'emergency.assignment_expired'
  | 'emergency.released'
  | 'emergency.dispatch_overdue'
  | 'emergency.responder_on_the_way'
  | 'emergency.responder_nearby'
  | 'emergency.responder_arrived'
  | 'emergency.message'
  | 'emergency.responder_report'
  | 'emergency.update_requested'
  | 'emergency.user_message'
  | 'emergency.location_updated'
  | 'emergency.resolved';

export interface EmergencyEventPayload {
  emergencyId: string;
  status: IEmergency['status'];
  type: IEmergency['type'];
  source: IEmergency['source'];
  priority: IEmergency['priority'];
  userId: string;
  assignedResponderId?: string;
  /** Absent while a dispatcher's assignment is still unanswered. */
  assignmentAckAt?: string;
  /** When an unanswered assignment expires. Absent on a self-accept. */
  assignmentDeadlineAt?: string;
  /** True once the watchdog has flagged an incident nobody has taken. */
  dispatchOverdue: boolean;
  isInsideTanza: boolean;
  outsideScopeFlag: boolean;
  barangay?: string;
  /** Absent until the hardware panic button lands its first GNSS fix. */
  location?: IEmergency['currentLocation'];
  locationStatus: IEmergency['locationStatus'];
  locationRevision: number;
  trackingActive: boolean;
  sourceDeviceId?: string;
  userSnapshot?: IEmergency['userSnapshot'];
  occurredAt: string;
}

function docId(emergency: IEmergency): string {
  return (emergency._id as Types.ObjectId).toString();
}

function buildPayload(emergency: IEmergency): EmergencyEventPayload {
  return {
    emergencyId: docId(emergency),
    status: emergency.status,
    type: emergency.type,
    source: emergency.source,
    priority: emergency.priority,
    userId: emergency.userId.toString(),
    assignedResponderId: emergency.assignedResponderId?.toString(),
    assignmentAckAt: emergency.assignmentAckAt?.toISOString(),
    assignmentDeadlineAt: emergency.assignmentDeadlineAt?.toISOString(),
    dispatchOverdue: !!emergency.dispatchOverdueAt,
    isInsideTanza: emergency.isInsideTanza,
    outsideScopeFlag: emergency.outsideScopeFlag,
    barangay: emergency.barangay,
    location: emergency.currentLocation,
    // Incidents stored before these fields existed read back undefined, because
    // Mongoose applies defaults on write and not on hydration. Derive them so no
    // consumer has to special-case a legacy document.
    locationStatus:
      emergency.locationStatus ?? (emergency.currentLocation ? 'fixed' : 'pending'),
    locationRevision: emergency.locationRevision ?? 0,
    trackingActive: emergency.trackingActive ?? false,
    sourceDeviceId: emergency.sourceDeviceId,
    userSnapshot: emergency.userSnapshot,
    occurredAt: new Date().toISOString(),
  };
}

export function emitEmergencyEvent(
  io: SocketServer | undefined,
  event: EmergencyEventName,
  emergency: IEmergency,
  extraRooms: string[] = [],
): void {
  const payload = buildPayload(emergency);
  const userRoom = `user:${emergency.userId.toString()}`;
  const adminRoom = 'admin:live';
  const emergencyRoom = `emergency:${docId(emergency)}`;
  const responderFeedRoom = `responder-feed:${emergency.type}`;

  if (io) {
    io.to(adminRoom).emit(event, payload);
    io.to(userRoom).emit(event, payload);
    io.to(emergencyRoom).emit(event, payload);
    io.to(responderFeedRoom).emit(event, payload);
    // A panic-button press claimed no category, so it is not the type feed's to
    // keep: it goes to every responder on the namespace. See
    // `isHardwareSourced`. Socket.IO de-duplicates across rooms, so a responder
    // in both rooms still receives one copy.
    if (isHardwareSourced(emergency.source)) {
      io.to(RESPONDER_BROADCAST_ROOM).emit(event, payload);
    }
    if (emergency.assignedResponderId) {
      io.to(`responder:${emergency.assignedResponderId.toString()}`).emit(event, payload);
    }
    for (const room of extraRooms) {
      io.to(room).emit(event, payload);
    }
  }

  void recordEmergencyNotification(emergency, event, io);
}
