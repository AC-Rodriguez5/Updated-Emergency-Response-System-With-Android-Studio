import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import {
  FakeIo,
  authFor,
  clearDatabase,
  codeOf,
  makeEmergency,
  makeResponder,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
} from '../../test/fixtures.js';
import { emitEmergencyEvent } from './events.js';
import { RESPONDER_BROADCAST_ROOM } from './responderRoleAccess.js';
import * as svc from './emergencies.service.js';

/**
 * Whether a panic-button press reaches a responder at all.
 *
 * It did not. The wearable has one button and no way to ask what happened, so
 * the backend files its alerts as `general_sos` — a placeholder, not a triage
 * decision. Run through the ordinary role filter, that placeholder sent every
 * hardware alert to MDRRMO and rescue accounts and to nobody else: a medic, a
 * fire responder or a police responder on duty two streets away was never
 * told, over a category the press never claimed.
 *
 * These are the four places that had to agree before the alert arrives: the
 * socket fan-out, the feed it must survive a refresh in, the incident room, and
 * the accept the responder then presses.
 */

const io = new FakeIo();
const ctx = () => ({ io: io.server, requestId: 'test-request' });
const idOf = (doc: { _id: unknown }): string =>
  (doc._id as mongoose.Types.ObjectId).toString();

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  io.reset();
});

describe('socket fan-out', () => {
  it('sends a hardware alert to every responder, not just the general_sos feed', async () => {
    const userId = await makeUser();
    const press = await makeEmergency({
      userId,
      type: 'general_sos',
      source: 'iot_device',
    });

    emitEmergencyEvent(io.server, 'emergency.iot_device_created', press);

    const rooms = io.roomsFor('emergency.iot_device_created');
    expect(rooms).toContain(RESPONDER_BROADCAST_ROOM);
    expect(rooms).toContain('responder-feed:general_sos');
    expect(rooms).toContain('admin:live');
  });

  it('leaves a resident-reported incident to the feed its type belongs to', async () => {
    const userId = await makeUser();
    const reported = await makeEmergency({ userId, type: 'medical' });

    emitEmergencyEvent(io.server, 'emergency.created', reported);

    const rooms = io.roomsFor('emergency.created');
    expect(rooms).toContain('responder-feed:medical');
    expect(rooms).not.toContain(RESPONDER_BROADCAST_ROOM);
  });
});

describe('the feed behind the socket', () => {
  it('lists a hardware alert for a medic whose role covers only medical', async () => {
    const userId = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });
    const press = await makeEmergency({
      userId,
      type: 'general_sos',
      source: 'iot_device',
    });

    const feed = await svc.listActive(
      { page: 1, limit: 50 },
      authFor('responder', medic),
    );

    expect(feed.items.map((item) => idOf(item))).toContain(idOf(press));
  });

  it('still keeps a resident-reported incident out of the wrong role', async () => {
    const userId = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });
    const fire = await makeEmergency({ userId, type: 'fire' });

    const feed = await svc.listActive(
      { page: 1, limit: 50 },
      authFor('responder', medic),
    );

    expect(feed.items.map((item) => idOf(item))).not.toContain(idOf(fire));
  });
});

describe('what the responder can then do with it', () => {
  it('lets any responder subscribe to a hardware incident', async () => {
    const userId = await makeUser();
    const firefighter = await makeResponder({ department: 'fire', agencyType: 'bfp' });
    const press = await makeEmergency({
      userId,
      type: 'general_sos',
      source: 'iot_device',
    });

    await expect(
      svc.canSubscribeToEmergency(authFor('responder', firefighter), idOf(press)),
    ).resolves.toBe(true);
  });

  it('lets any responder accept one — an untriaged press belongs to whoever is nearest', async () => {
    const userId = await makeUser();
    const officer = await makeResponder({ department: 'police', agencyType: 'pnp' });
    const press = await makeEmergency({
      userId,
      type: 'general_sos',
      source: 'iot_device',
    });

    const assigned = await svc.assign(
      idOf(press),
      {},
      authFor('responder', officer),
      ctx(),
    );

    expect(assigned.assignedResponderId?.toString()).toBe(officer);
  });

  it('does not widen anything else: a reported fire is still refused to a medic', async () => {
    const userId = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });
    const fire = await makeEmergency({ userId, type: 'fire' });

    await expect(
      svc.assign(idOf(fire), {}, authFor('responder', medic), ctx()),
    ).rejects.toSatisfy((error) => codeOf(error) === 'OUT_OF_ROLE');
  });
});
