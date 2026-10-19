import { recordEmergencyNotification } from '../notifications/notifications.service.js';
function docId(emergency) {
    return emergency._id.toString();
}
function buildPayload(emergency) {
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
        locationStatus: emergency.locationStatus ?? (emergency.currentLocation ? 'fixed' : 'pending'),
        locationRevision: emergency.locationRevision ?? 0,
        trackingActive: emergency.trackingActive ?? false,
        sourceDeviceId: emergency.sourceDeviceId,
        userSnapshot: emergency.userSnapshot,
        occurredAt: new Date().toISOString(),
    };
}
export function emitEmergencyEvent(io, event, emergency, extraRooms = []) {
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
