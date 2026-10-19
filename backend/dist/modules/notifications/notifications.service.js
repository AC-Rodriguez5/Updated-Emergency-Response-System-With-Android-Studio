import mongoose from 'mongoose';
import { AdminNotification, } from '../../models/index.js';
const NOTIFY_EMERGENCY_EVENTS = new Set([
    'emergency.created',
    'emergency.iot_keychain_created',
    'emergency.iot_device_created',
    'emergency.assigned',
    'emergency.released',
    // The two a dispatcher has to act on: an assignment nobody answered, and an
    // incident nobody took.
    'emergency.assignment_expired',
    'emergency.dispatch_overdue',
    'emergency.resolved',
    'emergency.cancelled',
    'emergency.responder_report',
    'emergency.responder_arrived',
    // A line typed by the responder standing in it, or by a dispatcher: the whole
    // point of the channel is that somebody reads it now.
    'emergency.message',
    'emergency.update_requested',
    // A message typed by the person in the emergency: dispatch has to see it
    // without going looking for it.
    'emergency.user_message',
]);
const NOTIFY_AMBULANCE_EVENTS = new Set([
    'ambulance_request.created',
    'ambulance_request.assigned',
    'ambulance_request.completed',
    'ambulance_request.cancelled',
    'ambulance_request.reviewed',
]);
const HUMAN_EMERGENCY_TYPE = {
    medical: 'Medical Emergency',
    crime: 'Crime',
    fire: 'Fire',
    general_sos: 'General SOS',
};
function priorityForEmergency(emergency, event) {
    if (event === 'emergency.created' || event === 'emergency.iot_keychain_created' || event === 'emergency.iot_device_created') {
        return emergency.priority === 'critical' ? 'critical' : 'high';
    }
    // Someone typing mid-emergency is reporting something the dispatcher does not
    // know yet, so it outranks a routine status change in the notification list.
    if (event === 'emergency.user_message')
        return 'high';
    if (event === 'emergency.message')
        return 'high';
    // Nobody is coming yet, and only a dispatcher can change that.
    if (event === 'emergency.assignment_expired' || event === 'emergency.dispatch_overdue') {
        return emergency.priority === 'critical' ? 'critical' : 'high';
    }
    return 'normal';
}
function priorityForAmbulance(req, event) {
    if (event === 'ambulance_request.created') {
        return req.isEmergencyPriority ? 'critical' : 'high';
    }
    return 'normal';
}
function emit(io, doc) {
    if (!io)
        return;
    io.to('admin:live').emit('admin_notification.created', toDto(doc));
}
export async function recordEmergencyNotification(emergency, event, io) {
    if (!NOTIFY_EMERGENCY_EVENTS.has(event))
        return;
    try {
        const sender = emergency.userSnapshot?.fullName ?? 'A user';
        const typeLabel = HUMAN_EMERGENCY_TYPE[emergency.type] ?? emergency.type;
        const isCreated = event === 'emergency.created' ||
            event === 'emergency.iot_keychain_created' ||
            event === 'emergency.iot_device_created';
        const latestReport = [...emergency.timeline]
            .reverse()
            .find((t) => t.event === 'responder_report');
        const latestUpdateRequest = [...emergency.timeline]
            .reverse()
            .find((t) => t.event === 'admin_update_requested');
        const latestUserMessage = [...emergency.timeline]
            .reverse()
            .find((t) => t.event === 'user_message');
        const latestMessage = [...emergency.timeline]
            .reverse()
            .find((t) => t.event === 'message');
        const title = isCreated
            ? `New ${typeLabel} request`
            : event === 'emergency.message'
                ? latestMessage?.actorRole === 'responder'
                    ? `Responder update — ${typeLabel}`
                    : `Dispatch note — ${typeLabel}`
                : event === 'emergency.user_message'
                    ? `Message from ${sender}`
                    : event === 'emergency.responder_report'
                        ? `Responder report for ${typeLabel}`
                        : event === 'emergency.update_requested'
                            ? `Update requested for ${typeLabel}`
                            : `${typeLabel} ${event.replace('emergency.', '').replace(/_/g, ' ')}`;
        // A hardware panic-button alert is filed before its GNSS receiver has a fix, so
        // say so plainly instead of leaving the dispatcher to wonder where it came from.
        const origin = emergency.barangay
            ? ` from ${emergency.barangay}`
            : emergency.locationStatus === 'pending'
                ? ' — waiting for GPS'
                : '';
        const message = isCreated
            ? `${sender} sent a ${typeLabel} request${origin}.`
            : event === 'emergency.message'
                ? latestMessage?.note ?? 'A note was added to this incident.'
                : event === 'emergency.user_message'
                    ? latestUserMessage?.note ?? `${sender} sent a message.`
                    : event === 'emergency.responder_report'
                        ? `A responder submitted an incident update${latestReport?.note ? `: ${latestReport.note.slice(0, 160)}` : '.'}`
                        : event === 'emergency.update_requested'
                            ? `Admin requested another responder update${latestUpdateRequest?.note ? `: ${latestUpdateRequest.note.slice(0, 160)}` : '.'}`
                            : `${typeLabel} request ${event.replace('emergency.', '').replace(/_/g, ' ')}.`;
        const [lng, lat] = emergency.currentLocation?.coordinates ?? [undefined, undefined];
        const doc = await AdminNotification.create({
            type: 'emergency',
            category: event,
            requestId: emergency._id,
            title,
            message,
            priority: priorityForEmergency(emergency, event),
            status: 'unread',
            senderName: sender,
            emergencyType: typeLabel,
            location: {
                address: emergency.barangay,
                latitude: lat,
                longitude: lng,
            },
        });
        emit(io, doc);
    }
    catch (err) {
        console.error('[notifications] failed to record emergency notification', err);
    }
}
export async function recordAmbulanceNotification(req, event, io) {
    if (!NOTIFY_AMBULANCE_EVENTS.has(event))
        return;
    try {
        const sender = req.senderSnapshot?.fullName ?? 'A user';
        const isCreated = event === 'ambulance_request.created';
        const title = isCreated
            ? 'New ambulance request'
            : `Ambulance request ${event.replace('ambulance_request.', '').replace(/_/g, ' ')}`;
        const pickup = req.pickupLocation?.addressLabel;
        const dropoff = req.dropOffLocation?.addressLabel;
        const message = isCreated
            ? `${sender} requested an ambulance${pickup ? ` from ${pickup}` : ''}${dropoff ? ` → ${dropoff}` : ''}.`
            : `${sender}'s ambulance request was updated.`;
        const doc = await AdminNotification.create({
            type: 'ambulance',
            category: event,
            requestId: req._id,
            title,
            message,
            priority: priorityForAmbulance(req, event),
            status: 'unread',
            senderName: sender,
            location: {
                address: pickup,
                latitude: req.pickupLocation?.coordinates?.[1],
                longitude: req.pickupLocation?.coordinates?.[0],
            },
        });
        emit(io, doc);
    }
    catch (err) {
        console.error('[notifications] failed to record ambulance notification', err);
    }
}
export async function listForAdmin(args) {
    const filter = {};
    if (args.status && args.status !== 'all')
        filter.status = args.status;
    if (args.type && args.type !== 'all')
        filter.type = args.type;
    const items = await AdminNotification.find(filter)
        .sort({ createdAt: -1 })
        .limit(args.limit)
        .lean();
    const unreadCount = await AdminNotification.countDocuments({ status: 'unread' });
    return { items: items.map(toDtoLean), unreadCount };
}
export async function acknowledge(id, adminId) {
    if (!mongoose.Types.ObjectId.isValid(id))
        return null;
    const updated = await AdminNotification.findByIdAndUpdate(id, {
        $set: {
            status: 'acknowledged',
            acknowledgedBy: new mongoose.Types.ObjectId(adminId),
            acknowledgedAt: new Date(),
        },
    }, { new: true }).lean();
    return updated ? toDtoLean(updated) : null;
}
export async function markAllRead(adminId) {
    const adminObjectId = new mongoose.Types.ObjectId(adminId);
    await AdminNotification.updateMany({ status: 'unread' }, { $set: { status: 'read' }, $addToSet: { readBy: adminObjectId } });
}
function toDto(doc) {
    return {
        id: doc._id.toString(),
        type: doc.type,
        category: doc.category,
        requestId: doc.requestId?.toString(),
        title: doc.title,
        message: doc.message,
        priority: doc.priority,
        status: doc.status,
        senderName: doc.senderName,
        emergencyType: doc.emergencyType,
        location: doc.location,
        acknowledgedAt: doc.acknowledgedAt?.toISOString(),
        createdAt: doc.createdAt.toISOString(),
    };
}
function toDtoLean(doc) {
    return {
        id: doc._id.toString(),
        type: doc.type,
        category: doc.category,
        requestId: doc.requestId?.toString(),
        title: doc.title,
        message: doc.message,
        priority: doc.priority,
        status: doc.status,
        senderName: doc.senderName,
        emergencyType: doc.emergencyType,
        location: doc.location,
        acknowledgedAt: doc.acknowledgedAt?.toISOString(),
        createdAt: doc.createdAt.toISOString(),
    };
}
