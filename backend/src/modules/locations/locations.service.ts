import mongoose from 'mongoose';
import type { Server as SocketServer } from 'socket.io';
import {
  Emergency,
  LocationSample,
  Responder,
  User,
  type DutyStatus,
} from '../../models/index.js';
import { env } from '../../config/env.js';
import { emitEmergencyEvent } from '../emergencies/events.js';
import { AppError } from '../../shared/middleware/errorHandler.js';
import type { AuthContext } from '../../shared/types/http.js';
import type { HistoryQuery, IngestLocationInput } from './locations.schemas.js';

interface ServiceCtx {
  io?: SocketServer;
  requestId?: string;
}

const LIVE_RESPONDER_STATUSES = new Set<DutyStatus>([
  'on_duty',
  'available',
  'busy',
  'responding',
]);

function isLiveResponderStatus(status: DutyStatus): boolean {
  return LIVE_RESPONDER_STATUSES.has(status);
}

export async function ingestUserLocation(
  input: IngestLocationInput,
  auth: AuthContext,
  ctx: ServiceCtx,
) {
  const sample = await LocationSample.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorType: 'user',
    location: { type: 'Point', coordinates: input.coordinates },
    accuracyMeters: input.accuracyMeters,
    capturedAt: new Date(input.capturedAt),
    emergencyId: input.emergencyId
      ? new mongoose.Types.ObjectId(input.emergencyId)
      : undefined,
    ambulanceRequestId: input.ambulanceRequestId
      ? new mongoose.Types.ObjectId(input.ambulanceRequestId)
      : undefined,
  });

  await User.findByIdAndUpdate(auth.accountId, {
    $push: {
      locationHistory: {
        $each: [
          {
            type: 'Point',
            coordinates: input.coordinates,
            accuracyMeters: input.accuracyMeters,
            capturedAt: new Date(input.capturedAt),
          },
        ],
        $slice: -100,
      },
    },
  });

  ctx.io?.to(`user:${auth.accountId}`).emit('location.user_updated', {
    userId: auth.accountId,
    coordinates: input.coordinates,
    accuracyMeters: input.accuracyMeters,
    capturedAt: input.capturedAt,
    emergencyId: input.emergencyId,
  });

  if (input.emergencyId) {
    ctx.io?.to(`emergency:${input.emergencyId}`).emit('location.user_updated', {
      userId: auth.accountId,
      coordinates: input.coordinates,
      capturedAt: input.capturedAt,
    });
  }

  return sample;
}

/** Metres between two WGS84 points. */
function metresBetween(
  [lngA, latA]: [number, number],
  [lngB, latB]: [number, number],
): number {
  const earthRadius = 6371000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Says "they are nearly here" without anybody pressing anything.
 *
 * The responder is already streaming their position against this incident, so
 * the one fact the person waiting most wants is sitting in the data. It fires
 * once -- the status only moves out of `assigned` or `responder_on_the_way` --
 * so a responder circling the block cannot send the same promise five times.
 *
 * An incident with no fix yet, a panic button still hunting for GNSS, has
 * nothing to be near and is left alone rather than guessed at.
 */
async function flagResponderNearby(
  input: IngestLocationInput,
  auth: AuthContext,
  ctx: ServiceCtx,
): Promise<void> {
  if (!input.emergencyId) return;
  const emergency = await Emergency.findById(input.emergencyId);
  if (!emergency) return;
  if (emergency.assignedResponderId?.toString() !== auth.accountId) return;
  if (emergency.status !== 'assigned' && emergency.status !== 'responder_on_the_way') {
    return;
  }
  const scene = emergency.currentLocation?.coordinates;
  if (!scene) return;

  const metres = metresBetween(
    input.coordinates as [number, number],
    scene as [number, number],
  );
  if (metres > env.RESPONDER_NEARBY_METERS) return;

  emergency.status = 'responder_nearby';
  emergency.timeline.push({
    event: 'responder_nearby',
    at: new Date(),
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorRole: 'system',
    note: `Responder within ${Math.round(metres)} m of the scene.`,
  } as never);
  await emergency.save();

  emitEmergencyEvent(ctx.io, 'emergency.responder_nearby', emergency);
}

export async function ingestResponderLocation(
  input: IngestLocationInput,
  auth: AuthContext,
  ctx: ServiceCtx,
) {
  const sample = await LocationSample.create({
    actorId: new mongoose.Types.ObjectId(auth.accountId),
    actorType: 'responder',
    location: { type: 'Point', coordinates: input.coordinates },
    accuracyMeters: input.accuracyMeters,
    capturedAt: new Date(input.capturedAt),
    emergencyId: input.emergencyId
      ? new mongoose.Types.ObjectId(input.emergencyId)
      : undefined,
    ambulanceRequestId: input.ambulanceRequestId
      ? new mongoose.Types.ObjectId(input.ambulanceRequestId)
      : undefined,
  });

  const responder = await Responder.findByIdAndUpdate(auth.accountId, {
    $set: {
      currentLocation: {
        latitude: input.coordinates[1],
        longitude: input.coordinates[0],
      },
    },
    $push: {
      locationHistory: {
        $each: [
          {
            type: 'Point',
            coordinates: input.coordinates,
            accuracyMeters: input.accuracyMeters,
            capturedAt: new Date(input.capturedAt),
          },
        ],
        $slice: -100,
      },
    },
  }, { new: true });

  ctx.io?.to('admin:live').emit('location.responder_updated', {
    responderId: auth.accountId,
    name: responder?.name,
    agencyType: responder?.agencyType,
    dutyStatus: responder?.dutyStatus,
    coordinates: input.coordinates,
    accuracyMeters: input.accuracyMeters,
    capturedAt: input.capturedAt,
    emergencyId: input.emergencyId,
  });

  // After the broadcast: a failure in the proximity check must not cost the
  // dashboard the live position, which is the more important of the two.
  try {
    await flagResponderNearby(input, auth, ctx);
  } catch (err) {
    console.error('[locations] responder-nearby check failed', err);
  }

  if (input.emergencyId) {
    const emergency = await Emergency.findById(input.emergencyId)
      .select('userId')
      .lean();
    ctx.io?.to(`emergency:${input.emergencyId}`).emit('location.responder_updated', {
      responderId: auth.accountId,
      coordinates: input.coordinates,
      capturedAt: input.capturedAt,
    });
    if (emergency?.userId) {
      ctx.io?.to(`user:${emergency.userId.toString()}`).emit('location.responder_updated', {
        responderId: auth.accountId,
        coordinates: input.coordinates,
        capturedAt: input.capturedAt,
      });
    }
  }

  return sample;
}

export async function getEmergencyLocationHistory(
  emergencyId: string,
  query: HistoryQuery,
  auth: AuthContext,
) {
  const emergency = await Emergency.findById(emergencyId).lean();
  if (!emergency) throw new AppError('Emergency not found', 404, 'NOT_FOUND');

  if (auth.role === 'user' && emergency.userId.toString() !== auth.accountId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  if (
    auth.role === 'responder' &&
    emergency.assignedResponderId?.toString() !== auth.accountId
  ) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  const filter: Record<string, unknown> = {
    emergencyId: new mongoose.Types.ObjectId(emergencyId),
  };
  if (query.before) filter.capturedAt = { $lt: new Date(query.before) };

  return LocationSample.find(filter)
    .sort({ capturedAt: -1 })
    .limit(query.limit)
    .lean();
}

export async function getAmbulanceLocationHistory(
  requestId: string,
  query: HistoryQuery,
  auth: AuthContext,
) {
  const filter: Record<string, unknown> = {
    ambulanceRequestId: new mongoose.Types.ObjectId(requestId),
  };
  if (query.before) filter.capturedAt = { $lt: new Date(query.before) };
  if (auth.role === 'user') filter.actorType = 'responder';

  return LocationSample.find(filter)
    .sort({ capturedAt: -1 })
    .limit(query.limit)
    .lean();
}

export async function getRespondersLive() {
  const responders = await Responder.find({
    isApproved: true,
    dutyStatus: { $in: [...LIVE_RESPONDER_STATUSES] },
    currentLocation: { $exists: true },
  })
    .select('_id name agencyType dutyStatus currentLocation locationHistory')
    .lean();

  return responders.map((r) => ({
    responderId: r._id,
    name: r.name,
    agencyType: r.agencyType,
    dutyStatus: r.dutyStatus,
    currentLocation: r.currentLocation,
    lastSeen: (r.locationHistory as Array<{ capturedAt: Date }>).at(-1)?.capturedAt,
  }));
}

export async function updateResponderDutyStatus(
  responderId: string,
  status: DutyStatus,
  ctx: ServiceCtx,
) {
  const updated = await Responder.findByIdAndUpdate(
    responderId,
    {
      $set: {
        dutyStatus: status,
        isOnDuty: isLiveResponderStatus(status),
      },
    },
    { new: true },
  ).lean();
  if (!updated) throw new AppError('Responder not found', 404, 'NOT_FOUND');

  const payload = {
    responderId,
    name: updated.name,
    agencyType: updated.agencyType,
    dutyStatus: updated.dutyStatus,
    isVisibleOnMap:
      isLiveResponderStatus(updated.dutyStatus) && !!updated.currentLocation,
    currentLocation: updated.currentLocation,
    lastSeen: (updated.locationHistory as Array<{ capturedAt: Date }>).at(-1)?.capturedAt,
  };
  ctx.io?.to('admin:live').emit('responder.status_updated', payload);
  return { dutyStatus: updated.dutyStatus };
}
