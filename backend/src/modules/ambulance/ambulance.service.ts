import mongoose from 'mongoose';
import type { Server as SocketServer } from 'socket.io';
import {
  AmbulanceTransportRequest,
  AmbulanceUnit,
  AuditLog,
  Responder,
  User,
  type IAmbulanceTransportRequest,
  type IAmbulanceUnit,
  type IResponder,
} from '../../models/index.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import { tanzaScope } from '../../shared/utils/tanza.js';
import type { AuthContext } from '../../shared/types/http.js';
import { emitAmbulanceEvent } from './ambulance.events.js';
import type {
  AssignBody,
  AvailabilityQuery,
  AvailableUnitsQuery,
  CancelBody,
  CreateAmbulanceRequestInput,
  ListAdminQuery,
  ListMineQuery,
  ResponderUpdateBody,
} from './ambulance.schemas.js';

interface ServiceCtx {
  io?: SocketServer;
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

function audit(args: {
  actorId: string;
  actorRole: 'user' | 'responder' | 'admin';
  action: string;
  targetId: mongoose.Types.ObjectId;
  meta?: Record<string, unknown>;
  ctx: ServiceCtx;
}) {
  return AuditLog.create({
    actorId: new mongoose.Types.ObjectId(args.actorId),
    actorRole: args.actorRole,
    action: args.action,
    targetType: 'ambulance_request',
    targetId: args.targetId,
    meta: args.meta,
    requestId: args.ctx.requestId,
    ip: args.ctx.ip,
    userAgent: args.ctx.userAgent,
  });
}

function parseDatetime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function windowEnd(date: string): Date {
  return new Date(`${date}T19:00:00`);
}

export async function getAvailableUnits(args: {
  startAt: Date;
  endAt: Date;
  excludeRequestId?: string;
}): Promise<IAmbulanceUnit[]> {
  const busyFilter: Record<string, unknown> = {
    status: { $in: ['assigned', 'on_the_way', 'arrived_pickup', 'patient_onboard'] },
    reservedFromAt: { $lt: args.endAt },
    reservedUntilAt: { $gt: args.startAt },
    assignedAmbulanceUnitId: { $exists: true, $ne: null },
  };
  if (args.excludeRequestId) {
    busyFilter._id = { $ne: new mongoose.Types.ObjectId(args.excludeRequestId) };
  }
  const busyUnitIds = await AmbulanceTransportRequest.distinct(
    'assignedAmbulanceUnitId',
    busyFilter,
  );
  return AmbulanceUnit.find({
    availabilityStatus: { $nin: ['maintenance', 'out_of_service'] },
    _id: { $nin: busyUnitIds },
  })
    .sort({ unitNumber: 1 })
    .lean();
}

export async function checkAvailability(
  query: AvailabilityQuery,
): Promise<{ available: boolean; units: IAmbulanceUnit[] }> {
  const startAt = new Date(query.startAt);
  const endAt = new Date(query.endAt);
  const units = await getAvailableUnits({ startAt, endAt });
  return { available: units.length > 0, units };
}

export async function createRequest(
  input: CreateAmbulanceRequestInput,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  if (auth.role !== 'user') {
    throw new AppError('Only users can create transport requests', 403, 'FORBIDDEN');
  }

  const user = await User.findById(auth.accountId).lean();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  if (!user.isApproved) throw new AppError('Account not approved', 403, 'ACCOUNT_NOT_APPROVED');

  const [pickupLng, pickupLat] = input.pickupLocation.coordinates;
  const scope = tanzaScope(pickupLng, pickupLat);
  const isEmergencyPriority = input.requestType === 'emergency';
  const isTanzaCitizenPriority =
    input.isTanzaCitizen || (input.barangay ? scope.isInsideTanza : false);

  const senderSnapshot = {
    fullName: user.name,
    age: user.age,
    dateOfBirth: user.dateOfBirth,
    bloodType: user.bloodType,
    validIdFileId: user.proofOfResidencyFileId,
    faceCaptureFileId: user.faceCaptureFileId,
    proofOfResidencyFileId: user.proofOfResidencyFileId,
    municipality: user.municipality ?? 'Tanza',
    barangay: input.barangay ?? user.barangay,
  };

  /*
    An emergency is never gated on a dialog.

    For a scheduled or transfer booking the app shows the consent sheet and
    sends what was agreed. For an emergency it does not ask at all, and this
    records the basis RA 10173 actually provides for that case: processing
    necessary to protect life and health. The decision is made here rather than
    taken from the client, because a client can claim anything.

    A booking that arrives with no consent block at all is an older app, and is
    left bookable on purpose rather than refused mid-request.
  */
  const consent =
    input.requestType === 'emergency'
      ? {
          basis: 'vital_interest' as const,
          scopes: [],
          recordedAt: new Date(),
        }
      : input.consent
        ? {
            basis: 'consent' as const,
            version: input.consent.version,
            scopes: input.consent.scopes,
            recordedAt: new Date(),
          }
        : undefined;

  const created = await AmbulanceTransportRequest.create({
    requestType: input.requestType,
    status: 'pending_review',
    senderUserId: new mongoose.Types.ObjectId(auth.accountId),
    senderSnapshot,
    patient: input.patient,
    accompanyingPerson: input.accompanyingPerson,
    consent,
    pickupLocation: {
      type: 'Point',
      coordinates: input.pickupLocation.coordinates,
      addressLabel: input.pickupLocation.addressLabel,
      accuracyMeters: input.pickupLocation.accuracyMeters,
    },
    dropOffLocation: {
      type: 'Point',
      coordinates: input.dropOffLocation.coordinates,
      addressLabel: input.dropOffLocation.addressLabel,
      accuracyMeters: input.dropOffLocation.accuracyMeters,
    },
    requestedDate: input.requestedDate ? new Date(input.requestedDate) : undefined,
    requestedTime: input.requestedTime,
    transferDetails: input.transferDetails,
    notes: input.notes,
    isEmergencyPriority,
    isTanzaCitizenPriority,
    requiresImmediateReview: isEmergencyPriority,
    outsideScopeFlag: scope.outsideScopeFlag,
    timeline: [{ event: 'created', at: new Date(), actorId: user._id, actorRole: 'user' }],
  });

  await audit({
    actorId: auth.accountId,
    actorRole: 'user',
    action: 'ambulance_request.created',
    targetId: created._id as mongoose.Types.ObjectId,
    meta: { requestType: input.requestType, outsideScopeFlag: scope.outsideScopeFlag },
    ctx,
  });

  emitAmbulanceEvent(ctx.io, 'ambulance_request.created', created);
  return created;
}

export async function listMine(args: ListMineQuery, auth: AuthContext) {
  if (auth.role !== 'user') throw new AppError('Forbidden', 403, 'FORBIDDEN');
  const filter = { senderUserId: new mongoose.Types.ObjectId(auth.accountId) };
  const skip = (args.page - 1) * args.limit;
  const [items, total] = await Promise.all([
    AmbulanceTransportRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(args.limit)
      .populate({
        path: 'assignedAmbulanceUnitId',
        select: 'unitNumber unitName plateNumber',
      })
      .lean(),
    AmbulanceTransportRequest.countDocuments(filter),
  ]);
  return { items, total, page: args.page, limit: args.limit };
}

export async function getOne(id: string, auth: AuthContext) {
  const doc = await AmbulanceTransportRequest.findById(id)
    .populate({
      path: 'assignedAmbulanceUnitId',
      select: 'unitNumber unitName plateNumber availabilityStatus',
    })
    .populate({
      path: 'assignedResponderId',
      select: 'name phone responderRole department',
    })
    .lean();
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  const senderId =
    typeof doc.senderUserId === 'object' && doc.senderUserId !== null
      ? doc.senderUserId.toString()
      : String(doc.senderUserId);
  if (auth.role === 'user' && senderId !== auth.accountId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (auth.role === 'responder') {
    const responderRef = doc.assignedResponderId as
      | { _id?: { toString(): string } }
      | string
      | undefined
      | null;
    const responderId =
      responderRef && typeof responderRef === 'object'
        ? responderRef._id?.toString()
        : responderRef
          ? String(responderRef)
          : undefined;
    if (responderId !== auth.accountId) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
  }
  return doc;
}

export async function cancel(
  id: string,
  body: CancelBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  if (auth.role !== 'user') throw new AppError('Forbidden', 403, 'FORBIDDEN');
  const doc = await AmbulanceTransportRequest.findById(id);
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  if (doc.senderUserId.toString() !== auth.accountId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (doc.status !== 'pending_review') {
    throw new AppError('Cannot cancel after review begins', 409, 'INVALID_TRANSITION');
  }
  doc.status = 'cancelled';
  doc.timeline.push({
    event: 'cancelled',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'user',
    note: body.reason,
  } as never);
  await doc.save();
  await audit({
    actorId: auth.accountId,
    actorRole: 'user',
    action: 'ambulance_request.cancelled',
    targetId: doc._id as mongoose.Types.ObjectId,
    meta: body.reason ? { reason: body.reason } : undefined,
    ctx,
  });
  emitAmbulanceEvent(ctx.io, 'ambulance_request.cancelled', doc);
  return doc;
}

const REJECTED_VISIBILITY_DAYS = 31;

const ASSIGNABLE_RESPONDER_DUTY_STATUSES = new Set(['on_duty', 'available']);
const BLOCKED_RESPONDER_DUTY_STATUSES = new Set([
  'off_duty',
  'busy',
  'offline',
  'suspended',
  'inactive',
  'unavailable',
  'rejected',
  'pending',
  'not_approved',
]);

function assertResponderAssignable(responder: IResponder): void {
  if (!responder.isApproved || responder.approvalStatus !== 'approved') {
    throw new AppError('Responder not approved', 409, 'RESPONDER_NOT_APPROVED');
  }

  const dutyStatus = String(responder.dutyStatus ?? '').toLowerCase();
  const isActiveDuty =
    responder.isOnDuty === true || ASSIGNABLE_RESPONDER_DUTY_STATUSES.has(dutyStatus);

  if (!isActiveDuty || BLOCKED_RESPONDER_DUTY_STATUSES.has(dutyStatus)) {
    throw new AppError(
      'Selected responder is not currently active or available',
      409,
      'RESPONDER_NOT_AVAILABLE',
    );
  }
}

export async function listAdmin(args: ListAdminQuery) {
  const filter: Record<string, unknown> =
    args.status === 'all' ? {} : { status: args.status };
  if (args.requestType) filter.requestType = args.requestType;

  // PRD §6.3: hide rejected ambulance requests older than 31 days from the
  // default admin table; the rows stay in the database for audit. Admin can
  // opt in to viewing them with `includeArchived=true`.
  if (!args.includeArchived) {
    const cutoff = new Date(Date.now() - REJECTED_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);
    if (args.status === 'rejected') {
      filter.$or = [
        { reviewedAt: { $gte: cutoff } },
        { reviewedAt: { $exists: false } },
      ];
    } else if (args.status === 'all') {
      filter.$or = [
        { status: { $ne: 'rejected' } },
        { reviewedAt: { $gte: cutoff } },
        { status: 'rejected', reviewedAt: { $exists: false } },
      ];
    }
  }

  const skip = (args.page - 1) * args.limit;
  const [items, total] = await Promise.all([
    AmbulanceTransportRequest.find(filter)
      .sort({ isEmergencyPriority: -1, createdAt: -1 })
      .skip(skip)
      .limit(args.limit)
      .lean(),
    AmbulanceTransportRequest.countDocuments(filter),
  ]);
  return { items, total, page: args.page, limit: args.limit };
}

export async function approve(
  id: string,
  notes: string | undefined,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  const doc = await AmbulanceTransportRequest.findById(id);
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  if (doc.status !== 'pending_review') {
    throw new AppError('Only pending_review requests can be approved', 409, 'INVALID_TRANSITION');
  }
  doc.status = 'approved';
  doc.reviewedAt = new Date();
  doc.reviewedBy = new mongoose.Types.ObjectId(auth.accountId);
  doc.approvalNotes = notes;
  doc.timeline.push({
    event: 'approved',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'admin',
    note: notes,
  } as never);
  await doc.save();
  await audit({
    actorId: auth.accountId,
    actorRole: 'admin',
    action: 'ambulance_request.approved',
    targetId: doc._id as mongoose.Types.ObjectId,
    meta: notes ? { notes } : undefined,
    ctx,
  });
  emitAmbulanceEvent(ctx.io, 'ambulance_request.reviewed', doc);
  return doc;
}

export async function reject(
  id: string,
  reason: string,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  const doc = await AmbulanceTransportRequest.findById(id);
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  if (doc.status !== 'pending_review') {
    throw new AppError('Only pending_review requests can be rejected', 409, 'INVALID_TRANSITION');
  }
  doc.status = 'rejected';
  doc.reviewedAt = new Date();
  doc.reviewedBy = new mongoose.Types.ObjectId(auth.accountId);
  doc.rejectionReason = reason;
  doc.timeline.push({
    event: 'rejected',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'admin',
    note: reason,
  } as never);
  await doc.save();
  await audit({
    actorId: auth.accountId,
    actorRole: 'admin',
    action: 'ambulance_request.rejected',
    targetId: doc._id as mongoose.Types.ObjectId,
    meta: { reason },
    ctx,
  });
  emitAmbulanceEvent(ctx.io, 'ambulance_request.reviewed', doc);
  return doc;
}

export async function assign(
  id: string,
  body: AssignBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  const doc = await AmbulanceTransportRequest.findById(id);
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  if (doc.status !== 'approved') {
    throw new AppError('Only approved requests can be assigned', 409, 'INVALID_TRANSITION');
  }

  const unit = await AmbulanceUnit.findById(body.ambulanceUnitId);
  if (!unit) throw new AppError('Ambulance unit not found', 404, 'NOT_FOUND');
  if (['maintenance', 'out_of_service'].includes(unit.availabilityStatus)) {
    throw new AppError('Unit is not available', 409, 'UNIT_UNAVAILABLE');
  }

  const responder = await Responder.findById(body.responderId);
  if (!responder) throw new AppError('Responder not found', 404, 'NOT_FOUND');
  assertResponderAssignable(responder);

  let reservedFrom: Date;
  let reservedUntil: Date;
  if (doc.requestType === 'emergency') {
    reservedFrom = new Date();
    reservedUntil = body.reservedUntilAt ? new Date(body.reservedUntilAt) : new Date(Date.now() + 4 * 60 * 60 * 1000);
  } else {
    const dateStr = doc.requestedDate
      ? doc.requestedDate.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    reservedFrom = parseDatetime(dateStr, doc.requestedTime ?? '15:00');
    reservedUntil = body.reservedUntilAt ? new Date(body.reservedUntilAt) : windowEnd(dateStr);
  }

  const conflicts = await getAvailableUnits({
    startAt: reservedFrom,
    endAt: reservedUntil,
    excludeRequestId: id,
  });
  const unitAvailable = conflicts.some(
    (u) => u._id.toString() === body.ambulanceUnitId,
  );
  if (!unitAvailable) {
    throw new AppError(
      'Unit has a conflicting reservation for this time range',
      409,
      'UNIT_CONFLICT',
    );
  }

  doc.status = 'assigned';
  doc.assignedAmbulanceUnitId = unit._id as mongoose.Types.ObjectId;
  doc.assignedResponderId = responder._id as mongoose.Types.ObjectId;
  doc.assignedAt = new Date();
  doc.reservedFromAt = reservedFrom;
  doc.reservedUntilAt = reservedUntil;
  doc.timeline.push({
    event: 'assigned',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'admin',
  } as never);
  await doc.save();

  unit.availabilityStatus = 'assigned';
  unit.assignedResponderId = responder._id as mongoose.Types.ObjectId;
  unit.activeRequestId = doc._id as mongoose.Types.ObjectId;
  unit.assignmentStartAt = reservedFrom;
  unit.assignmentEndAt = reservedUntil;
  await unit.save();

  await audit({
    actorId: auth.accountId,
    actorRole: 'admin',
    action: 'ambulance_request.assigned',
    targetId: doc._id as mongoose.Types.ObjectId,
    meta: { unitNumber: unit.unitNumber, responderId: body.responderId },
    ctx,
  });
  emitAmbulanceEvent(ctx.io, 'ambulance_request.assigned', doc);
  return doc;
}

async function responderTransition(
  id: string,
  targetStatus: IAmbulanceTransportRequest['status'],
  fromStatus: IAmbulanceTransportRequest['status'],
  eventName: 'ambulance_request.on_the_way' | 'ambulance_request.arrived_pickup' | 'ambulance_request.patient_onboard' | 'ambulance_request.completed',
  body: ResponderUpdateBody,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  const doc = await AmbulanceTransportRequest.findById(id);
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  if (doc.assignedResponderId?.toString() !== auth.accountId) {
    throw new AppError('Not your assignment', 403, 'FORBIDDEN');
  }
  if (doc.status !== fromStatus) {
    throw new AppError(`Must be in '${fromStatus}' state`, 409, 'INVALID_TRANSITION');
  }

  doc.status = targetStatus;
  doc.timeline.push({
    event: targetStatus,
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'responder',
    note: body.note,
  } as never);
  await doc.save();

  if (targetStatus === 'completed' && doc.assignedAmbulanceUnitId) {
    await AmbulanceUnit.findByIdAndUpdate(doc.assignedAmbulanceUnitId, {
      availabilityStatus: 'available',
      $unset: {
        assignedResponderId: 1,
        activeRequestId: 1,
        assignmentStartAt: 1,
        assignmentEndAt: 1,
      },
    });
    ctx.io?.to('admin:live').emit('ambulance_availability.updated', {
      unitId: doc.assignedAmbulanceUnitId.toString(),
      status: 'available',
      occurredAt: new Date().toISOString(),
    });
  }

  await audit({
    actorId: auth.accountId,
    actorRole: 'responder',
    action: `ambulance_request.${targetStatus}`,
    targetId: doc._id as mongoose.Types.ObjectId,
    ctx,
  });
  emitAmbulanceEvent(ctx.io, eventName, doc);
  return doc;
}

export async function listResponderAssigned(auth: AuthContext) {
  return AmbulanceTransportRequest.find({
    assignedResponderId: new mongoose.Types.ObjectId(auth.accountId),
    status: { $in: ['assigned', 'on_the_way', 'arrived_pickup', 'patient_onboard'] },
  })
    .sort({ isEmergencyPriority: -1, assignedAt: -1 })
    .lean();
}

export const setOnTheWay = (id: string, body: ResponderUpdateBody, auth: AuthContext, ctx: ServiceCtx) =>
  responderTransition(id, 'on_the_way', 'assigned', 'ambulance_request.on_the_way', body, auth, ctx);

export const setArrivedPickup = (id: string, body: ResponderUpdateBody, auth: AuthContext, ctx: ServiceCtx) =>
  responderTransition(id, 'arrived_pickup', 'on_the_way', 'ambulance_request.arrived_pickup', body, auth, ctx);

export const setPatientOnboard = (id: string, body: ResponderUpdateBody, auth: AuthContext, ctx: ServiceCtx) =>
  responderTransition(id, 'patient_onboard', 'arrived_pickup', 'ambulance_request.patient_onboard', body, auth, ctx);

export const complete = (id: string, body: ResponderUpdateBody, auth: AuthContext, ctx: ServiceCtx) =>
  responderTransition(id, 'completed', 'patient_onboard', 'ambulance_request.completed', body, auth, ctx);

async function adminTransition(
  id: string,
  targetStatus: IAmbulanceTransportRequest['status'],
  fromStatuses: IAmbulanceTransportRequest['status'][],
  eventName:
    | 'ambulance_request.on_the_way'
    | 'ambulance_request.arrived_pickup'
    | 'ambulance_request.patient_onboard'
    | 'ambulance_request.completed',
  note: string | undefined,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<IAmbulanceTransportRequest> {
  if (auth.role !== 'admin') {
    throw new AppError('Admin only', 403, 'FORBIDDEN');
  }
  const doc = await AmbulanceTransportRequest.findById(id);
  if (!doc) throw new AppError('Request not found', 404, 'NOT_FOUND');
  if (!fromStatuses.includes(doc.status)) {
    throw new AppError(
      `Cannot transition from '${doc.status}' to '${targetStatus}'`,
      409,
      'INVALID_TRANSITION',
    );
  }

  doc.status = targetStatus;
  doc.timeline.push({
    event: targetStatus,
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'admin',
    note,
  } as never);
  await doc.save();

  if (targetStatus === 'completed' && doc.assignedAmbulanceUnitId) {
    await AmbulanceUnit.findByIdAndUpdate(doc.assignedAmbulanceUnitId, {
      availabilityStatus: 'available',
      $unset: {
        assignedResponderId: 1,
        activeRequestId: 1,
        assignmentStartAt: 1,
        assignmentEndAt: 1,
      },
    });
    ctx.io?.to('admin:live').emit('ambulance_availability.updated', {
      unitId: doc.assignedAmbulanceUnitId.toString(),
      status: 'available',
      occurredAt: new Date().toISOString(),
    });
  }

  await audit({
    actorId: auth.accountId,
    actorRole: 'admin',
    action: `ambulance_request.${targetStatus}`,
    targetId: doc._id as mongoose.Types.ObjectId,
    meta: note ? { note } : undefined,
    ctx,
  });
  emitAmbulanceEvent(ctx.io, eventName, doc);
  return doc;
}

export const adminMarkOnTheWay = (id: string, note: string | undefined, auth: AuthContext, ctx: ServiceCtx) =>
  adminTransition(
    id,
    'on_the_way',
    ['assigned'],
    'ambulance_request.on_the_way',
    note,
    auth,
    ctx,
  );

export const adminMarkPickedUp = (id: string, note: string | undefined, auth: AuthContext, ctx: ServiceCtx) =>
  adminTransition(
    id,
    'patient_onboard',
    ['assigned', 'on_the_way', 'arrived_pickup'],
    'ambulance_request.patient_onboard',
    note,
    auth,
    ctx,
  );

export const adminMarkCompleted = (id: string, note: string | undefined, auth: AuthContext, ctx: ServiceCtx) =>
  adminTransition(
    id,
    'completed',
    ['assigned', 'on_the_way', 'arrived_pickup', 'patient_onboard'],
    'ambulance_request.completed',
    note,
    auth,
    ctx,
  );

export async function getAvailableUnitsForAdmin(query: AvailableUnitsQuery): Promise<IAmbulanceUnit[]> {
  let startAt = query.startAt ? new Date(query.startAt) : new Date();
  let endAt = query.endAt ? new Date(query.endAt) : new Date(startAt.getTime() + 4 * 60 * 60 * 1000);
  if (query.requestId) {
    const doc = await AmbulanceTransportRequest.findById(query.requestId).lean();
    if (doc?.requestedDate && doc?.requestedTime) {
      const dateStr = doc.requestedDate.toISOString().slice(0, 10);
      startAt = parseDatetime(dateStr, doc.requestedTime);
      endAt = windowEnd(dateStr);
    }
  }
  return getAvailableUnits({ startAt, endAt, excludeRequestId: query.requestId });
}
