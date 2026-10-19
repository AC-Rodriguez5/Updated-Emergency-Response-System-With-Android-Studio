import mongoose from 'mongoose';
import type { Server as SocketServer } from 'socket.io';
import { MongoMemoryServer } from 'mongodb-memory-server';

import {
  Emergency,
  Responder,
  User,
  type AgencyType,
  type IEmergency,
  type EmergencyType,
} from '../models/index.js';
import type { AuthContext } from '../shared/types/http.js';

/**
 * A real MongoDB, in memory, for the tests that decide who gets dispatched.
 *
 * Mocks were the cheaper option and the wrong one here: half of what the
 * dispatch rules depend on is query semantics — `{ assignmentAckAt: null }`
 * matching a field that was never written, `doc.set(field, undefined)` actually
 * unsetting it — and a mock would have agreed with whatever the code did.
 */
let memoryServer: MongoMemoryServer | undefined;

export async function startTestDatabase(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri(), { dbName: 'tanzalert-test' });
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await memoryServer?.stop();
}

export async function clearDatabase(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}

/** Captures what went out on the wire, so events can be asserted on. */
export class FakeIo {
  readonly emitted: Array<{ room: string; event: string }> = [];

  readonly server = {
    to: (room: string) => ({
      emit: (event: string) => {
        this.emitted.push({ room, event });
      },
    }),
  } as unknown as SocketServer;

  eventsNamed(event: string): Array<{ room: string; event: string }> {
    return this.emitted.filter((entry) => entry.event === event);
  }

  sawEvent(event: string): boolean {
    return this.emitted.some((entry) => entry.event === event);
  }

  roomsFor(event: string): string[] {
    return this.eventsNamed(event).map((entry) => entry.room);
  }

  reset(): void {
    this.emitted.length = 0;
  }
}

export function authFor(
  role: 'user' | 'responder' | 'admin',
  accountId: string,
): AuthContext {
  return { accountId, email: `${role}@tanzalert.test`, role };
}

let sequence = 0;

export async function makeUser(): Promise<string> {
  sequence += 1;
  const user = await User.create({
    name: `Resident ${sequence}`,
    email: `resident${sequence}@tanzalert.test`,
    phone: `0917000${sequence.toString().padStart(4, '0')}`,
    password: 'hashed-not-used-here',
    isApproved: true,
    approvalStatus: 'approved',
  });
  return (user._id as mongoose.Types.ObjectId).toString();
}

interface ResponderOptions {
  department?: 'police' | 'medical' | 'fire' | 'rescue' | 'barangay';
  agencyType?: AgencyType;
  approved?: boolean;
}

export async function makeResponder({
  department = 'medical',
  agencyType = 'medical',
  approved = true,
}: ResponderOptions = {}): Promise<string> {
  sequence += 1;
  const responder = await Responder.create({
    name: `Responder ${sequence}`,
    email: `responder${sequence}@tanzalert.test`,
    password: 'hashed-not-used-here',
    badgeId: `BADGE-${sequence}`,
    department,
    agencyType,
    isApproved: approved,
    approvalStatus: approved ? 'approved' : 'pending',
    dutyStatus: 'on_duty',
  });
  return (responder._id as mongoose.Types.ObjectId).toString();
}

interface EmergencyOptions {
  userId: string;
  type?: EmergencyType;
  status?: IEmergency['status'];
  assignedResponderId?: string;
  createdAt?: Date;
  withLocation?: boolean;
}

export async function makeEmergency({
  userId,
  type = 'medical',
  status = 'pending',
  assignedResponderId,
  createdAt,
  withLocation = true,
}: EmergencyOptions): Promise<IEmergency> {
  const doc = await Emergency.create({
    type,
    source: 'mobile_app',
    priority: 'high',
    status,
    userId: new mongoose.Types.ObjectId(userId),
    assignedResponderId: assignedResponderId
      ? new mongoose.Types.ObjectId(assignedResponderId)
      : undefined,
    currentLocation: withLocation
      ? {
          type: 'Point',
          coordinates: [120.8778, 14.3126],
          accuracyMeters: 12,
          capturedAt: new Date(),
        }
      : undefined,
    locationStatus: withLocation ? 'fixed' : 'pending',
    isInsideTanza: true,
    outsideScopeFlag: false,
    trackingActive: true,
    barangay: 'Biga',
  });

  if (createdAt) {
    // `timestamps: true` marks createdAt immutable, so a Mongoose update is
    // silently dropped and the document never ages. Go through the driver.
    await Emergency.collection.updateOne(
      { _id: doc._id as mongoose.Types.ObjectId },
      { $set: { createdAt } },
    );
    const reloaded = await Emergency.findById(doc._id);
    return reloaded!;
  }
  return doc;
}

export async function reload(doc: IEmergency): Promise<IEmergency> {
  const fresh = await Emergency.findById(doc._id);
  if (!fresh) throw new Error('emergency vanished');
  return fresh;
}

export function timelineEvents(doc: IEmergency): string[] {
  return doc.timeline.map((entry) => entry.event);
}

/** The error code an AppError carries, for asserting on refusals. */
export function codeOf(error: unknown): string {
  return (error as { code?: string }).code ?? String(error);
}
