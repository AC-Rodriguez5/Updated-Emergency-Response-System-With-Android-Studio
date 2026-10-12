import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/services/apiClient';
import { connectSocket } from '@/services/socketClient';
import { useAuth } from '@/features/auth/useAuth';
import {
  hasActiveEmergencyAlert,
  playAlert,
  retryEmergencyAlertAudio as retryEmergencyAlertAudioPlayback,
  setEmergencyAlertBlockedHandler,
  startEmergencyAlert,
  stopEmergencyAlert as stopEmergencyAlertPlayback,
} from './alertSound';
import { loadNotifPrefs, subscribeNotifPrefs, type NotificationPrefs } from './prefs';
import type { AdminNotification } from './types';

interface NotificationContextValue {
  list: AdminNotification[];
  unreadCount: number;
  toasts: AdminNotification[];
  dismissToast: (id: string) => void;
  acknowledge: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => Promise<void>;
  emergencyAudioBlocked: boolean;
  stopEmergencyAlert: (requestId?: string) => void;
  retryEmergencyAudio: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const TOAST_AUTO_DISMISS_MS = 12_000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { admin } = useAuth();
  const isAdmin = admin?.role === 'admin';

  const [list, setList] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<AdminNotification[]>([]);
  const [emergencyAudioBlocked, setEmergencyAudioBlocked] = useState(false);
  const toastTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const prefsRef = useRef<NotificationPrefs>(loadNotifPrefs());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = toastTimers.current[id];
    if (t) {
      clearTimeout(t);
      delete toastTimers.current[id];
    }
  }, []);

  const queueToast = useCallback(
    (notif: AdminNotification) => {
      setToasts((prev) => {
        if (prev.some((t) => t.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 5);
      });
      const timer = setTimeout(
        () => dismissToast(notif.id),
        notif.priority === 'critical' ? TOAST_AUTO_DISMISS_MS * 2 : TOAST_AUTO_DISMISS_MS,
      );
      toastTimers.current[notif.id] = timer;
    },
    [dismissToast],
  );

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get<{
        data: { items: AdminNotification[]; unreadCount: number };
      }>('/admin/notifications?status=all&limit=50');
      setList(data.data.items);
      setUnreadCount(data.data.unreadCount);
    } catch {
      // ignore — will retry on next event
    }
  }, [isAdmin]);

  const stopEmergencyAlert = useCallback((requestId?: string) => {
    stopEmergencyAlertPlayback(requestId);
    setEmergencyAudioBlocked(false);
  }, []);

  const retryEmergencyAudio = useCallback(async () => {
    const played = await retryEmergencyAlertAudioPlayback();
    setEmergencyAudioBlocked(!played && hasActiveEmergencyAlert());
    return played;
  }, []);

  const acknowledge = useCallback(
    async (id: string) => {
      const notification = list.find((n) => n.id === id) ?? toasts.find((n) => n.id === id);
      try {
        await api.patch(`/admin/notifications/${id}/ack`);
        setList((prev) =>
          prev.map((n) => (n.id === id ? { ...n, status: 'acknowledged' } : n)),
        );
        if (notification?.status === 'unread') {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
      } catch {
        // ignore
      }
      if (notification?.type === 'emergency') {
        stopEmergencyAlert(notification.requestId ?? notification.id);
      }
      dismissToast(id);
    },
    [dismissToast, list, stopEmergencyAlert, toasts],
  );

  const markAllRead = useCallback(async () => {
    try {
      await api.post('/admin/notifications/mark-all-read');
      setList((prev) =>
        prev.map((n) => (n.status === 'unread' ? { ...n, status: 'read' } : n)),
      );
      setUnreadCount(0);
      stopEmergencyAlert();
    } catch {
      // ignore
    }
  }, [stopEmergencyAlert]);

  useEffect(() => {
    if (!isAdmin) {
      setList([]);
      setUnreadCount(0);
      setToasts([]);
      stopEmergencyAlert();
      return;
    }
    void refresh();
  }, [isAdmin, refresh]);

  useEffect(() => {
    return subscribeNotifPrefs((p) => {
      prefsRef.current = p;
    });
  }, []);

  useEffect(() => {
    setEmergencyAlertBlockedHandler((blocked) => {
      setEmergencyAudioBlocked(blocked && hasActiveEmergencyAlert());
    });
    return () => setEmergencyAlertBlockedHandler(null);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const socket = connectSocket();

    const onCreated = (notif: AdminNotification) => {
      setList((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev].slice(0, 200);
      });
      setUnreadCount((c) => c + 1);

      const prefs = prefsRef.current;
      const isCritical = notif.priority === 'critical';
      const shouldSurface = !prefs.criticalOnly || isCritical;

      if (shouldSurface) {
        queueToast(notif);
      }
      if (prefs.soundEnabled && shouldSurface) {
        if (notif.type === 'emergency') {
          startEmergencyAlert(notif.requestId ?? notif.id, notif.priority);
        } else {
          void playAlert(notif.priority);
        }
      }
      if (
        prefs.desktopNotifications &&
        shouldSurface &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.visibilityState === 'hidden'
      ) {
        try {
          new Notification(notif.title, {
            body: notif.message,
            tag: notif.id,
          });
        } catch {
          // Ignore browsers that throw on Notification construction.
        }
      }
    };

    socket.on('admin_notification.created', onCreated);
    socket.on('emergency.created', refresh);
    socket.on('emergency.iot_keychain_created', refresh);
    socket.on('emergency.iot_device_created', refresh);
    socket.on('emergency.assigned', refresh);
    socket.on('emergency.resolved', refresh);
    socket.on('emergency.responder_report', refresh);
    socket.on('emergency.update_requested', refresh);
    return () => {
      socket.off('admin_notification.created', onCreated);
      socket.off('emergency.created', refresh);
      socket.off('emergency.iot_keychain_created', refresh);
      socket.off('emergency.iot_device_created', refresh);
      socket.off('emergency.assigned', refresh);
      socket.off('emergency.resolved', refresh);
      socket.off('emergency.responder_report', refresh);
      socket.off('emergency.update_requested', refresh);
    };
  }, [isAdmin, queueToast, refresh]);

  useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach(clearTimeout);
      toastTimers.current = {};
      stopEmergencyAlertPlayback();
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      list,
      unreadCount,
      toasts,
      dismissToast,
      acknowledge,
      markAllRead,
      refresh,
      emergencyAudioBlocked,
      stopEmergencyAlert,
      retryEmergencyAudio,
    }),
    [
      list,
      unreadCount,
      toasts,
      dismissToast,
      acknowledge,
      markAllRead,
      refresh,
      emergencyAudioBlocked,
      stopEmergencyAlert,
      retryEmergencyAudio,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return ctx;
}
