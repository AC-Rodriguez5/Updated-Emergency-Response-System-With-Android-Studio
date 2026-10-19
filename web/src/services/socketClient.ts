import { io, type Socket } from 'socket.io-client';

const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;
const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const SOCKET_URL =
  configuredSocketUrl ?? configuredApiUrl?.replace(/\/api\/?$/, '') ?? undefined;

let socket: Socket | null = null;

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
  socket.on('connect', () => console.log('[socket] connected:', socket?.id));
  socket.on('disconnect', (reason) => console.log('[socket] disconnected:', reason));
  socket.on('connect_error', (err) => console.warn('[socket] error:', err.message));
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
