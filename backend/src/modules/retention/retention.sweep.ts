import type mongoose from 'mongoose';

import { env } from '../../config/env.js';
import {
  AmbulanceTransportRequest,
  AuditLog,
  Emergency,
  LocationSample,
  Responder,
  User,
} from '../../models/index.js';
import type { EmergencyStatus } from '../../models/Emergency.js';
import type { AmbulanceRequestStatus } from '../../models/AmbulanceTransportRequest.js';

/**
 * Erasing the location data the consent form promised to erase.
 *
 * The resident app tells every resident, before they register, that their GPS
 * fix is "captured when you trigger an alert and kept for 1 year, then
 * deleted". Nothing was deleting it. This does, and it is the only thing that
 * makes that sentence true — a promise under RA 10173 that the system quietly
 * does not keep is worse than one it never made.
 *
 * Three places hold a fix, and each wants different treatment:
 *
 *  - `LocationSample` is nothing but position. The document goes.
 *  - `User.locationHistory` is a trail of points on the account. The old points
 *    go; the account stays.
 *  - `Emergency.currentLocation` is one fix on an incident record MDRRMO keeps
 *    for far longer than a year. The coordinates go and the incident stays,
 *    with `locationRedactedAt` set so a year-old incident with no position
 *    reads as "erased on schedule" rather than "GNSS never got a fix".
 *
 * What is deliberately left alone: `barangay` and `municipality`, which are a
 * service area rather than a fix and are what the annual incident figures are
 * counted by, and `streetAddress`, which is copied from the account at the time
 * of the alert and lives or dies with the account.
 *
 * Transport bookings run on a clock of their own (`TRANSPORT_RETENTION_DAYS`),
 * because they are a different kind of record: a named patient, their contact
 * and their medical condition, often about somebody who is not the account
 * holder. They are redacted rather than deleted — the booking itself is what
 * MDRRMO counts its ambulance work by.
 *
 * Responder positions run on the same clock, which is a choice rather than an
 * oversight: a responder's trail is in the same `LocationSample` collection as
 * a resident's, and one window for position data is easier to explain and to
 * defend than two. What proves a response time is the incident timeline —
 * assigned, on the way, arrived — and the sweep does not touch it.
 */

/** Statuses where nobody is on their way any more. */
const CLOSED_STATUSES: readonly EmergencyStatus[] = ['resolved', 'cancelled'];

/** Transport bookings that will never move again. */
const FINISHED_TRANSPORT_STATUSES: readonly AmbulanceRequestStatus[] = [
  'completed',
  'cancelled',
  'rejected',
];

const SAMPLE_BATCH = 2_000;

/*
  A ceiling on one sweep, not on the work. The first run after this ships has a
  backlog of everything older than the window, and a single unbounded deleteMany
  over it would hold the connection for as long as it takes. Whatever is left
  goes in the next sweep.
*/
const MAX_BATCHES = 25;

export interface RetentionOutcome {
  /** Location captured before this is past its promised life. */
  locationCutoff?: Date;
  /** Transport bookings last touched before this are past theirs. */
  transportCutoff?: Date;
  /** True when the counts below are what *would* have been erased. */
  dryRun: boolean;
  samplesDeleted: number;
  /**
   * Accounts, resident and responder, that had at least one stale point pulled
   * from their trail.
   */
  accountsTrimmed: number;
  incidentsRedacted: number;
  /** Finished transport bookings stripped of their personal contents. */
  transportsRedacted: number;
  /**
   * Incidents still open with a fix past the window.
   *
   * Left untouched and counted: an open incident is live dispatch, and its
   * position may be the only thing telling a responder where to go. One this
   * old is a stuck record rather than an emergency, so it is surfaced to be
   * looked at instead of silently kept or silently stripped.
   */
  openIncidentsPastWindow: number;
}

function daysBefore(now: Date, days: number): Date | undefined {
  if (days <= 0) return undefined;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** When the location window starts, or undefined if location retention is off. */
export function retentionCutoff(now: Date = new Date()): Date | undefined {
  return daysBefore(now, env.LOCATION_RETENTION_DAYS);
}

/** When the transport window starts, or undefined if transport redaction is off. */
export function transportCutoff(now: Date = new Date()): Date | undefined {
  return daysBefore(now, env.TRANSPORT_RETENTION_DAYS);
}

async function deleteExpiredSamples(cutoff: Date, dryRun: boolean): Promise<number> {
  if (dryRun) return LocationSample.countDocuments({ capturedAt: { $lt: cutoff } });

  let deleted = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const stale = await LocationSample.find({ capturedAt: { $lt: cutoff } })
      .select('_id')
      .limit(SAMPLE_BATCH)
      .lean();
    if (stale.length === 0) break;

    const result = await LocationSample.deleteMany({
      _id: { $in: stale.map((doc) => doc._id as mongoose.Types.ObjectId) },
    });
    deleted += result.deletedCount ?? 0;
    if (stale.length < SAMPLE_BATCH) break;
  }
  return deleted;
}

async function trimAccountTrails(cutoff: Date, dryRun: boolean): Promise<number> {
  const stale = { 'locationHistory.capturedAt': { $lt: cutoff } };

  if (dryRun) {
    const [residents, responders] = await Promise.all([
      User.countDocuments(stale),
      Responder.countDocuments(stale),
    ]);
    return residents + responders;
  }

  const pullStale = {
    $pull: { locationHistory: { capturedAt: { $lt: cutoff } } },
  } as const;
  const [residents, responders] = await Promise.all([
    User.updateMany(stale, pullStale),
    Responder.updateMany(stale, pullStale),
  ]);
  return (residents.modifiedCount ?? 0) + (responders.modifiedCount ?? 0);
}

async function redactClosedIncidents(
  cutoff: Date,
  now: Date,
  dryRun: boolean,
): Promise<number> {
  const stale = {
    status: { $in: CLOSED_STATUSES },
    'currentLocation.capturedAt': { $lt: cutoff },
  };
  if (dryRun) return Emergency.countDocuments(stale);

  const result = await Emergency.updateMany(
    stale,
    {
      $unset: { currentLocation: '' },
      $set: { locationRedactedAt: now },
    },
  );
  return result.modifiedCount ?? 0;
}

function countOpenIncidentsPastWindow(cutoff: Date): Promise<number> {
  return Emergency.countDocuments({
    status: { $nin: CLOSED_STATUSES },
    'currentLocation.capturedAt': { $lt: cutoff },
  });
}

/**
 * Strips the personal contents from a booking nobody is travelling on any more.
 *
 * Redaction, not deletion. The booking is how MDRRMO counts its ambulance work,
 * so type, status, dates, the unit that went, the barangay and the timeline all
 * stay. What goes is everything that names a person: the patient block, the
 * accompanying person, both map points, the free-text notes and the hospital
 * names, plus the personal half of the sender snapshot.
 *
 * The snapshot's file ids are dropped, never followed. They point at the
 * account's own registration documents — deleting those files to tidy a
 * year-old booking would take the resident's ID with it.
 *
 * Anchored on `updatedAt`: a booking made in January for a March transport
 * should age from when it finished, not from when it was typed.
 */
async function redactExpiredTransports(
  cutoff: Date,
  now: Date,
  dryRun: boolean,
): Promise<number> {
  const stale = {
    status: { $in: FINISHED_TRANSPORT_STATUSES },
    updatedAt: { $lt: cutoff },
    personalDataRedactedAt: { $exists: false },
  };
  if (dryRun) return AmbulanceTransportRequest.countDocuments(stale);

  const result = await AmbulanceTransportRequest.updateMany(stale, {
    $unset: {
      patient: '',
      accompanyingPerson: '',
      pickupLocation: '',
      dropOffLocation: '',
      notes: '',
      transferDetails: '',
      'senderSnapshot.fullName': '',
      'senderSnapshot.age': '',
      'senderSnapshot.dateOfBirth': '',
      'senderSnapshot.bloodType': '',
      'senderSnapshot.proofOfIndigencyFileId': '',
      'senderSnapshot.validIdFileId': '',
      'senderSnapshot.faceCaptureFileId': '',
      'senderSnapshot.proofOfResidencyFileId': '',
    },
    $set: { personalDataRedactedAt: now },
  });
  return result.modifiedCount ?? 0;
}

/**
 * Erases everything past its promised life, on both clocks.
 *
 * Returns undefined only when neither window is switched on, so a caller can
 * tell "there was nothing to erase" apart from "this deployment does not
 * erase". Each window is independent: switching one off leaves the other
 * running.
 */
export async function sweepExpiredData(
  now: Date = new Date(),
  dryRun: boolean = env.RETENTION_DRY_RUN,
): Promise<RetentionOutcome | undefined> {
  const locationCutoff = retentionCutoff(now);
  const transportWindow = transportCutoff(now);
  if (!locationCutoff && !transportWindow) return undefined;

  const samplesDeleted = locationCutoff
    ? await deleteExpiredSamples(locationCutoff, dryRun)
    : 0;
  const accountsTrimmed = locationCutoff
    ? await trimAccountTrails(locationCutoff, dryRun)
    : 0;
  const incidentsRedacted = locationCutoff
    ? await redactClosedIncidents(locationCutoff, now, dryRun)
    : 0;
  const openIncidentsPastWindow = locationCutoff
    ? await countOpenIncidentsPastWindow(locationCutoff)
    : 0;
  const transportsRedacted = transportWindow
    ? await redactExpiredTransports(transportWindow, now, dryRun)
    : 0;

  const erased =
    samplesDeleted + accountsTrimmed + incidentsRedacted + transportsRedacted;

  if (dryRun) {
    console.warn(
      `[retention] DRY RUN: would erase ${samplesDeleted} sample(s), trim ` +
        `${accountsTrimmed} account trail(s), redact ${incidentsRedacted} closed ` +
        `incident(s) and ${transportsRedacted} finished transport booking(s). ` +
        'Nothing was deleted. Set RETENTION_DRY_RUN=false to erase.',
    );
  }

  if (erased > 0 && !dryRun) {
    // Written only when something was actually erased, so the audit trail is a
    // record of deletions rather than a heartbeat nobody can read past. This is
    // the evidence that the retention promises are being kept.
    await AuditLog.create({
      actorRole: 'system',
      action: 'location_retention_sweep',
      module: 'retention',
      severity: 'info',
      description:
        `Erased location older than ${env.LOCATION_RETENTION_DAYS} days and ` +
        `transport contents older than ${env.TRANSPORT_RETENTION_DAYS} days.`,
      meta: {
        locationCutoff,
        transportCutoff: transportWindow,
        locationRetentionDays: env.LOCATION_RETENTION_DAYS,
        transportRetentionDays: env.TRANSPORT_RETENTION_DAYS,
        samplesDeleted,
        accountsTrimmed,
        incidentsRedacted,
        transportsRedacted,
        openIncidentsPastWindow,
      },
    });
  }

  if (openIncidentsPastWindow > 0) {
    console.warn(
      `[retention] ${openIncidentsPastWindow} open incident(s) hold a fix older than ` +
        `${env.LOCATION_RETENTION_DAYS} days. Left in place: an open incident is live ` +
        'dispatch. Close or cancel them so their location can be erased.',
    );
  }

  return {
    locationCutoff,
    transportCutoff: transportWindow,
    dryRun,
    samplesDeleted,
    accountsTrimmed,
    incidentsRedacted,
    transportsRedacted,
    openIncidentsPastWindow,
  };
}

let timer: NodeJS.Timeout | undefined;

export function startRetentionSweep(): void {
  if (timer) return;

  if (!retentionCutoff() && !transportCutoff()) {
    console.warn(
      '[retention] LOCATION_RETENTION_DAYS and TRANSPORT_RETENTION_DAYS are both 0: ' +
        'nothing is ever erased. The resident consent form promises otherwise.',
    );
    return;
  }
  if (!retentionCutoff()) {
    console.warn(
      '[retention] LOCATION_RETENTION_DAYS is 0: location is kept forever, ' +
        'though the consent form promises one year.',
    );
  }

  const run = (): void => {
    void sweepExpiredData()
      .then((outcome) => {
        if (!outcome || outcome.dryRun) return;
        const {
          samplesDeleted,
          accountsTrimmed,
          incidentsRedacted,
          transportsRedacted,
        } = outcome;
        if (
          samplesDeleted + accountsTrimmed + incidentsRedacted + transportsRedacted ===
          0
        ) {
          return;
        }
        console.log(
          `[retention] erased ${samplesDeleted} sample(s), trimmed ${accountsTrimmed} ` +
            `account trail(s), redacted ${incidentsRedacted} closed incident(s) and ` +
            `${transportsRedacted} finished transport booking(s).`,
        );
      })
      .catch((err: unknown) => {
        // A failed sweep must not kill the interval; the next one comes round.
        console.error('[retention] sweep failed:', err);
      });
  };

  timer = setInterval(run, env.RETENTION_SWEEP_HOURS * 60 * 60 * 1000);
  // Never hold the process open for a sweep.
  timer.unref();
  console.log(
    `Retention sweep: every ${env.RETENTION_SWEEP_HOURS}h, erasing location older ` +
      `than ${env.LOCATION_RETENTION_DAYS} days and transport contents older than ` +
      `${env.TRANSPORT_RETENTION_DAYS} days` +
      `${env.RETENTION_DRY_RUN ? ' (DRY RUN: nothing is deleted)' : ''}.`,
  );
  run();
}

export function stopRetentionSweep(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
