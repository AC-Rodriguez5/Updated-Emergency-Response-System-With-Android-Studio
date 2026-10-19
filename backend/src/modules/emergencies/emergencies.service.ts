import mongoose from 'mongoose';
import type { Server as SocketServer } from 'socket.io';
import {
  AuditLog,
  Emergency,
  Responder,
  User,
  type IEmergency,
  type EmergencyPriority,
  type EmergencyType,
} from '../../models/index.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { tanzaScope } from '../../shared/utils/tanza.js';
import type { AuthContext, AuthRole } from '../../shared/types/http.js';
import { emitEmergencyEvent } from './events.js';
import {
  canResponderHandleEmergency,
  emergencyTypesForResponder,
} from './responderRoleAccess.js';
import type {
  AssignBody,
  CancelBody,
  CreateEmergencyInput,
  ListActiveQuery,
  ListMineQuery,
  ReleaseBody,
  ReportBody,
  RequestUpdateBody,
  ResolveBody,
  UserMessageBody,
} from './emergencies.schemas.js';

interface ServiceCtx {
  io?: SocketServer;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export function priorityFor(type: EmergencyType): EmergencyPriority {
  switch (type) {
    case 'medical':
    case 'general_sos':
      return 'critical';
    case 'fire':
    case 'crime':
      return 'high';
  }
}

export async function snapshotUser(userId: string): Promise<IEmergency['userSnapshot']> {
  const u = await User.findById(userId).lean();
  if (!u) return undefined;
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

export async function createEmergency(
  input: CreateEmergencyInput,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
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

const ACTIVE_STATUSES: IEmergency['status'][] = [
  'pending',
  'assigned',
  'responder_on_the_way',
  'responder_nearby',
  'arrived',
];

export async function setResponderDutyForEmergency(
  responderId: string | undefined,
  dutyStatus: 'available' | 'busy' | 'responding',
  ctx: ServiceCtx,
): Promise<void> {
  if (!responderId) return;
  const responder = await Responder.findByIdAndUpdate(
    responderId,
    {
      $set: {
        dutyStatus,
        isOnDuty: true,
      },
    },
    { new: true },
  ).lean();
  if (!responder) return;
  ctx.io?.to('admin:live').emit('responder.status_updated', {
    responderId,
    name: responder.name,
    agencyType: responder.agencyType,
    dutyStatus: responder.dutyStatus,
    isVisibleOnMap: !!responder.currentLocation,
    currentLocation: responder.currentLocation,
    lastSeen: (responder.locationHistory as Array<{ capturedAt: Date }>).at(-1)?.capturedAt,
  });
}

export async function listActive(args: ListActiveQuery, auth: AuthContext) {
  if (auth.role === 'user') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const filter: Record<string, unknown> = { status: { $in: ACTIVE_STATUSES } };
  if (args.type) filter.type = args.type;

  if (auth.role === 'responder') {
    const responder = await Responder.findById(auth.accountId)
      .select('responderRole department agencyType')
      .lean();
    if (!responder) throw new AppError('Responder not found', 404, 'NOT_FOUND');
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

/**
 * What a responder has already closed out.
 *
 * Only incidents they were assigned to and that a dispatcher then resolved: a
 * responder's history is the work they actually did, not every call the
 * municipality logged that day.
 */
export async function listResolvedForResponder(
  args: ListMineQuery,
  auth: AuthContext,
) {
  if (auth.role !== 'responder') {
    throw new AppError('Only responders have a response history', 403, 'FORBIDDEN');
  }
  const filter = {
    assignedResponderId: new mongoose.Types.ObjectId(auth.accountId),
    status: 'resolved' as const,
  };
  const skip = (args.page - 1) * args.limit;
  const [items, total] = await Promise.all([
    Emergency.find(filter)
      .sort({ resolvedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(args.limit)
      .lean(),
    Emergency.countDocuments(filter),
  ]);
  return { items, total, page: args.page, limit: args.limit };
}

export async function listMine(args: ListMineQuery, auth: AuthContext) {
  if (auth.role !== 'user') {
    throw new AppError('Only users have a "my" feed', 403, 'FORBIDDEN');
  }
  const filter = { userId: new mongoose.Types.ObjectId(auth.accountId) };
  const skip = (args.page - 1) * args.limit;
  const [items, total] = await Promise.all([
    Emergency.find(filter).sort({ createdAt: -1 }).skip(skip).limit(args.limit).lean(),
    Emergency.countDocuments(filter),
  ]);
  const visible = items.map((item) =>
    withoutInternalNotes(item as unknown as Record<string, unknown>, auth.role),
  );
  return { items: visible, total, page: args.page, limit: args.limit };
}

async function loadAccessible(id: string, auth: AuthContext): Promise<IEmergency> {
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
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

/// The slice of an assigned responder that the reporting user is shown while
/// they wait: who is coming and from which unit.
///
/// Name, badge, agency and station only. No phone or email — the app has no
/// call feature, and an emergency is not a reason to hand out a responder's
/// personal contact details to everyone who raises an alert.
const RESPONDER_SUMMARY_FIELDS = 'name badgeId department agencyType stationName';

const AGENCY_LABEL: Record<string, string> = {
  mdrrmo: 'MDRRMO',
  pnp: 'PNP',
  bfp: 'BFP',
  medical: 'Medical',
  rescue: 'Rescue',
  barangay: 'Barangay',
  other: 'MDRRMO',
};

interface TimelineJson {
  audience?: string;
}

/**
 * Keeps the dispatch channel away from the person in the emergency.
 *
 * Their app can read the whole incident, so filtering has to happen here rather
 * than in the client: a note marked `dispatch` is between the dispatcher and
 * the responder, and nothing addressed to them is removed.
 */
function withoutInternalNotes<T extends Record<string, unknown>>(
  json: T,
  role: AuthRole,
): T {
  if (role !== 'user') return json;
  const timeline = json.timeline;
  if (!Array.isArray(timeline)) return json;
  return {
    ...json,
    timeline: (timeline as TimelineJson[]).filter((entry) => entry.audience !== 'dispatch'),
  };
}

export async function getOne(id: string, auth: AuthContext) {
  const doc = await loadAccessible(id, auth);
  const json = withoutInternalNotes(doc.toJSON() as Record<string, unknown>, auth.role);
  if (!doc.assignedResponderId) return json;

  const responder = await Responder.findById(doc.assignedResponderId)
    .select(RESPONDER_SUMMARY_FIELDS)
    .lean();
  // An assignment whose responder record has since gone is not a reason to
  // fail the whole lookup — the tracking screen falls back to "Responder
  // assigned" without a name.
  if (!responder) return json;

  return {
    ...json,
    assignedResponder: {
      id: responder._id.toString(),
      name: responder.name,
      badgeId: responder.badgeId,
      agency: AGENCY_LABEL[responder.agencyType ?? ''] ?? 'MDRRMO',
      department: responder.department,
      stationName: responder.stationName,
    },
  };
}

export async function cancel(
  id: string,
  body: CancelBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'user') {
    throw new AppError('Only the user can cancel', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (doc.userId.toString() !== auth.accountId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (doc.status !== 'pending') {
    throw new AppError(
      'Cannot cancel after assignment',
      409,
      'INVALID_TRANSITION',
    );
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
  } as never);
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

export async function assign(
  id: string,
  body: AssignBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'admin' && auth.role !== 'responder') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (!ACTIVE_STATUSES.includes(doc.status)) {
    throw new AppError('Emergency is already closed', 409, 'INVALID_TRANSITION');
  }
  // A responder may only take what nobody is holding. A dispatcher may take it
  // off whoever holds it: reassignment is the only way a stalled incident --
  // flat battery, no signal, wrong unit -- ever reaches somebody else.
  if (auth.role === 'responder' && doc.status !== 'pending') {
    throw new AppError('Already assigned', 409, 'INVALID_TRANSITION');
  }

  let responderId: string;
  if (auth.role === 'admin') {
    if (!body.responderId) {
      throw new AppError('responderId required for admin assign', 400, 'BAD_REQUEST');
    }
    responderId = body.responderId;
  } else {
    responderId = auth.accountId;
  }

  const responder = await Responder.findById(responderId);
  if (!responder) throw new AppError('Responder not found', 404, 'NOT_FOUND');
  if (responder.approvalStatus !== 'approved' || !responder.isApproved) {
    throw new AppError('Responder not approved', 409, 'RESPONDER_NOT_APPROVED');
  }
  if (
    auth.role === 'responder' &&
    !canResponderHandleEmergency(responder, doc.type)
  ) {
    throw new AppError(
      'Emergency is outside your responder role',
      403,
      'OUT_OF_ROLE',
    );
  }

  const previousResponderId = doc.assignedResponderId?.toString();
  const isReassignment = !!previousResponderId && previousResponderId !== responderId;

  doc.status = 'assigned';
  doc.assignedResponderId = responder._id as mongoose.Types.ObjectId;
  // Accepting from the feed is itself an acknowledgement. Being assigned is a
  // request that still has to be answered, so it gets a deadline instead.
  if (auth.role === 'responder') {
    doc.assignmentAckAt = new Date();
    doc.set('assignmentDeadlineAt', undefined);
  } else {
    doc.set('assignmentAckAt', undefined);
    doc.assignmentDeadlineAt = new Date(Date.now() + env.DISPATCH_ACK_SECONDS * 1000);
  }
  doc.set('dispatchOverdueAt', undefined);
  doc.timeline.push({
    event: isReassignment ? 'reassigned' : 'assigned',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: auth.role as 'admin' | 'responder',
  } as never);
  await doc.save();

  await AuditLog.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: auth.role as 'admin' | 'responder',
    action: 'emergency.assigned',
    targetType: 'emergency',
    targetId: doc._id,
    meta: { responderId, previousResponderId },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(
    ctx.io,
    'emergency.assigned',
    doc,
    // The outgoing responder is no longer in the incident's responder room, so
    // name it explicitly or their app never hears that it was taken away.
    isReassignment ? [`responder:${previousResponderId}`] : [],
  );
  await setResponderDutyForEmergency(responderId, 'busy', ctx);
  if (isReassignment) {
    await setResponderDutyForEmergency(previousResponderId, 'available', ctx);
  }
  return doc;
}

/**
 * The responder answering a dispatcher: yes, I have it.
 *
 * Idempotent, because the answer can be sent twice over a bad connection and the
 * second one must not look like a failure.
 */
export async function acknowledge(
  id: string,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'responder') {
    throw new AppError('Only responders acknowledge an assignment', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (doc.assignedResponderId?.toString() !== auth.accountId) {
    throw new AppError('Not your assignment', 403, 'FORBIDDEN');
  }
  if (!ACTIVE_STATUSES.includes(doc.status)) {
    throw new AppError('Emergency is already closed', 409, 'INVALID_TRANSITION');
  }
  if (doc.assignmentAckAt) return doc;

  doc.assignmentAckAt = new Date();
  doc.set('assignmentDeadlineAt', undefined);
  doc.timeline.push({
    event: 'assignment_acknowledged',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'responder',
  } as never);
  await doc.save();

  await AuditLog.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'responder',
    action: 'emergency.assignment_acknowledged',
    targetType: 'emergency',
    targetId: doc._id,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(ctx.io, 'emergency.assignment_acknowledged', doc);
  return doc;
}

/**
 * Hands an incident back to the pending pool.
 *
 * A responder releases their own assignment -- cannot take it, already on
 * another call, sent in error. A dispatcher may release anyone's. Either way the
 * incident returns to `pending` where it can be taken or dispatched again, which
 * is what stops one unreachable phone from stranding an open emergency.
 */
export async function release(
  id: string,
  body: ReleaseBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'responder' && auth.role !== 'admin') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (!ACTIVE_STATUSES.includes(doc.status)) {
    throw new AppError('Emergency is already closed', 409, 'INVALID_TRANSITION');
  }
  const heldBy = doc.assignedResponderId?.toString();
  if (!heldBy) {
    throw new AppError('Emergency has no assigned responder', 409, 'NOT_ASSIGNED');
  }
  if (auth.role === 'responder' && heldBy !== auth.accountId) {
    throw new AppError('Not your assignment', 403, 'FORBIDDEN');
  }

  doc.status = 'pending';
  doc.set('assignedResponderId', undefined);
  doc.set('assignmentAckAt', undefined);
  doc.set('assignmentDeadlineAt', undefined);
  doc.set('dispatchOverdueAt', undefined);
  doc.timeline.push({
    event: 'released',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: auth.role as 'admin' | 'responder',
    note: body.reason,
  } as never);
  await doc.save();

  await AuditLog.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: auth.role as 'admin' | 'responder',
    action: 'emergency.released',
    targetType: 'emergency',
    targetId: doc._id,
    meta: { releasedResponderId: heldBy, reason: body.reason },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(ctx.io, 'emergency.released', doc, [`responder:${heldBy}`]);
  await setResponderDutyForEmergency(heldBy, 'available', ctx);
  return doc;
}

export async function setOnTheWay(
  id: string,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'responder') {
    throw new AppError('Only responders set on-the-way', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
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
  } as never);
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

/**
 * The responder is at the scene.
 *
 * This is the timestamp every response-time figure should be measured against:
 * `assigned` says somebody answered, `responder_on_the_way` says they set off,
 * and neither of those is help arriving.
 */
export async function setArrived(
  id: string,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'responder') {
    throw new AppError('Only responders mark arrival', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (doc.assignedResponderId?.toString() !== auth.accountId) {
    throw new AppError('Not your assignment', 403, 'FORBIDDEN');
  }
  if (doc.status === 'arrived') return doc;
  if (
    doc.status !== 'assigned' &&
    doc.status !== 'responder_on_the_way' &&
    doc.status !== 'responder_nearby'
  ) {
    throw new AppError('Not on the way to this emergency', 409, 'INVALID_TRANSITION');
  }

  doc.status = 'arrived';
  doc.timeline.push({
    event: 'arrived',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'responder',
  } as never);
  await doc.save();

  await AuditLog.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'responder',
    action: 'emergency.responder_arrived',
    targetType: 'emergency',
    targetId: doc._id,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(ctx.io, 'emergency.responder_arrived', doc);
  return doc;
}

export async function report(
  id: string,
  body: ReportBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'responder') {
    throw new AppError('Only responders can file a report', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (doc.assignedResponderId?.toString() !== auth.accountId) {
    throw new AppError('Not your assignment', 403, 'FORBIDDEN');
  }
  if (doc.status === 'resolved' || doc.status === 'cancelled') {
    throw new AppError('Cannot file a report on a closed emergency', 409, 'INVALID_TRANSITION');
  }
  const responderObjectId = new mongoose.Types.ObjectId(auth.accountId);
  const recentDuplicate = [...doc.timeline].reverse().find((event) => {
    if (event.event !== 'responder_report') return false;
    if (event.actorId?.toString() !== auth.accountId) return false;
    if (event.note !== body.note) return false;
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
  } as never);
  const pendingRequest = [...doc.timeline].reverse().find(
    (event) =>
      event.event === 'admin_update_requested' &&
      event.reportStatus === 'needs_update' &&
      event.actorRole === 'admin',
  );
  if (pendingRequest) pendingRequest.reportStatus = 'accepted';
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

export async function requestUpdate(
  id: string,
  body: RequestUpdateBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'admin') {
    throw new AppError('Only admin can request updates', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
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
  } as never);
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

/**
 * One line on the incident from whoever is sending it.
 *
 * A field report is a document; this is a sentence. The difference matters when
 * the question is "are you still at the gate?" and the answer costs a dispatcher
 * two minutes of waiting for someone to write a report about it.
 */
export async function sendMessage(
  id: string,
  body: UserMessageBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role === 'user') return sendUserMessage(id, body, auth, ctx);
  return sendDispatchMessage(id, body, auth, ctx);
}

async function sendDispatchMessage(
  id: string,
  body: UserMessageBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'responder' && auth.role !== 'admin') {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
  if (doc.status === 'resolved' || doc.status === 'cancelled') {
    throw new AppError('This emergency is closed', 409, 'INVALID_TRANSITION');
  }
  if (auth.role === 'responder' && doc.assignedResponderId?.toString() !== auth.accountId) {
    throw new AppError('Not your assignment', 403, 'FORBIDDEN');
  }

  // The working channel is the default. Reaching the person in the emergency is
  // something the sender has to choose.
  const audience = body.audience ?? 'dispatch';

  doc.timeline.push({
    event: 'message',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: auth.role as 'admin' | 'responder',
    note: body.message,
    code: body.code,
    audience,
  } as never);
  await doc.save();

  await AuditLog.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: auth.role as 'admin' | 'responder',
    action: 'emergency.message',
    targetType: 'emergency',
    targetId: doc._id,
    meta: { audience, code: body.code, messageLength: body.message.length },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(ctx.io, 'emergency.message', doc);
  return doc;
}

export async function sendUserMessage(
  id: string,
  body: UserMessageBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'user') {
    throw new AppError('Only the reporting user can send a message', 403, 'FORBIDDEN');
  }
  // loadAccessible already refuses another user's emergency.
  const doc = await loadAccessible(id, auth);
  if (doc.status === 'resolved' || doc.status === 'cancelled') {
    throw new AppError(
      'This emergency is closed. Raise a new alert if you still need help.',
      409,
      'INVALID_TRANSITION',
    );
  }

  doc.timeline.push({
    event: 'user_message',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'user',
    note: body.message,
  } as never);
  await doc.save();

  await AuditLog.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'user',
    action: 'emergency.user_message',
    targetType: 'emergency',
    targetId: doc._id,
    // The message itself lives on the emergency; the log records that one was
    // sent, not a second copy of what someone said during an emergency.
    meta: { messageLength: body.message.length },
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  emitEmergencyEvent(ctx.io, 'emergency.user_message', doc);
  // Also announced on the generic channel, so a client that listens for one
  // kind of message hears all of them.
  emitEmergencyEvent(ctx.io, 'emergency.message', doc);
  return doc;
}

export async function resolve(
  id: string,
  body: ResolveBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IEmergency> {
  if (auth.role !== 'admin') {
    throw new AppError('Only admin can resolve', 403, 'FORBIDDEN');
  }
  const doc = await Emergency.findById(id);
  if (!doc) throw new AppError('Emergency not found', 404, 'NOT_FOUND');
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
  } as never);
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
  await setResponderDutyForEmergency(
    doc.assignedResponderId?.toString(),
    'available',
    ctx,
  );
  return doc;
}

export type Role = AuthRole;
