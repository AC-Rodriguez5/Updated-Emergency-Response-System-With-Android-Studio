import mongoose from 'mongoose';
import { AuditLog, Emergency, Responder, User, } from '../../models/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { tanzaScope } from '../../shared/utils/tanza.js';
import { emitEmergencyEvent } from './events.js';
import { canResponderHandleEmergency, emergencyTypesForResponder, } from './responderRoleAccess.js';
export function priorityFor(type) {
    switch (type) {
        case 'medical':
        case 'general_sos':
            return 'critical';
        case 'fire':
        case 'crime':
            return 'high';
    }
}
export async function snapshotUser(userId) {
    const u = await User.findById(userId).lean();
    if (!u)
        return undefined;
    const primary = (u.contacts ?? []).find((c) => c.isPrimary) ?? u.contacts?.[0];
    return {
        fullName: u.name,
        age: u.age,
        dateOfBirth: u.dateOfBirth,
        phone: u.phone,
        faceCaptureFileId: u.faceCaptureFileId,
        proofOfResidencyFileId: u.proofOfResidencyFileId,
        bloodType: u.bloodType,
        streetAddress: u.streetAddress,
        barangay: u.barangay,
        municipality: u.municipality,
        emergencyContactName: u.emergencyContactName ?? primary?.name,
        emergencyContactNumber: u.emergencyContactNumber ?? primary?.phone,
    };
}
export async function createEmergency(input, auth, ctx) {
    if (auth.role !== 'user') {
        throw new AppError('Only users can create emergencies', 403, 'FORBIDDEN');
    }
    const [lng, lat] = input.location.coordinates;
    const scope = tanzaScope(lng, lat);
    const userObjectId = new mongoose.Types.ObjectId(auth.accountId);
    const snapshot = await snapshotUser(auth.accountId);
    const created = await Emergency.create({
        type: input.type,
        source: input.source,
        priority: priorityFor(input.type),
        status: 'pending',
        userId: userObjectId,
        currentLocation: {
            type: 'Point',
            coordinates: input.location.coordinates,
            accuracyMeters: input.location.accuracyMeters,
            capturedAt: new Date(input.location.capturedAt),
        },
        locationStatus: 'fixed',
        locationRevision: 1,
        lastLocationAt: new Date(),
        isInsideTanza: scope.isInsideTanza,
        outsideScopeFlag: scope.outsideScopeFlag,
        barangay: input.barangay,
        municipality: 'Tanza',
        notes: input.notes,
        userSnapshot: snapshot,
        timeline: [
            {
                event: 'created',
                at: new Date(),
                actorId: userObjectId,
                actorRole: 'user',
            },
        ],
    });
    await AuditLog.create({
        actorId: userObjectId,
        actorRole: 'user',
        action: 'emergency.created',
        targetType: 'emergency',
        targetId: created._id,
        meta: { type: input.type, source: input.source, outsideScopeFlag: scope.outsideScopeFlag },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.created', created);
    return created;
}
const ACTIVE_STATUSES = [
    'pending',
    'assigned',
    'responder_on_the_way',
    'responder_nearby',
    'arrived',
];
async function setResponderDutyForEmergency(responderId, dutyStatus, ctx) {
    if (!responderId)
        return;
    const responder = await Responder.findByIdAndUpdate(responderId, {
        $set: {
            dutyStatus,
            isOnDuty: true,
        },
    }, { new: true }).lean();
    if (!responder)
        return;
    ctx.io?.to('admin:live').emit('responder.status_updated', {
        responderId,
        name: responder.name,
        agencyType: responder.agencyType,
        dutyStatus: responder.dutyStatus,
        isVisibleOnMap: !!responder.currentLocation,
        currentLocation: responder.currentLocation,
        lastSeen: responder.locationHistory.at(-1)?.capturedAt,
    });
}
export async function listActive(args, auth) {
    if (auth.role === 'user') {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const filter = { status: { $in: ACTIVE_STATUSES } };
    if (args.type)
        filter.type = args.type;
    if (auth.role === 'responder') {
        const responder = await Responder.findById(auth.accountId)
            .select('responderRole department agencyType')
            .lean();
        if (!responder)
            throw new AppError('Responder not found', 404, 'NOT_FOUND');
        const allowedTypes = emergencyTypesForResponder(responder);
        if (allowedTypes.length > 0) {
            filter.$or = [
                { assignedResponderId: new mongoose.Types.ObjectId(auth.accountId) },
                { type: { $in: allowedTypes } },
            ];
        }
    }
    const skip = (args.page - 1) * args.limit;
    const [items, total] = await Promise.all([
        Emergency.find(filter).sort({ priority: -1, createdAt: -1 }).skip(skip).limit(args.limit).lean(),
        Emergency.countDocuments(filter),
    ]);
    return { items, total, page: args.page, limit: args.limit };
}
export async function listMine(args, auth) {
    if (auth.role !== 'user') {
        throw new AppError('Only users have a "my" feed', 403, 'FORBIDDEN');
    }
    const filter = { userId: new mongoose.Types.ObjectId(auth.accountId) };
    const skip = (args.page - 1) * args.limit;
    const [items, total] = await Promise.all([
        Emergency.find(filter).sort({ createdAt: -1 }).skip(skip).limit(args.limit).lean(),
        Emergency.countDocuments(filter),
    ]);
    return { items, total, page: args.page, limit: args.limit };
}
async function loadAccessible(id, auth) {
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (auth.role === 'user' && doc.userId.toString() !== auth.accountId) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    if (auth.role === 'responder') {
        const isAssigned = doc.assignedResponderId?.toString() === auth.accountId;
        const isOpen = ACTIVE_STATUSES.includes(doc.status);
        if (!isAssigned && !isOpen) {
            throw new AppError('Forbidden', 403, 'FORBIDDEN');
        }
        if (!isAssigned) {
            const responder = await Responder.findById(auth.accountId)
                .select('responderRole department agencyType')
                .lean();
            if (!responder || !canResponderHandleEmergency(responder, doc.type)) {
                throw new AppError('Emergency is outside responder role', 403, 'OUT_OF_ROLE');
            }
        }
    }
    return doc;
}
export async function getOne(id, auth) {
    const doc = await loadAccessible(id, auth);
    return doc.toJSON();
}
export async function cancel(id, body, auth, ctx) {
    if (auth.role !== 'user') {
        throw new AppError('Only the user can cancel', 403, 'FORBIDDEN');
    }
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (doc.userId.toString() !== auth.accountId) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    if (doc.status !== 'pending') {
        throw new AppError('Cannot cancel after assignment', 409, 'INVALID_TRANSITION');
    }
    doc.status = 'cancelled';
    doc.cancelledAt = new Date();
    // Closing the incident is what stops a hardware panic button transmitting: it
    // reads this back on its next position post and then goes quiet.
    doc.trackingActive = false;
    doc.timeline.push({
        event: 'cancelled',
        at: new Date(),
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'user',
        note: body.reason,
    });
    await doc.save();
    await AuditLog.create({
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'user',
        action: 'emergency.cancelled',
        targetType: 'emergency',
        targetId: doc._id,
        meta: body.reason ? { reason: body.reason } : undefined,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.updated', doc);
    return doc;
}
export async function assign(id, body, auth, ctx) {
    if (auth.role !== 'admin' && auth.role !== 'responder') {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (doc.status !== 'pending') {
        throw new AppError('Already assigned or closed', 409, 'INVALID_TRANSITION');
    }
    let responderId;
    if (auth.role === 'admin') {
        if (!body.responderId) {
            throw new AppError('responderId required for admin assign', 400, 'BAD_REQUEST');
        }
        responderId = body.responderId;
    }
    else {
        responderId = auth.accountId;
    }
    const responder = await Responder.findById(responderId);
    if (!responder)
        throw new AppError('Responder not found', 404, 'NOT_FOUND');
    if (responder.approvalStatus !== 'approved' || !responder.isApproved) {
        throw new AppError('Responder not approved', 409, 'RESPONDER_NOT_APPROVED');
    }
    if (auth.role === 'responder' &&
        !canResponderHandleEmergency(responder, doc.type)) {
        throw new AppError('Emergency is outside your responder role', 403, 'OUT_OF_ROLE');
    }
    doc.status = 'assigned';
    doc.assignedResponderId = responder._id;
    doc.timeline.push({
        event: 'assigned',
        at: new Date(),
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: auth.role,
    });
    await doc.save();
    await AuditLog.create({
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: auth.role,
        action: 'emergency.assigned',
        targetType: 'emergency',
        targetId: doc._id,
        meta: { responderId },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.assigned', doc);
    await setResponderDutyForEmergency(responderId, 'busy', ctx);
    return doc;
}
export async function setOnTheWay(id, auth, ctx) {
    if (auth.role !== 'responder') {
        throw new AppError('Only responders set on-the-way', 403, 'FORBIDDEN');
    }
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (doc.assignedResponderId?.toString() !== auth.accountId) {
        throw new AppError('Not your assignment', 403, 'FORBIDDEN');
    }
    if (doc.status !== 'assigned') {
        throw new AppError('Not in assigned state', 409, 'INVALID_TRANSITION');
    }
    doc.status = 'responder_on_the_way';
    doc.timeline.push({
        event: 'responder_on_the_way',
        at: new Date(),
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'responder',
    });
    await doc.save();
    await AuditLog.create({
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'responder',
        action: 'emergency.on_the_way',
        targetType: 'emergency',
        targetId: doc._id,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.responder_on_the_way', doc);
    await setResponderDutyForEmergency(auth.accountId, 'responding', ctx);
    return doc;
}
export async function report(id, body, auth, ctx) {
    if (auth.role !== 'responder') {
        throw new AppError('Only responders can file a report', 403, 'FORBIDDEN');
    }
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (doc.assignedResponderId?.toString() !== auth.accountId) {
        throw new AppError('Not your assignment', 403, 'FORBIDDEN');
    }
    if (doc.status === 'resolved' || doc.status === 'cancelled') {
        throw new AppError('Cannot file a report on a closed emergency', 409, 'INVALID_TRANSITION');
    }
    const responderObjectId = new mongoose.Types.ObjectId(auth.accountId);
    const recentDuplicate = [...doc.timeline].reverse().find((event) => {
        if (event.event !== 'responder_report')
            return false;
        if (event.actorId?.toString() !== auth.accountId)
            return false;
        if (event.note !== body.note)
            return false;
        return Date.now() - new Date(event.at).getTime() < 10_000;
    });
    if (recentDuplicate) {
        return doc;
    }
    doc.timeline.push({
        event: 'responder_report',
        at: new Date(),
        actorId: responderObjectId,
        actorRole: 'responder',
        note: body.note,
        reportType: body.reportType,
        reportStatus: 'submitted',
    });
    const pendingRequest = [...doc.timeline].reverse().find((event) => event.event === 'admin_update_requested' &&
        event.reportStatus === 'needs_update' &&
        event.actorRole === 'admin');
    if (pendingRequest)
        pendingRequest.reportStatus = 'accepted';
    await doc.save();
    await AuditLog.create({
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'responder',
        action: 'emergency.report_filed',
        targetType: 'emergency',
        targetId: doc._id,
        meta: { length: body.note.length, reportType: body.reportType },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.responder_report', doc);
    return doc;
}
export async function requestUpdate(id, body, auth, ctx) {
    if (auth.role !== 'admin') {
        throw new AppError('Only admin can request updates', 403, 'FORBIDDEN');
    }
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (doc.status === 'resolved' || doc.status === 'cancelled') {
        throw new AppError('Cannot request an update on a closed emergency', 409, 'INVALID_TRANSITION');
    }
    if (!doc.assignedResponderId) {
        throw new AppError('Assign a responder before requesting an update', 409, 'NO_ASSIGNED_RESPONDER');
    }
    doc.timeline.push({
        event: 'admin_update_requested',
        at: new Date(),
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'admin',
        note: body.message,
        reportType: 'follow_up',
        reportStatus: 'needs_update',
    });
    await doc.save();
    await AuditLog.create({
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'admin',
        action: 'emergency.update_requested',
        targetType: 'emergency',
        targetId: doc._id,
        meta: { responderId: doc.assignedResponderId.toString(), messageLength: body.message.length },
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.update_requested', doc);
    return doc;
}
export async function resolve(id, body, auth, ctx) {
    if (auth.role !== 'admin') {
        throw new AppError('Only admin can resolve', 403, 'FORBIDDEN');
    }
    const doc = await Emergency.findById(id);
    if (!doc)
        throw new AppError('Emergency not found', 404, 'NOT_FOUND');
    if (doc.status === 'resolved' || doc.status === 'cancelled') {
        throw new AppError('Already closed', 409, 'INVALID_TRANSITION');
    }
    doc.status = 'resolved';
    doc.resolvedAt = new Date();
    doc.resolvedBy = new mongoose.Types.ObjectId(auth.accountId);
    // Stops a hardware panic button's position stream — it learns this from the
    // reply to its next post.
    doc.trackingActive = false;
    doc.timeline.push({
        event: 'resolved',
        at: new Date(),
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'admin',
        note: body.resolutionNotes,
    });
    await doc.save();
    await AuditLog.create({
        actorId: new mongoose.Types.ObjectId(auth.accountId),
        actorRole: 'admin',
        action: 'emergency.resolved',
        targetType: 'emergency',
        targetId: doc._id,
        meta: body.resolutionNotes ? { notes: body.resolutionNotes } : undefined,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
    });
    emitEmergencyEvent(ctx.io, 'emergency.resolved', doc);
    await setResponderDutyForEmergency(doc.assignedResponderId?.toString(), 'available', ctx);
    return doc;
}
