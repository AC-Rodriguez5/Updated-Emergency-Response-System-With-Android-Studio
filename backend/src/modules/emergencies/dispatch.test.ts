import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import { Emergency, Responder } from '../../models/index.js';
import {
  FakeIo,
  authFor,
  clearDatabase,
  codeOf,
  makeEmergency,
  makeResponder,
  makeUser,
  reload,
  startTestDatabase,
  stopTestDatabase,
  timelineEvents,
} from '../../test/fixtures.js';
import { sweepDispatch } from './dispatch.watchdog.js';
import * as svc from './emergencies.service.js';

/**
 * The dispatch state machine.
 *
 * Everything here answers one of two questions: who is allowed to move an
 * incident, and what the system does by itself when nobody does. Both decide
 * whether help is on its way or only looks like it is, so they are the part of
 * this backend worth pinning down.
 */

const io = new FakeIo();
const ctx = (): { io: ReturnType<() => typeof io.server>; requestId: string } => ({
  io: io.server,
  requestId: 'test-request',
});

async function dutyStatusOf(responderId: string): Promise<string | undefined> {
  const responder = await Responder.findById(responderId).lean();
  return responder?.dutyStatus;
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  io.reset();
});

describe('taking an incident', () => {
  it('a responder accepting from the feed is assigned and already acknowledged', async () => {
    const userId = await makeUser();
    const responderId = await makeResponder({ department: 'medical' });
    const emergency = await makeEmergency({ userId, type: 'medical' });

    await svc.assign(
      (emergency._id as mongoose.Types.ObjectId).toString(),
      {},
      authFor('responder', responderId),
      ctx(),
    );

    const updated = await reload(emergency);
    expect(updated.status).toBe('assigned');
    expect(updated.assignedResponderId?.toString()).toBe(responderId);
    // Accepting is itself the acknowledgement, so no deadline is set.
    expect(updated.assignmentAckAt).toBeInstanceOf(Date);
    expect(updated.assignmentDeadlineAt ?? null).toBeNull();
    expect(timelineEvents(updated)).toContain('assigned');
    expect(await dutyStatusOf(responderId)).toBe('busy');
    expect(io.sawEvent('emergency.assigned')).toBe(true);
  });

  it("a dispatcher's assignment waits to be answered", async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId });

    await svc.assign(
      (emergency._id as mongoose.Types.ObjectId).toString(),
      { responderId },
      authFor('admin', adminId),
      ctx(),
    );

    const updated = await reload(emergency);
    expect(updated.status).toBe('assigned');
    // Assigning a phone in somebody's pocket is not assigning a person.
    expect(updated.assignmentAckAt ?? null).toBeNull();
    expect(updated.assignmentDeadlineAt).toBeInstanceOf(Date);
  });

  it('refuses a type outside the responder role, and lets an admin override it', async () => {
    const userId = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });
    const adminId = new mongoose.Types.ObjectId().toString();
    const fire = await makeEmergency({ userId, type: 'fire' });
    const id = (fire._id as mongoose.Types.ObjectId).toString();

    await expect(
      svc.assign(id, {}, authFor('responder', medic), ctx()),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'OUT_OF_ROLE');

    // The escape hatch: the right unit is not always the obvious one.
    await svc.assign(id, { responderId: medic }, authFor('admin', adminId), ctx());
    expect((await reload(fire)).assignedResponderId?.toString()).toBe(medic);
  });

  it('refuses a responder who has not been approved', async () => {
    const userId = await makeUser();
    const pending = await makeResponder({ approved: false });
    const emergency = await makeEmergency({ userId });

    await expect(
      svc.assign(
        (emergency._id as mongoose.Types.ObjectId).toString(),
        {},
        authFor('responder', pending),
        ctx(),
      ),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'RESPONDER_NOT_APPROVED');
  });

  it('refuses a second responder taking what somebody already holds', async () => {
    const userId = await makeUser();
    const first = await makeResponder();
    const second = await makeResponder();
    const emergency = await makeEmergency({ userId, status: 'assigned', assignedResponderId: first });

    await expect(
      svc.assign(
        (emergency._id as mongoose.Types.ObjectId).toString(),
        {},
        authFor('responder', second),
        ctx(),
      ),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'INVALID_TRANSITION');
  });

  it('refuses any assignment once the incident is closed', async () => {
    const userId = await makeUser();
    const responderId = await makeResponder();
    const adminId = new mongoose.Types.ObjectId().toString();
    const closed = await makeEmergency({ userId, status: 'resolved' });

    await expect(
      svc.assign(
        (closed._id as mongoose.Types.ObjectId).toString(),
        { responderId },
        authFor('admin', adminId),
        ctx(),
      ),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'INVALID_TRANSITION');
  });
});

describe('reassignment', () => {
  it('a dispatcher moves a held incident to somebody else and frees the first', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const first = await makeResponder();
    const second = await makeResponder();
    const emergency = await makeEmergency({ userId });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await svc.assign(id, { responderId: first }, authFor('admin', adminId), ctx());
    await svc.acknowledge(id, authFor('responder', first), ctx());
    io.reset();

    await svc.assign(id, { responderId: second }, authFor('admin', adminId), ctx());

    const updated = await reload(emergency);
    expect(updated.assignedResponderId?.toString()).toBe(second);
    expect(timelineEvents(updated)).toContain('reassigned');
    // The new responder owes an acknowledgement; the old one is free.
    expect(updated.assignmentAckAt ?? null).toBeNull();
    expect(await dutyStatusOf(second)).toBe('busy');
    expect(await dutyStatusOf(first)).toBe('available');
    // The outgoing responder is no longer in the incident's room, so the event
    // has to name it or their app never hears they lost it.
    expect(io.roomsFor('emergency.assigned')).toContain(`responder:${first}`);
  });

  it('a responder on the way still loses it to a dispatcher', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const first = await makeResponder();
    const second = await makeResponder();
    const emergency = await makeEmergency({
      userId,
      status: 'responder_on_the_way',
      assignedResponderId: first,
    });

    await svc.assign(
      (emergency._id as mongoose.Types.ObjectId).toString(),
      { responderId: second },
      authFor('admin', adminId),
      ctx(),
    );

    const updated = await reload(emergency);
    expect(updated.status).toBe('assigned');
    expect(updated.assignedResponderId?.toString()).toBe(second);
  });
});

describe('acknowledgement', () => {
  it('clears the deadline and is idempotent', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await svc.assign(id, { responderId }, authFor('admin', adminId), ctx());
    await svc.acknowledge(id, authFor('responder', responderId), ctx());

    const first = await reload(emergency);
    expect(first.assignmentAckAt).toBeInstanceOf(Date);
    expect(first.assignmentDeadlineAt ?? null).toBeNull();

    // A duplicate answer over a bad connection must not read as a failure.
    await svc.acknowledge(id, authFor('responder', responderId), ctx());
    const second = await reload(emergency);
    expect(second.assignmentAckAt?.getTime()).toBe(first.assignmentAckAt?.getTime());
  });

  it('refuses somebody else’s assignment', async () => {
    const userId = await makeUser();
    const mine = await makeResponder();
    const other = await makeResponder();
    const emergency = await makeEmergency({ userId, status: 'assigned', assignedResponderId: mine });

    await expect(
      svc.acknowledge(
        (emergency._id as mongoose.Types.ObjectId).toString(),
        authFor('responder', other),
        ctx(),
      ),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'FORBIDDEN');
  });
});

describe('handing an incident back', () => {
  it('returns it to the pending pool with the reason and frees the responder', async () => {
    const userId = await makeUser();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId, status: 'assigned', assignedResponderId: responderId });

    await svc.release(
      (emergency._id as mongoose.Types.ObjectId).toString(),
      { reason: 'Already on another call' },
      authFor('responder', responderId),
      ctx(),
    );

    const updated = await reload(emergency);
    expect(updated.status).toBe('pending');
    expect(updated.assignedResponderId ?? null).toBeNull();
    expect(updated.assignmentAckAt ?? null).toBeNull();
    expect(timelineEvents(updated)).toContain('released');
    expect(updated.timeline.at(-1)?.note).toBe('Already on another call');
    expect(await dutyStatusOf(responderId)).toBe('available');
    expect(io.roomsFor('emergency.released')).toContain(`responder:${responderId}`);
  });

  it('a dispatcher can take back anyone’s, a responder only their own', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const holder = await makeResponder();
    const stranger = await makeResponder();
    const emergency = await makeEmergency({ userId, status: 'assigned', assignedResponderId: holder });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await expect(
      svc.release(id, {}, authFor('responder', stranger), ctx()),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'FORBIDDEN');

    await svc.release(id, {}, authFor('admin', adminId), ctx());
    expect((await reload(emergency)).status).toBe('pending');
  });

  it('refuses when nobody is holding it', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const emergency = await makeEmergency({ userId });

    await expect(
      svc.release(
        (emergency._id as mongoose.Types.ObjectId).toString(),
        {},
        authFor('admin', adminId),
        ctx(),
      ),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'NOT_ASSIGNED');
  });
});

describe('the watchdog', () => {
  it('takes back an assignment nobody answered', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await svc.assign(id, { responderId }, authFor('admin', adminId), ctx());
    // Nobody answered, and the deadline has passed.
    await Emergency.updateOne(
      { _id: emergency._id },
      { $set: { assignmentDeadlineAt: new Date(Date.now() - 1000) } },
    );
    io.reset();

    await sweepDispatch(io.server);

    const updated = await reload(emergency);
    expect(updated.status).toBe('pending');
    expect(updated.assignedResponderId ?? null).toBeNull();
    expect(timelineEvents(updated)).toContain('assignment_expired');
    expect(await dutyStatusOf(responderId)).toBe('available');
    expect(io.sawEvent('emergency.assignment_expired')).toBe(true);
  });

  it('leaves an acknowledged assignment alone however long it runs', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await svc.assign(id, { responderId }, authFor('admin', adminId), ctx());
    await svc.acknowledge(id, authFor('responder', responderId), ctx());
    await Emergency.updateOne(
      { _id: emergency._id },
      { $set: { assignmentDeadlineAt: new Date(Date.now() - 60_000) } },
    );

    await sweepDispatch(io.server);

    expect((await reload(emergency)).status).toBe('assigned');
  });

  it('leaves a self-accepted assignment alone, which carries no deadline at all', async () => {
    const userId = await makeUser();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId });

    await svc.assign(
      (emergency._id as mongoose.Types.ObjectId).toString(),
      {},
      authFor('responder', responderId),
      ctx(),
    );

    await sweepDispatch(io.server);

    expect((await reload(emergency)).status).toBe('assigned');
  });

  it('flags an incident nobody has accepted, once', async () => {
    const userId = await makeUser();
    const stale = await makeEmergency({
      userId,
      createdAt: new Date(Date.now() - 10 * 60_000),
    });
    const fresh = await makeEmergency({ userId });

    await sweepDispatch(io.server);

    const flagged = await reload(stale);
    expect(flagged.dispatchOverdueAt).toBeInstanceOf(Date);
    expect(timelineEvents(flagged)).toContain('dispatch_overdue');
    expect((await reload(fresh)).dispatchOverdueAt ?? null).toBeNull();

    // A second sweep must not keep shouting about the same incident.
    io.reset();
    await sweepDispatch(io.server);
    expect(io.sawEvent('emergency.dispatch_overdue')).toBe(false);
    expect(
      timelineEvents(await reload(stale)).filter((e) => e === 'dispatch_overdue'),
    ).toHaveLength(1);
  });
});

describe('getting there and closing out', () => {
  it('walks assigned to on-the-way to arrived, and refuses to skip', async () => {
    const userId = await makeUser();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await expect(
      svc.setArrived(id, authFor('responder', responderId), ctx()),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'FORBIDDEN');

    await svc.assign(id, {}, authFor('responder', responderId), ctx());
    await svc.setOnTheWay(id, authFor('responder', responderId), ctx());
    expect((await reload(emergency)).status).toBe('responder_on_the_way');
    expect(await dutyStatusOf(responderId)).toBe('responding');

    await svc.setArrived(id, authFor('responder', responderId), ctx());
    const arrived = await reload(emergency);
    expect(arrived.status).toBe('arrived');
    expect(timelineEvents(arrived)).toContain('arrived');

    // Pressing it twice is not an error.
    await svc.setArrived(id, authFor('responder', responderId), ctx());
    expect(
      timelineEvents(await reload(emergency)).filter((e) => e === 'arrived'),
    ).toHaveLength(1);
  });

  it('only a dispatcher resolves, and resolving stops the device streaming', async () => {
    const userId = await makeUser();
    const adminId = new mongoose.Types.ObjectId().toString();
    const responderId = await makeResponder();
    const emergency = await makeEmergency({ userId, status: 'arrived', assignedResponderId: responderId });
    const id = (emergency._id as mongoose.Types.ObjectId).toString();

    await expect(
      svc.resolve(id, {}, authFor('responder', responderId), ctx()),
    ).rejects.toSatisfy((e: unknown) => codeOf(e) === 'FORBIDDEN');

    await svc.resolve(id, { resolutionNotes: 'Patient transported' }, authFor('admin', adminId), ctx());

    const resolved = await reload(emergency);
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).toBeInstanceOf(Date);
    // This is how a hardware panic button learns to stop transmitting.
    expect(resolved.trackingActive).toBe(false);
    expect(await dutyStatusOf(responderId)).toBe('available');
    expect(io.sawEvent('emergency.resolved')).toBe(true);
  });
});

describe('what a responder is shown', () => {
  it('lists their own role, plus anything assigned to them, and nothing else', async () => {
    const userId = await makeUser();
    const medic = await makeResponder({ department: 'medical', agencyType: 'medical' });

    await makeEmergency({ userId, type: 'medical' });
    const fire = await makeEmergency({ userId, type: 'fire' });
    const crimeOnMe = await makeEmergency({
      userId,
      type: 'crime',
      status: 'assigned',
      assignedResponderId: medic,
    });

    const feed = await svc.listActive(
      { page: 1, limit: 50 },
      authFor('responder', medic),
    );
    const ids = feed.items.map((item) => String(item._id));

    expect(ids).toContain(String(crimeOnMe._id));
    expect(ids).not.toContain(String(fire._id));
    expect(feed.items.filter((item) => item.type === 'medical')).toHaveLength(1);
  });

  it('their history is only what they held and dispatch then resolved', async () => {
    const userId = await makeUser();
    const mine = await makeResponder();
    const theirs = await makeResponder();

    await makeEmergency({ userId, status: 'resolved', assignedResponderId: mine });
    await makeEmergency({ userId, status: 'resolved', assignedResponderId: theirs });
    await makeEmergency({ userId, status: 'assigned', assignedResponderId: mine });

    const history = await svc.listResolvedForResponder(
      { page: 1, limit: 50 },
      authFor('responder', mine),
    );

    expect(history.total).toBe(1);
    expect(history.items[0]?.assignedResponderId?.toString()).toBe(mine);
    expect(history.items[0]?.status).toBe('resolved');
  });
});
