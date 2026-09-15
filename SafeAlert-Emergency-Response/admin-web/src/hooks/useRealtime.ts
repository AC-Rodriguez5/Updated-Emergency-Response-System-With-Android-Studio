import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, currentSession, refreshSession, sessionEvents } from '@/api';
import { invalidateResources } from './useResource';
export function useRealtime() {
  const [status, setStatus] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('connecting');
  useEffect(() => {
    let disposed = false; let refreshing = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const endpoint = import.meta.env.VITE_SOCKET_URL || API_URL.replace(/\/api$/, '');
    const socket = io(endpoint, { auth: { token: currentSession()?.accessToken }, reconnectionDelay: 1000, reconnectionDelayMax: 30_000, timeout: 10_000 });
    const refreshData = () => { if (!refreshTimer) refreshTimer = setTimeout(() => { refreshTimer = undefined; invalidateResources(); }, 500); };
    const reauthenticate = async () => {
      if (!navigator.onLine || refreshing || disposed) return;
      refreshing = true;
      try { await refreshSession(); if (!disposed) socket.connect(); } catch { /* Retain offline session; invalid credentials are cleared by the client. */ }
      finally { refreshing = false; }
    };
    socket.on('connect', () => { setStatus('live'); refreshData(); });
    socket.on('disconnect', reason => { setStatus(navigator.onLine ? 'reconnecting' : 'offline'); if (reason === 'io server disconnect') void reauthenticate(); });
    socket.on('connect_error', error => {
      setStatus(navigator.onLine ? 'reconnecting' : 'offline');
      // Connection/network failures are not evidence that authentication expired.
      if (/session expired|authentication required|unauthorized|token expired/i.test(error.message)) void reauthenticate();
    });
    for (const event of ['emergency.created', 'emergency.updated', 'emergency.assigned', 'emergency.responder_on_the_way', 'emergency.responder_nearby', 'emergency.resolved', 'emergency.cancelled', 'emergency.false_alarm', 'emergency.responder_report_submitted', 'location.user_updated', 'location.responder_updated', 'registration.created', 'registration.reviewed']) socket.on(event, refreshData);
    const tokenChanged = () => { socket.auth = { token: currentSession()?.accessToken }; if (currentSession()) { socket.disconnect(); socket.connect(); } else socket.disconnect(); };
    const online = () => { setStatus('connecting'); socket.connect(); invalidateResources(); };
    const offline = () => setStatus('offline');
    sessionEvents.addEventListener('change', tokenChanged);
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    const fallback = setInterval(() => { if (!socket.connected && navigator.onLine) { socket.connect(); invalidateResources(); } }, 15_000);
    return () => { disposed = true; socket.disconnect(); clearInterval(fallback); clearTimeout(refreshTimer); sessionEvents.removeEventListener('change', tokenChanged); window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
  return status;
}

