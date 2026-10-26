import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import {
  authFor,
  clearDatabase,
  makeEmergency,
  makeResponder,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
} from '../../test/fixtures.js';
import { canSubscribeToEmergency } from './emergencies.service.js';

/**
 * Who may listen to one incident.
 *
 * A room join never passes through a route, so this rule is the only thing
 * between an ObjectId and a stranger's name, phone number and live position.
 * It has to say no to exactly the people `loadAccessible` says no to.
 */

const idOf = (doc: { _id: unknown }): string =>
  (doc._id as mongoose.Types.ObjectId).toString();

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

describe('canSubscribeToEmergency', () => {
  it('lets the person who raised it listen, and nobody else of their kind', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const emergency = await makeEmergency({ userId: owner });

    await expect(
      canSubscribeToEmergency(authFor('user', owner), idOf(emergency)),
    ).resolves.toBe(true);
    await expect(
      canSubscribeToEmergency(authFor('user', stranger), idOf(emergency)),
    ).resolves.toBe(false);
  });

  it('lets a dispatcher listen to anything', async () => {
    const owner = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const closed = await makeEmergency({ userId: owner, status: 'resolved' });

    await expect(
      canSubscribeToEmergency(authFor('admin', adminId), idOf(closed)),
    ).resolves.toBe(true);
  });

  it('lets a responder listen to an open incident their role covers', async () => {
    const owner = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });
    const medical = await makeEmergency({ userId: owner, type: 'medical' });

    await expect(
      canSubscribeToEmergency(authFor('responder', medic), idOf(medical)),
    ).resolves.toBe(true);
  });

  it('refuses a responder a type outside their role', async () => {
    const owner = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });
    const fire = await makeEmergency({ userId: owner, type: 'fire' });

    await expect(
      canSubscribeToEmergency(authFor('responder', medic), idOf(fire)),
    ).resolves.toBe(false);
  });

  it('keeps the assigned responder on it after it closes, and shuts out the rest', async () => {
    const owner = await makeUser();
    const assignee = await makeResponder();
    const bystander = await makeResponder();
    const closed = await makeEmergency({
      userId: owner,
      status: 'resolved',
      assignedResponderId: assignee,
    });

    // They worked it; their app still has it open.
    await expect(
      canSubscribeToEmergency(authFor('responder', assignee), idOf(closed)),
    ).resolves.toBe(true);
    // In role, but it is over and was never theirs.
    await expect(
      canSubscribeToEmergency(authFor('responder', bystander), idOf(closed)),
    ).resolves.toBe(false);
  });

  it('refuses an id that matches nothing', async () => {
    const adminId = new mongoose.Types.ObjectId().toString();
    const responderId = await makeResponder();
    const missing = new mongoose.Types.ObjectId().toString();

    await expect(
      canSubscribeToEmergency(authFor('admin', adminId), missing),
    ).resolves.toBe(false);
    await expect(
      canSubscribeToEmergency(authFor('responder', responderId), missing),
    ).resolves.toBe(false);
  });

  it('refuses a responder account that no longer exists', async () => {
    const owner = await makeUser();
    const ghost = new mongoose.Types.ObjectId().toString();
    const emergency = await makeEmergency({ userId: owner });

    await expect(
      canSubscribeToEmergency(authFor('responder', ghost), idOf(emergency)),
    ).resolves.toBe(false);
  });
});
