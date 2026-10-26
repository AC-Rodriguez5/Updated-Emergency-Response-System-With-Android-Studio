import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

import {
  clearDatabase,
  makeEmergency,
  makeResponder,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
} from '../../test/fixtures.js';
import {
  AmbulanceTransportRequest,
  AuditLog,
  Emergency,
  LocationSample,
  Responder,
  User,
} from '../../models/index.js';
import {
  retentionCutoff,
  sweepExpiredData,
  transportCutoff,
} from './retention.sweep.js';

/**
 * Erasing the location the consent form promised to erase.
 *
 * This is the one piece of code in the system whose whole job is to destroy
 * data, so both halves matter equally: that everything past the window really
 * goes, and that nothing inside the window, and nothing that was never a GPS
 * fix, goes with it.
 */

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-01T08:00:00.000Z');
const longAgo = new Date(now.getTime() - 400 * DAY);
const recently = new Date(now.getTime() - 30 * DAY);

const oid = (id: string): mongoose.Types.ObjectId =>
  new mongoose.Types.ObjectId(id);

async function makeSample(actorId: string, capturedAt: Date): Promise<void> {
  await LocationSample.create({
    actorId: oid(actorId),
    actorType: 'user',
    location: { type: 'Point', coordinates: [120.8778, 14.3126] },
    accuracyMeters: 11,
    capturedAt,
  });
}

/** Ages an incident's fix without going through the immutable-field guards. */
async function setFixAge(id: mongoose.Types.ObjectId, capturedAt: Date): Promise<void> {
  await Emergency.collection.updateOne(
    { _id: id },
    { $set: { 'currentLocation.capturedAt': capturedAt } },
  );
}


/** A finished transport booking, aged by rewriting its immutable timestamps. */
async function makeFinishedTransport(
  senderId: string,
  lastTouched: Date,
  fileId: mongoose.Types.ObjectId,
): Promise<mongoose.Types.ObjectId> {
  const doc = await AmbulanceTransportRequest.create({
    requestType: 'schedule',
    status: 'completed',
    senderUserId: oid(senderId),
    senderSnapshot: {
      fullName: 'Maria Santos',
      bloodType: 'O+',
      validIdFileId: fileId,
      faceCaptureFileId: fileId,
      proofOfResidencyFileId: fileId,
      municipality: 'Tanza',
      barangay: 'Biga',
    },
    patient: {
      fullName: 'Lola Remedios',
      address: '12 Daang Amaya',
      contactNumber: '09171234567',
      medicalCondition: 'Dialysis appointment, needs a stretcher',
    },
    accompanyingPerson: { fullName: 'Ana Santos', contactNumber: '09181234567' },
    pickupLocation: {
      type: 'Point',
      coordinates: [120.8778, 14.3126],
      addressLabel: '12 Daang Amaya, Tanza',
    },
    dropOffLocation: {
      type: 'Point',
      coordinates: [120.9, 14.33],
      addressLabel: 'Tanza District Hospital',
    },
    notes: 'Ring the gate twice',
    isEmergencyPriority: false,
    isTanzaCitizenPriority: true,
    requiresImmediateReview: false,
    outsideScopeFlag: false,
  });
  const id = doc._id as mongoose.Types.ObjectId;
  await AmbulanceTransportRequest.collection.updateOne(
    { _id: id },
    { $set: { updatedAt: lastTouched, createdAt: lastTouched } },
  );
  return id;
}

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);
beforeEach(clearDatabase);

describe('sweepExpiredData', () => {
  it('deletes the fixes that are past their promised life', async () => {
    const resident = await makeUser();
    await makeSample(resident, longAgo);
    await makeSample(resident, longAgo);
    await makeSample(resident, recently);

    const outcome = await sweepExpiredData(now);

    expect(outcome?.samplesDeleted).toBe(2);
    const left = await LocationSample.find().lean();
    expect(left).toHaveLength(1);
    expect(left[0]!.capturedAt).toEqual(recently);
  });

  it('leaves a fix captured inside the window alone', async () => {
    const resident = await makeUser();
    await makeSample(resident, recently);

    const outcome = await sweepExpiredData(now);

    expect(outcome?.samplesDeleted).toBe(0);
    expect(await LocationSample.countDocuments()).toBe(1);
  });

  it('trims the old points off an account trail and keeps the account', async () => {
    const resident = await makeUser();
    await User.updateOne(
      { _id: oid(resident) },
      {
        $set: {
          locationHistory: [
            { type: 'Point', coordinates: [120.87, 14.31], capturedAt: longAgo },
            { type: 'Point', coordinates: [120.88, 14.32], capturedAt: recently },
          ],
        },
      },
    );

    const outcome = await sweepExpiredData(now);

    expect(outcome?.accountsTrimmed).toBe(1);
    const after = await User.findById(oid(resident)).lean();
    expect(after).not.toBeNull();
    expect(after!.locationHistory).toHaveLength(1);
    expect(after!.locationHistory[0]!.capturedAt).toEqual(recently);
  });

  it('trims a responder trail on the same clock', async () => {
    const responder = await makeResponder();
    await Responder.updateOne(
      { _id: oid(responder) },
      {
        $set: {
          locationHistory: [
            { type: 'Point', coordinates: [120.87, 14.31], capturedAt: longAgo },
            { type: 'Point', coordinates: [120.88, 14.32], capturedAt: recently },
          ],
        },
      },
    );

    const outcome = await sweepExpiredData(now);

    // One window for position data, deliberately: a responder trail sits in
    // the same collection as a resident's.
    expect(outcome?.accountsTrimmed).toBe(1);
    const after = await Responder.findById(oid(responder)).lean();
    expect(after!.locationHistory).toHaveLength(1);
  });

  it('erases a closed incident position but keeps the incident', async () => {
    const resident = await makeUser();
    const incident = await makeEmergency({ userId: resident, status: 'resolved' });
    await setFixAge(incident._id as mongoose.Types.ObjectId, longAgo);

    const outcome = await sweepExpiredData(now);

    expect(outcome?.incidentsRedacted).toBe(1);
    const after = await Emergency.findById(incident._id);
    // The incident is a municipal record and outlives the fix on it.
    expect(after).not.toBeNull();
    expect(after!.currentLocation).toBeUndefined();
    expect(after!.locationRedactedAt).toBeInstanceOf(Date);
  });

  it('keeps the barangay, which is a service area and not a fix', async () => {
    const resident = await makeUser();
    const incident = await makeEmergency({ userId: resident, status: 'resolved' });
    await setFixAge(incident._id as mongoose.Types.ObjectId, longAgo);

    await sweepExpiredData(now);

    // The annual incident figures are counted by this.
    const after = await Emergency.findById(incident._id);
    expect(after!.barangay).toBe('Biga');
    expect(after!.type).toBe('medical');
    expect(after!.status).toBe('resolved');
  });

  it('says a position was erased rather than never captured', async () => {
    const resident = await makeUser();
    const incident = await makeEmergency({ userId: resident, status: 'cancelled' });
    await setFixAge(incident._id as mongoose.Types.ObjectId, longAgo);

    await sweepExpiredData(now);

    const after = await Emergency.findById(incident._id);
    // 'pending' would claim the incident was still hunting for a fix a year on.
    expect(after!.locationStatus).toBe('fixed');
    expect(after!.locationRedactedAt).toBeInstanceOf(Date);
  });

  it('will not strip an open incident, and counts it instead', async () => {
    const resident = await makeUser();
    const open = await makeEmergency({ userId: resident, status: 'assigned' });
    await setFixAge(open._id as mongoose.Types.ObjectId, longAgo);

    const outcome = await sweepExpiredData(now);

    // An open incident is live dispatch; its position may be the only thing
    // telling a responder where to go.
    expect(outcome?.incidentsRedacted).toBe(0);
    expect(outcome?.openIncidentsPastWindow).toBe(1);
    const after = await Emergency.findById(open._id);
    expect(after!.currentLocation).toBeDefined();
  });

  it('leaves a recently closed incident untouched', async () => {
    const resident = await makeUser();
    const incident = await makeEmergency({ userId: resident, status: 'resolved' });
    await setFixAge(incident._id as mongoose.Types.ObjectId, recently);

    const outcome = await sweepExpiredData(now);

    expect(outcome?.incidentsRedacted).toBe(0);
    const after = await Emergency.findById(incident._id);
    expect(after!.currentLocation).toBeDefined();
    expect(after!.locationRedactedAt).toBeUndefined();
  });

  it('records what it erased, as the evidence the promise is kept', async () => {
    const resident = await makeUser();
    await makeSample(resident, longAgo);

    await sweepExpiredData(now);

    const entries = await AuditLog.find({ action: 'location_retention_sweep' }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.actorRole).toBe('system');
    expect(entries[0]!.meta).toMatchObject({ samplesDeleted: 1 });
  });

  it('writes no audit entry on a sweep that erased nothing', async () => {
    const resident = await makeUser();
    await makeSample(resident, recently);

    await sweepExpiredData(now);

    // Otherwise the trail is a heartbeat nobody can read a deletion out of.
    expect(await AuditLog.countDocuments({ action: 'location_retention_sweep' })).toBe(0);
  });

  it('is safe to run twice', async () => {
    const resident = await makeUser();
    await makeSample(resident, longAgo);
    const incident = await makeEmergency({ userId: resident, status: 'resolved' });
    await setFixAge(incident._id as mongoose.Types.ObjectId, longAgo);

    await sweepExpiredData(now);
    const second = await sweepExpiredData(now);

    expect(second?.samplesDeleted).toBe(0);
    expect(second?.incidentsRedacted).toBe(0);
  });

  it('copes with a database holding nothing to erase', async () => {
    await expect(sweepExpiredData(now)).resolves.toMatchObject({
      samplesDeleted: 0,
      accountsTrimmed: 0,
      incidentsRedacted: 0,
    });
  });
});

describe('a dry run', () => {
  // The first run on a deployment that has been collecting since before the
  // window is irreversible, and counting first is the only way to see what a
  // year's backlog amounts to before it goes.

  it('counts what would go and erases nothing', async () => {
    const resident = await makeUser();
    await makeSample(resident, longAgo);
    await makeSample(resident, longAgo);
    const incident = await makeEmergency({ userId: resident, status: 'resolved' });
    await setFixAge(incident._id as mongoose.Types.ObjectId, longAgo);

    const outcome = await sweepExpiredData(now, true);

    expect(outcome?.dryRun).toBe(true);
    expect(outcome?.samplesDeleted).toBe(2);
    expect(outcome?.incidentsRedacted).toBe(1);
    // Everything still there.
    expect(await LocationSample.countDocuments()).toBe(2);
    const after = await Emergency.findById(incident._id);
    expect(after!.currentLocation).toBeDefined();
  });

  it('counts the account trails it would trim without trimming them', async () => {
    const resident = await makeUser();
    await User.updateOne(
      { _id: oid(resident) },
      {
        $set: {
          locationHistory: [
            { type: 'Point', coordinates: [120.87, 14.31], capturedAt: longAgo },
          ],
        },
      },
    );

    const outcome = await sweepExpiredData(now, true);

    expect(outcome?.accountsTrimmed).toBe(1);
    const after = await User.findById(oid(resident)).lean();
    expect(after!.locationHistory).toHaveLength(1);
  });

  it('writes no audit entry, because nothing was erased', async () => {
    const resident = await makeUser();
    await makeSample(resident, longAgo);

    await sweepExpiredData(now, true);

    expect(
      await AuditLog.countDocuments({ action: 'location_retention_sweep' }),
    ).toBe(0);
  });
});


describe('finished transport bookings', () => {
  const fileId = new mongoose.Types.ObjectId();

  it('strips everything that names a person', async () => {
    const sender = await makeUser();
    const id = await makeFinishedTransport(sender, longAgo, fileId);

    const outcome = await sweepExpiredData(now);

    expect(outcome?.transportsRedacted).toBe(1);
    const after = await AmbulanceTransportRequest.findById(id);
    expect(after!.patient).toBeUndefined();
    expect(after!.accompanyingPerson).toBeUndefined();
    expect(after!.pickupLocation).toBeUndefined();
    expect(after!.dropOffLocation).toBeUndefined();
    expect(after!.notes).toBeUndefined();
    expect(after!.senderSnapshot.fullName).toBeUndefined();
    expect(after!.senderSnapshot.bloodType).toBeUndefined();
  });

  it('keeps the booking MDRRMO counts its work by', async () => {
    const sender = await makeUser();
    const id = await makeFinishedTransport(sender, longAgo, fileId);

    await sweepExpiredData(now);

    const after = await AmbulanceTransportRequest.findById(id);
    expect(after).not.toBeNull();
    expect(after!.requestType).toBe('schedule');
    expect(after!.status).toBe('completed');
    // The service area survives; it is what the annual figures are counted by.
    expect(after!.senderSnapshot.barangay).toBe('Biga');
    expect(after!.senderSnapshot.municipality).toBe('Tanza');
    expect(after!.personalDataRedactedAt).toBeInstanceOf(Date);
  });

  it('drops the file references without touching the files', async () => {
    const sender = await makeUser();
    const id = await makeFinishedTransport(sender, longAgo, fileId);

    await sweepExpiredData(now);

    /*
      These point at the account's own registration documents, not at copies.
      Following them to delete the files would take the resident's ID and face
      photo with a year-old booking.
    */
    const after = await AmbulanceTransportRequest.findById(id);
    expect(after!.senderSnapshot.validIdFileId).toBeUndefined();
    expect(after!.senderSnapshot.faceCaptureFileId).toBeUndefined();
    const owner = await User.findById(oid(sender));
    expect(owner).not.toBeNull();
  });

  it('leaves a recent booking alone', async () => {
    const sender = await makeUser();
    const id = await makeFinishedTransport(sender, recently, fileId);

    const outcome = await sweepExpiredData(now);

    expect(outcome?.transportsRedacted).toBe(0);
    const after = await AmbulanceTransportRequest.findById(id);
    expect(after!.patient?.fullName).toBe('Lola Remedios');
  });

  it('will not strip a booking that is still running', async () => {
    const sender = await makeUser();
    const id = await makeFinishedTransport(sender, longAgo, fileId);
    await AmbulanceTransportRequest.updateOne(
      { _id: id },
      { $set: { status: 'patient_onboard' } },
    );

    const outcome = await sweepExpiredData(now);

    // Somebody is in the back of that ambulance.
    expect(outcome?.transportsRedacted).toBe(0);
    const after = await AmbulanceTransportRequest.findById(id);
    expect(after!.patient?.medicalCondition).toContain('Dialysis');
  });

  it('does not redact the same booking twice', async () => {
    const sender = await makeUser();
    await makeFinishedTransport(sender, longAgo, fileId);

    await sweepExpiredData(now);
    const second = await sweepExpiredData(now);

    expect(second?.transportsRedacted).toBe(0);
  });

  it('counts without stripping on a dry run', async () => {
    const sender = await makeUser();
    const id = await makeFinishedTransport(sender, longAgo, fileId);

    const outcome = await sweepExpiredData(now, true);

    expect(outcome?.transportsRedacted).toBe(1);
    const after = await AmbulanceTransportRequest.findById(id);
    expect(after!.patient?.fullName).toBe('Lola Remedios');
    expect(after!.personalDataRedactedAt).toBeUndefined();
  });

  it('is recorded in the audit trail with the rest', async () => {
    const sender = await makeUser();
    await makeFinishedTransport(sender, longAgo, fileId);

    await sweepExpiredData(now);

    const entry = await AuditLog.findOne({ action: 'location_retention_sweep' }).lean();
    expect(entry!.meta).toMatchObject({ transportsRedacted: 1 });
  });
});

describe('the windows', () => {
  it('puts the location cutoff where the consent form says', () => {
    // 365 days, the figure the form states.
    expect(retentionCutoff(now)).toEqual(new Date(now.getTime() - 365 * DAY));
  });

  it('gives transport bookings a window of their own', () => {
    // Separate setting, even where the two numbers currently agree: a booking
    // holds a medical condition and ages on its own clock.
    expect(transportCutoff(now)).toEqual(new Date(now.getTime() - 365 * DAY));
  });
});
