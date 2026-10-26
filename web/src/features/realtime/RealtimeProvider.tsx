import { useEffect, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/useAuth';
import { connectSocket, onSocketEvents, onSocketStatus } from '@/services/socketClient';

/**
 * Which cached reads a backend event makes wrong.
 *
 * Every page used to arrange this for itself, and the result was a dashboard
 * whose liveness depended on which page you were on: Incidents and Map
 * subscribed, **Dispatch did not subscribe to anything at all** and found out
 * about a new emergency up to fifteen seconds later, on its next poll. A
 * dispatcher is the one person who must not learn about a panic button on a
 * timer.
 *
 * Mapping it in one place means a page is live because it reads from the query
 * cache, not because somebody remembered to wire it up.
 */
const INCIDENT_QUERIES = [
  ['active-emergencies-full'],
  ['active-emergencies'],
  ['dispatch-emergencies'],
  ['map-emergencies'],
  ['admin-overview'],
] as const;

const RESPONDER_QUERIES = [
  ['responders-live'],
  ['map-responders-live'],
  ['admin-overview'],
] as const;

const DEVICE_QUERIES = [['admin-devices'], ['admin-device-summary']] as const;

const AMBULANCE_QUERIES = [
  ['ambulance-requests'],
  ['ambulance-units'],
  ['ambulance-units-available'],
  ['admin-overview'],
] as const;

const AUDIT_QUERIES = [['audit-logs']] as const;

type QueryKeyList = readonly (readonly string[])[];

/** Event name -> what it invalidates. */
const ROUTES: ReadonlyArray<readonly [readonly string[], QueryKeyList]> = [
  [
    [
      'emergency.created',
      'emergency.updated',
      'emergency.assigned',
      'emergency.assignment_acknowledged',
      'emergency.assignment_expired',
      'emergency.released',
      'emergency.dispatch_overdue',
      'emergency.responder_on_the_way',
      'emergency.responder_nearby',
      'emergency.responder_arrived',
      'emergency.message',
      'emergency.user_message',
      'emergency.responder_report',
      'emergency.update_requested',
      'emergency.resolved',
    ],
    [...INCIDENT_QUERIES, ...RESPONDER_QUERIES, ...AUDIT_QUERIES],
  ],
  // A wearable alert also changes what the Devices page says about that
  // wearable: last contact, battery, and whether it is streaming an incident.
  [
    [
      'emergency.iot_device_created',
      'emergency.iot_keychain_created',
      'emergency.location_updated',
    ],
    [...INCIDENT_QUERIES, ...DEVICE_QUERIES],
  ],
  [
    ['responder.status_updated', 'location.responder_updated'],
    RESPONDER_QUERIES,
  ],
  [
    [
      'ambulance_request.created',
      'ambulance_request.reviewed',
      'ambulance_request.assigned',
      'ambulance_request.on_the_way',
      'ambulance_request.arrived_pickup',
      'ambulance_request.patient_onboard',
      'ambulance_request.completed',
      'ambulance_request.cancelled',
      'ambulance_availability.updated',
    ],
    [...AMBULANCE_QUERIES, ...RESPONDER_QUERIES, ...AUDIT_QUERIES],
  ],
];

/**
 * Everything worth re-reading after the socket has been away. Events that
 * arrived while it was down were delivered to nobody, so the cache is of
 * unknown age until each of these is asked again.
 */
const CATCH_UP_QUERIES: QueryKeyList = [
  ...INCIDENT_QUERIES,
  ...RESPONDER_QUERIES,
  ...DEVICE_QUERIES,
  ...AMBULANCE_QUERIES,
  ...AUDIT_QUERIES,
  ['registrations'],
  ['responders'],
  ['admin-notifications'],
];

/**
 * Coalesces a burst into one refetch per query key on the next tick.
 *
 * Immediate, but not once per event: a responder on the way streams a position
 * every ten metres, and five incidents moving at once is an ordinary minute for
 * this office. Without this, a busy minute would turn into a request storm and
 * the page would get slower exactly when it must not.
 */
const COALESCE_MS = 120;

class InvalidationQueue {
  constructor(private readonly client: QueryClient) {}

  private readonly pending = new Map<string, readonly string[]>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  push(keys: QueryKeyList): void {
    for (const key of keys) this.pending.set(key.join('|'), key);
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), COALESCE_MS);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const keys = [...this.pending.values()];
    this.pending.clear();
    for (const queryKey of keys) {
      void this.client.invalidateQueries({ queryKey: [...queryKey] });
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }
}

/**
 * Keeps the whole dashboard current off the event stream.
 *
 * Mounted once, above the router, and above the pages that read the cache it
 * refreshes — so this is not something a page can forget to do.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { admin } = useAuth();
  const isAdmin = !!admin;

  useEffect(() => {
    if (!isAdmin) return;
    connectSocket();

    const queue = new InvalidationQueue(queryClient);
    const unsubscribes = ROUTES.map(([events, keys]) =>
      onSocketEvents(events, () => queue.push(keys)),
    );

    // A reconnect means the stream was down, and nothing says for how long.
    // Everything live is re-read at once rather than waiting for the next event
    // to imply it.
    let wasConnected = false;
    const unsubscribeStatus = onSocketStatus((connected) => {
      if (connected && !wasConnected) queue.push(CATCH_UP_QUERIES);
      wasConnected = connected;
    });

    return () => {
      for (const off of unsubscribes) off();
      unsubscribeStatus();
      queue.dispose();
    };
  }, [isAdmin, queryClient]);

  return <>{children}</>;
}
