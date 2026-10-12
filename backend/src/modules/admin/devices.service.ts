import mongoose from 'mongoose';
import { BleDevice, Emergency, User } from '../../models/index.js';
import type { ListDevicesQuery } from './devices.schemas.js';

/**
 * How recently a device must have been heard from to count as live.
 *
 * The phone relays a check-in every two minutes while it holds a Bluetooth link,
 * so five minutes tolerates one missed relay plus clock skew without flapping.
 */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Beyond this, "we have not heard from it in a while" stops being useful nuance
 * and the device should be treated as unaccounted for.
 */
const IDLE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DeviceLinkStatus = 'online' | 'idle' | 'offline' | 'unpaired';

/**
 * Why a device could not raise an alert right now, or `ready`.
 *
 * `not_enrolled` is the one that matters most and is easy to miss: a paired device
 * with no fingerprint template physically cannot send an SOS, because the firmware
 * requires a verified finger before it will accept the button. It will sit there
 * looking healthy and do nothing in an emergency.
 */
export type DeviceReadiness =
  | 'ready'
  | 'not_enrolled'
  | 'unpaired'
  | 'owner_not_approved';

function linkStatusOf(device: {
  pairingStatus: string;
  lastSeenAt?: Date | null;
}): DeviceLinkStatus {
  if (device.pairingStatus !== 'paired') return 'unpaired';
  if (!device.lastSeenAt) return 'offline';
  const age = Date.now() - new Date(device.lastSeenAt).getTime();
  if (age <= ONLINE_WINDOW_MS) return 'online';
  if (age <= IDLE_WINDOW_MS) return 'idle';
  return 'offline';
}

function readinessOf(
  device: { pairingStatus: string; fingerprintEnrolled: boolean },
  ownerApproved: boolean,
): DeviceReadiness {
  if (device.pairingStatus !== 'paired') return 'unpaired';
  if (!ownerApproved) return 'owner_not_approved';
  if (!device.fingerprintEnrolled) return 'not_enrolled';
  return 'ready';
}

export interface AdminDeviceOwner {
  id: string;
  name?: string;
  phone?: string;
  barangay?: string;
  approvalStatus?: string;
  isApproved: boolean;
}

export interface AdminDeviceRow {
  id: string;
  deviceId: string;
  linkStatus: DeviceLinkStatus;
  readiness: DeviceReadiness;
  lastSeenAt?: string;
  lastCheckInAt?: string;
  secondsSinceSeen?: number;
  owner?: AdminDeviceOwner;
  firmwareVersion?: string;
  batteryPercent?: number;
  fingerprintEnrolled: boolean;
  directCellularEnabled: boolean;
  lastTransport?: 'ble' | 'lte';
  pairedAt?: string;
  revokedAt?: string;
  revokedReason?: string;
  /** The incident this device is currently streaming its position into, if any. */
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
  /** Paired devices that cannot raise an alert as they stand. */
  needsAttention: number;
  tracking: number;
}

export async function listDevices(args: ListDevicesQuery) {
  // Status and readiness are both derived from the clock and from the owner's
  // approval, so neither can be expressed as a Mongo filter without duplicating
  // the thresholds. The device collection is one row per wearable — small enough
  // to classify in memory, which keeps a single definition of "online".
  const devices = await BleDevice.find().sort({ lastSeenAt: -1, pairedAt: -1 }).lean();

  const ownerIds = devices.map((d) => d.userId).filter(Boolean);
  const owners = await User.find({ _id: { $in: ownerIds } })
    .select('name phone barangay approvalStatus isApproved')
    .lean();
  const ownerById = new Map(owners.map((o) => [o._id.toString(), o]));

  const deviceIds = devices.map((d) => d.deviceId);
  const [incidentCounts, trackingIncidents] = await Promise.all([
    Emergency.aggregate<{ _id: string; count: number }>([
      { $match: { sourceDeviceId: { $in: deviceIds } } },
      { $group: { _id: '$sourceDeviceId', count: { $sum: 1 } } },
    ]),
    Emergency.find({ sourceDeviceId: { $in: deviceIds }, trackingActive: true })
      .select('sourceDeviceId status locationStatus locationRevision createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const countByDevice = new Map(incidentCounts.map((c) => [c._id, c.count]));
  const trackingByDevice = new Map<string, (typeof trackingIncidents)[number]>();
  for (const incident of trackingIncidents) {
    // Sorted newest first, so the first one wins if a device somehow has two open.
    if (incident.sourceDeviceId && !trackingByDevice.has(incident.sourceDeviceId)) {
      trackingByDevice.set(incident.sourceDeviceId, incident);
    }
  }

  const rows: AdminDeviceRow[] = devices.map((device) => {
    const owner = ownerById.get(device.userId?.toString() ?? '');
    const ownerApproved = !!owner?.isApproved && owner?.approvalStatus === 'approved';
    const tracking = trackingByDevice.get(device.deviceId);
    return {
      id: device._id.toString(),
      deviceId: device.deviceId,
      linkStatus: linkStatusOf(device),
      readiness: readinessOf(device, ownerApproved),
      lastSeenAt: device.lastSeenAt?.toISOString(),
      lastCheckInAt: device.lastCheckInAt?.toISOString(),
      secondsSinceSeen: device.lastSeenAt
        ? Math.max(0, Math.round((Date.now() - device.lastSeenAt.getTime()) / 1000))
        : undefined,
      owner: owner
        ? {
            id: owner._id.toString(),
            name: owner.name,
            phone: owner.phone,
            barangay: owner.barangay,
            approvalStatus: owner.approvalStatus,
            isApproved: !!owner.isApproved,
          }
        : undefined,
      firmwareVersion: device.firmwareVersion,
      batteryPercent: device.batteryPercent,
      fingerprintEnrolled: !!device.fingerprintEnrolled,
      directCellularEnabled: !!device.directCellularEnabled,
      lastTransport: device.lastTransport,
      pairedAt: device.pairedAt?.toISOString(),
      revokedAt: device.revokedAt?.toISOString(),
      revokedReason: device.revokedReason,
      activeIncident: tracking
        ? {
            id: tracking._id.toString(),
            status: tracking.status,
            locationStatus: tracking.locationStatus ?? 'fixed',
            locationRevision: tracking.locationRevision ?? 0,
            createdAt: tracking.createdAt.toISOString(),
          }
        : undefined,
      totalIncidents: countByDevice.get(device.deviceId) ?? 0,
    };
  });

  // A deliberately unpaired device is not a fault, so it is excluded here. One
  // predicate, used by both the tile and the filter, so the count a dispatcher
  // sees always matches the rows they get when they click it.
  const needsAttention = (row: AdminDeviceRow) =>
    row.readiness === 'not_enrolled' || row.readiness === 'owner_not_approved';

  const summary: DeviceFleetSummary = {
    total: rows.length,
    online: rows.filter((r) => r.linkStatus === 'online').length,
    idle: rows.filter((r) => r.linkStatus === 'idle').length,
    offline: rows.filter((r) => r.linkStatus === 'offline').length,
    unpaired: rows.filter((r) => r.linkStatus === 'unpaired').length,
    needsAttention: rows.filter(needsAttention).length,
    tracking: rows.filter((r) => r.activeIncident).length,
  };

  let filtered = rows;
  if (args.status !== 'all') {
    filtered = filtered.filter((r) => r.linkStatus === args.status);
  }
  if (args.needsAttention) {
    filtered = filtered.filter(needsAttention);
  }
  if (args.q) {
    const needle = args.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.deviceId.toLowerCase().includes(needle) ||
        r.owner?.name?.toLowerCase().includes(needle) ||
        r.owner?.barangay?.toLowerCase().includes(needle),
    );
  }

  const skip = (args.page - 1) * args.limit;
  return {
    items: filtered.slice(skip, skip + args.limit),
    total: filtered.length,
    page: args.page,
    limit: args.limit,
    // Always describes the whole fleet, not the current filter, so the tiles do
    // not change meaning when a filter is applied.
    summary,
    thresholds: {
      onlineWithinSeconds: ONLINE_WINDOW_MS / 1000,
      idleWithinSeconds: IDLE_WINDOW_MS / 1000,
    },
  };
}

/**
 * Records that the owner's phone currently holds a Bluetooth link to the device.
 *
 * This is what makes "last seen" mean anything: left to itself a panic button only
 * contacts the backend when it has an alert to send, so an idle but perfectly
 * healthy wearable would read as days stale on the dashboard.
 */
export async function checkInDevice(
  deviceDocId: string,
  accountId: string,
  patch: { batteryPercent?: number; firmwareVersion?: string; rssi?: number },
) {
  const now = new Date();
  const update: Record<string, unknown> = { lastSeenAt: now, lastCheckInAt: now };
  if (patch.batteryPercent !== undefined) update.batteryPercent = patch.batteryPercent;
  if (patch.firmwareVersion) update.firmwareVersion = patch.firmwareVersion;
  if (patch.rssi !== undefined) update.lastRssi = patch.rssi;

  const device = await BleDevice.findOneAndUpdate(
    {
      _id: deviceDocId,
      userId: new mongoose.Types.ObjectId(accountId),
      pairingStatus: 'paired',
    },
    { $set: update },
    { new: true },
  ).lean();
  return device ? { deviceId: device.deviceId, lastCheckInAt: now.toISOString() } : null;
}
