import { io, type Socket } from 'socket.io-client';

const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;
const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const SOCKET_URL =
  configuredSocketUrl ?? configuredApiUrl?.replace(/\/api\/?$/, '') ?? undefined;

let socket: Socket | null = null;

export type SocketHandler = (payload: unknown) => void;

/**
 * Who wants which event, independent of whether a socket exists yet.
 *
 * Pages used to call `getSocket()` in an effect and `return` when it came back
 * null — which it does on a page load, because `AuthProvider` only dials after
 * `/auth/me` answers. The effect never ran again, so the page spent the rest of
 * the session deaf and relied on its polling interval. The same thing happened
 * after a sign-out: `disconnectSocket` dropped the instance, the next sign-in
 * built a new one, and every listener still attached to the old one.
 *
 * Subscriptions now live here and are re-bound to whatever socket is current.
 */
const subscribers = new Map<string, Set<SocketHandler>>();
/** Event names already forwarded on the live socket. */
const boundOnSocket = new Set<string>();

type StatusHandler = (connected: boolean) => void;
const statusSubscribers = new Set<StatusHandler>();

function authPayload() {
  const token = localStorage.getItem('admin_access_token');
  return token ? { token } : {};
}

/**
 * The server refuses a handshake without a valid token, and this provider sits
 * above the login page, so dialling before anyone has signed in would just
 * reconnect-loop against a guaranteed rejection. The instance is still handed
 * back — callers attach their listeners to it — it simply waits until there is
 * a token to present, which `AuthProvider` arranges by calling again on login.
 */
function hasToken(auth: ReturnType<typeof authPayload>): boolean {
  return 'token' in auth;
}

function forward(target: Socket, event: string): void {
  if (boundOnSocket.has(event)) return;
  boundOnSocket.add(event);
  target.on(event, (payload: unknown) => {
    // Copied before iterating: a handler is allowed to unsubscribe itself.
    for (const handler of [...(subscribers.get(event) ?? [])]) {
      try {
        handler(payload);
      } catch (err) {
        console.warn(`[socket] handler for ${event} threw:`, err);
      }
    }
  });
}

function announce(connected: boolean): void {
  for (const handler of [...statusSubscribers]) {
    try {
      handler(connected);
    } catch {
      // A status listener is a dot on a screen; it cannot be allowed to break
      // the connection it reports on.
    }
  }
}

export function connectSocket(): Socket {
  const auth = authPayload();

  if (socket) {
    socket.auth = auth;
    if (!socket.connected && hasToken(auth)) socket.connect();
    return socket;
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth,
    autoConnect: hasToken(auth),
    reconnection: true,
    reconnectionDelay: 2000,
  });
  socket.io.on('reconnect_attempt', () => {
    // Picks up a token the API client refreshed after a 401 in the meantime.
    if (socket) socket.auth = authPayload();
  });
  socket.on('connect', () => {
    console.log('[socket] connected:', socket?.id);
    announce(true);
  });
  socket.on('disconnect', (reason) => {
    console.log('[socket] disconnected:', reason);
    announce(false);
  });
  socket.on('connect_error', (err) => {
    console.warn('[socket] error:', err.message);
    announce(false);
  });

  boundOnSocket.clear();
  for (const event of subscribers.keys()) forward(socket, event);
  return socket;
}

/**
 * Subscribe to backend events for as long as the returned function is uncalled.
 *
 * Safe to call before anyone has signed in: the subscription is held here and
 * attached as soon as there is a socket.
 */
export function onSocketEvents<T>(
  events: readonly string[],
  handler: (payload: T) => void,
): () => void {
  const entry = handler as unknown as SocketHandler;
  for (const event of events) {
    let set = subscribers.get(event);
    if (!set) {
      set = new Set();
      subscribers.set(event, set);
    }
    set.add(entry);
    if (socket) forward(socket, event);
  }
  return () => {
    for (const event of events) subscribers.get(event)?.delete(entry);
  };
}

/**
 * Connection state, including the current value immediately — a dot that waits
 * for the next transition to tell the truth is worse than no dot.
 */
export function onSocketStatus(handler: StatusHandler): () => void {
  statusSubscribers.add(handler);
  handler(socket?.connected === true);
  return () => {
    statusSubscribers.delete(handler);
  };
}

export function isSocketConnected(): boolean {
  return socket?.connected === true;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  boundOnSocket.clear();
  announce(false);
}
