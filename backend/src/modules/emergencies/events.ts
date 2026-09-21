import type { Server as SocketServer } from 'socket.io';
import type { Types } from 'mongoose';
import type { IEmergency } from '../../models/index.js';
import { recordEmergencyNotification } from '../notifications/notifications.service.js';

export type EmergencyEventName =
  | 'emergency.created'
  | 'emergency.iot_keychain_created'
  | 'emergency.iot_device_created'
  | 'emergency.updated'
  | 'emergency.assigned'
  | 'emergency.responder_on_the_way'
  | 'emergency.responder_nearby'
  | 'emergency.responder_report'
  | 'emergency.update_requested'
  | 'emergency.resolved';

export interface EmergencyEventPayload {
  emergencyId: string;
  status: IEmergency['status'];
  type: IEmergency['type'];
  source: IEmergency['source'];
  priority: IEmergency['priority'];
  userId: string;
  assignedResponderId?: string;
  isInsideTanza: boolean;
  outsideScopeFlag: boolean;
  barangay?: string;
  location: IEmergency['currentLocation'];
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
    isInsideTanza: emergency.isInsideTanza,
    outsideScopeFlag: emergency.outsideScopeFlag,
    barangay: emergency.barangay,
    location: emergency.currentLocation,
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
    if (emergency.assignedResponderId) {
      io.to(`responder:${emergency.assignedResponderId.toString()}`).emit(event, payload);
    }
    for (const room of extraRooms) {
      io.to(room).emit(event, payload);
    }
  }

  void recordEmergencyNotification(emergency, event, io);
}
