import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Ambulance, BellRing, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from './NotificationProvider';
import type { AdminNotification } from './types';
import { AnimatePresence, motion } from 'motion/react';

export function NotificationToasts() {
  const {
    toasts,
    dismissToast,
    acknowledge,
    emergencyAudioBlocked,
    retryEmergencyAudio,
  } = useNotifications();
  const navigate = useNavigate();

  if (toasts.length === 0 && !emergencyAudioBlocked) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 w-[360px] max-w-[calc(100vw-32px)]">
      <AnimatePresence initial={false}>
      {emergencyAudioBlocked && (
        <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="rounded-xl border border-red-300 bg-red-50 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">Emergency alert sound blocked</p>
              <p className="mt-1 text-xs text-slate-700">Use the button to enable audio for active emergency alerts.</p>
              <button
                onClick={() => void retryEmergencyAudio()}
                className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                Enable Sound
              </button>
            </div>
          </div>
        </motion.div>
      )}
      {toasts.map((n) => (
        <ToastCard
          key={n.id}
          notif={n}
          onDismiss={() => dismissToast(n.id)}
          onAck={() => acknowledge(n.id)}
          onAction={() => {
            if (n.type === 'emergency') {
              navigate(n.requestId ? `/map?emergencyId=${encodeURIComponent(n.requestId)}` : '/map');
            } else if (n.type === 'ambulance') {
              navigate('/ambulance-requests');
            }
            void acknowledge(n.id);
          }}
        />
      ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  notif,
  onDismiss,
  onAck,
  onAction,
}: {
  notif: AdminNotification;
  onDismiss: () => void;
  onAck: () => void;
  onAction: () => void;
}) {
  const accent =
    notif.priority === 'critical'
      ? 'border-red-300 bg-red-50'
      : notif.priority === 'high'
        ? 'border-amber-300 bg-amber-50'
        : 'border-slate-200 bg-white';
  const Icon =
    notif.type === 'ambulance' ? Ambulance : notif.type === 'emergency' ? AlertTriangle : BellRing;
  const iconColor =
    notif.priority === 'critical'
      ? 'text-red-600'
      : notif.priority === 'high'
        ? 'text-amber-600'
        : 'text-slate-500';
  const actionLabel = notif.type === 'ambulance' ? 'Open Request' : 'View on Map';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      className={cn(
        'rounded-xl shadow-lg border p-4 transition-all',
        accent,
        notif.priority === 'critical' && 'shadow-[0_10px_35px_rgba(229,72,77,.18)]',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0', iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-bold text-sm text-slate-900 truncate">{notif.title}</h4>
            <button
              onClick={onDismiss}
              className="p-1 -mr-1 text-slate-400 hover:text-slate-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-700 mt-1 break-words">{notif.message}</p>
          {notif.location?.address && (
            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {notif.location.address}
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={onAction}
              className="px-3 py-1.5 bg-[#0F172A] text-white rounded-lg text-xs font-bold hover:bg-slate-800"
            >
              {actionLabel}
            </button>
            <button
              onClick={onAck}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
            >
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
