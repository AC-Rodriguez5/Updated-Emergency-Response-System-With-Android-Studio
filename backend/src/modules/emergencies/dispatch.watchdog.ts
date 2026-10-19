import type { Server as SocketServer } from 'socket.io';

import { env } from '../../config/env.js';
import { Emergency } from '../../models/index.js';
import { emitEmergencyEvent } from './events.js';
import { setResponderDutyForEmergency } from './emergencies.service.js';

/**
 * The part of dispatch nobody is awake for.
 *
 * Every other transition in this system happens because a person pressed
 * something. These two never happen at all unless something watches the clock:
 * an assignment nobody answered, and an incident nobody took. Both look exactly
 * like a healthy incident in the database, and both mean help is not coming.
 */

const BATCH = 50;

let timer: NodeJS.Timeout | undefined;

export function startDispatchWatchdog(io: SocketServer): void {
  if (timer) return;
  timer = setInterval(() => {
    void sweepDispatch(io);
  }, env.DISPATCH_SWEEP_SECONDS * 1000);
  // Never hold the process open for a sweep.
  timer.unref();
  console.log(
    `Dispatch watchdog: every ${env.DISPATCH_SWEEP_SECONDS}s ` +
      `(ack ${env.DISPATCH_ACK_SECONDS}s, unclaimed ${env.DISPATCH_OVERDUE_SECONDS}s)`,
  );
}

export function stopDispatchWatchdog(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}

export async function sweepDispatch(io: SocketServer | undefined): Promise<void> {
  try {
    await expireUnacknowledgedAssignments(io);
    await flagUnclaimedEmergencies(io);
  } catch (err) {
    // A failed sweep must not kill the interval; the next one is seconds away.
    console.error('Dispatch watchdog sweep failed:', err);
  }
}

/**
 * An assignment the responder never answered goes back to the pool.
 *
 * Returning it to `pending` rather than merely flagging it is deliberate: a
 * flagged assignment still reads as handled on every screen, and the whole point
 * is that it is not.
 */
async function expireUnacknowledgedAssignments(io: SocketServer | undefined): Promise<void> {
  const due = await Emergency.find({
    status: 'assigned',
    assignmentAckAt: null,
    assignmentDeadlineAt: { $ne: null, $lt: new Date() },
  }).limit(BATCH);

  for (const doc of due) {
    const heldBy = doc.assignedResponderId?.toString();
    doc.status = 'pending';
    doc.set('assignedResponderId', undefined);
    doc.set('assignmentAckAt', undefined);
    doc.set('assignmentDeadlineAt', undefined);
    doc.timeline.push({
      event: 'assignment_expired',
      at: new Date(),
      actorRole: 'system',
      note: `No acknowledgement within ${env.DISPATCH_ACK_SECONDS}s. Returned to dispatch.`,
    } as never);
    await doc.save();

    emitEmergencyEvent(
      io,
      'emergency.assignment_expired',
      doc,
      heldBy ? [`responder:${heldBy}`] : [],
    );
    if (heldBy) await setResponderDutyForEmergency(heldBy, 'available', { io });
  }
}

/** An incident sitting in the pending pool that no responder has accepted. */
async function flagUnclaimedEmergencies(io: SocketServer | undefined): Promise<void> {
  const cutoff = new Date(Date.now() - env.DISPATCH_OVERDUE_SECONDS * 1000);
  const stale = await Emergency.find({
    status: 'pending',
    assignedResponderId: null,
    dispatchOverdueAt: null,
    createdAt: { $lt: cutoff },
  }).limit(BATCH);

  for (const doc of stale) {
    doc.dispatchOverdueAt = new Date();
    doc.timeline.push({
      event: 'dispatch_overdue',
      at: new Date(),
      actorRole: 'system',
      note: `No responder accepted within ${env.DISPATCH_OVERDUE_SECONDS}s.`,
    } as never);
    await doc.save();
    emitEmergencyEvent(io, 'emergency.dispatch_overdue', doc);
  }
}
