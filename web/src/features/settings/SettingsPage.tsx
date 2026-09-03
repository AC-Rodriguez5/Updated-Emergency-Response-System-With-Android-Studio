import { useState } from 'react';
import {
  User,
  Globe,
  Truck,
  Siren,
  Shield,
  Bell,
  Lock,
  Wrench,
  LifeBuoy,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { AdminShell } from '@/components/layout/AdminShell';
import { useAuth } from '@/features/auth/useAuth';
import { cn } from '@/lib/utils';
import { api, getApiError } from '@/services/apiClient';
import {
  loadNotifPrefs,
  saveNotifPrefs,
  type NotificationPrefs,
} from '@/features/notifications/prefs';
import { AmbulanceUnitsSection } from './AmbulanceUnitsSection';

type SectionKey =
  | 'profile'
  | 'scope'
  | 'ambulance_units'
  | 'emergency_types'
  | 'responder_roles'
  | 'notifications'
  | 'security'
  | 'maintenance'
  | 'support';

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: typeof User;
}

const SECTIONS: SectionDef[] = [
  { key: 'profile', label: 'Admin Profile', icon: User },
  { key: 'scope', label: 'Scope & Configuration', icon: Globe },
  { key: 'ambulance_units', label: 'Ambulance Units', icon: Truck },
  { key: 'emergency_types', label: 'Emergency Types', icon: Siren },
  { key: 'responder_roles', label: 'Responder Roles', icon: Shield },
  { key: 'notifications', label: 'Notification Settings', icon: Bell },
  { key: 'security', label: 'Account & Security', icon: Lock },
  { key: 'maintenance', label: 'System Maintenance', icon: Wrench },
  { key: 'support', label: 'Support', icon: LifeBuoy },
];

export default function SettingsPage() {
  const { admin } = useAuth();
  const [section, setSection] = useState<SectionKey>('profile');

  return (
    <AdminShell title="Settings">
      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-12 lg:col-span-3">
          <nav className="bg-white rounded-2xl border border-slate-200 p-2 sticky top-20">
            {SECTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left',
                  section === key
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="col-span-12 lg:col-span-9">
          {section === 'profile' && (
            <SectionWrapper title="Admin Profile" subtitle="Your account details.">
              <div className="space-y-3 text-sm">
                <Row label="Name" value={admin?.name ?? '—'} />
                <Row label="Email" value={admin?.email ?? '—'} />
                <Row label="Role" value={admin?.role ?? '—'} />
              </div>
            </SectionWrapper>
          )}

          {section === 'scope' && (
            <SectionWrapper
              title="Scope & Configuration"
              subtitle="Coverage area and operational windows."
            >
              <div className="space-y-3 text-sm">
                <Row label="Primary scope" value="Tanza Municipality, Cavite" />
                <Row label="Map default center" value="14.355°N, 120.885°E" />
                <Row label="Operating window" value="3:00 PM – 7:00 PM (Schedule/Transfer)" />
              </div>
            </SectionWrapper>
          )}

          {section === 'ambulance_units' && <AmbulanceUnitsSection />}

          {section === 'emergency_types' && <EmergencyTypesSection />}
          {section === 'responder_roles' && <ResponderRolesSection />}
          {section === 'notifications' && <NotificationSettingsSection />}
          {section === 'security' && <SecuritySection />}
          {section === 'maintenance' && <SystemMaintenanceSection />}
          {section === 'support' && (
            <SectionWrapper title="Support">
              <p className="text-slate-500 text-sm">
                For technical support, contact the TanzAlert development team or the Tanza MDRRMO IT
                coordinator.
              </p>
              <p className="text-slate-500 text-sm mt-2">MDRRMO Hotline: +6346-422-2100</p>
            </SectionWrapper>
          )}
        </main>
      </div>
    </AdminShell>
  );
}

function SectionWrapper({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <span className="text-slate-400 w-32 capitalize">{label}</span>
      <span className="text-slate-900 font-medium">{value}</span>
    </div>
  );
}

const EMERGENCY_TYPES = [
  { key: 'medical', label: 'Medical', description: 'Health emergencies — heart attack, severe injury, accident.' },
  { key: 'fire', label: 'Fire', description: 'Structure or vegetation fires requiring BFP/MDRRMO response.' },
  { key: 'crime', label: 'Crime', description: 'Active crimes routed to PNP for first response.' },
  { key: 'general_sos', label: 'General SOS', description: 'Catch-all panic alert when type is unknown or critical.' },
];

function EmergencyTypesSection() {
  return (
    <SectionWrapper
      title="Emergency Types"
      subtitle="System-defined categories. Used by mobile app buttons and IoT keychain mapping."
    >
      <div className="space-y-3">
        {EMERGENCY_TYPES.map((t) => (
          <div
            key={t.key}
            className="flex items-start gap-3 border border-slate-100 rounded-xl px-4 py-3"
          >
            <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 mt-0.5 capitalize">
              {t.label}
            </span>
            <p className="text-sm text-slate-600 flex-1">{t.description}</p>
          </div>
        ))}
        <p className="text-xs text-slate-400 pt-2">
          Adding or renaming types requires a code release because the mobile app and IoT firmware reference these keys.
        </p>
      </div>
    </SectionWrapper>
  );
}

const RESPONDER_ROLES = [
  { key: 'medic', label: 'Medic', description: 'Emergency medical responder.' },
  { key: 'fire_responder', label: 'Fire Responder', description: 'Fire suppression and rescue.' },
  { key: 'police_responder', label: 'Police Responder', description: 'Crime / public safety response.' },
  { key: 'ambulance_driver', label: 'Ambulance Driver', description: 'Transport-only personnel.' },
  { key: 'disaster_response', label: 'Disaster Response', description: 'MDRRMO multi-hazard responder.' },
  { key: 'general_responder', label: 'General Responder', description: 'Generic field responder.' },
];

function ResponderRolesSection() {
  return (
    <SectionWrapper
      title="Responder Roles"
      subtitle="Roles available when creating or approving responders."
    >
      <div className="space-y-3">
        {RESPONDER_ROLES.map((r) => (
          <div
            key={r.key}
            className="flex items-start gap-3 border border-slate-100 rounded-xl px-4 py-3"
          >
            <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 mt-0.5">
              {r.label}
            </span>
            <p className="text-sm text-slate-600 flex-1">{r.description}</p>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}

function NotificationSettingsSection() {
  const [prefs, setPrefsState] = useState<NotificationPrefs>(loadNotifPrefs);

  const update = (next: NotificationPrefs) => {
    setPrefsState(next);
    saveNotifPrefs(next);
  };

  return (
    <SectionWrapper
      title="Notification Settings"
      subtitle="Preferences are stored in this browser only and applied to incoming alerts immediately."
    >
      <div className="space-y-3">
        <Toggle
          label="Sound alerts"
          description="Play a beep when a new emergency or ambulance request arrives."
          checked={prefs.soundEnabled}
          onChange={(v) => update({ ...prefs, soundEnabled: v })}
        />
        <Toggle
          label="Critical-only mode"
          description="Suppress toasts and sounds for normal-priority notifications. Bell counter still updates."
          checked={prefs.criticalOnly}
          onChange={(v) => update({ ...prefs, criticalOnly: v })}
        />
        <Toggle
          label="Desktop notifications"
          description="Show OS-level notifications when this tab is in the background. Requires browser permission."
          checked={prefs.desktopNotifications}
          onChange={(v) => {
            if (v && typeof Notification !== 'undefined') {
              void Notification.requestPermission();
            }
            update({ ...prefs, desktopNotifications: v });
          }}
        />
      </div>
    </SectionWrapper>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-4 border border-slate-100 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 rounded border-slate-300"
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
    </label>
  );
}

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
    },
    onSuccess: () => {
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (e) => setError(getApiError(e)),
  });

  const submit = () => {
    setError('');
    setDone(false);
    if (!current || !next) {
      setError('Both fields are required.');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    mutation.mutate();
  };

  return (
    <SectionWrapper title="Account & Security" subtitle="Change your admin password.">
      <div className="space-y-4 max-w-md">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2.5 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {done && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-3 py-2.5 text-sm">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Password updated. You'll need to sign in again on other devices.</span>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Current password</label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">New password</label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={submit}
          disabled={mutation.isPending}
          className="px-4 py-2 bg-[#0F172A] text-white rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {mutation.isPending ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </SectionWrapper>
  );
}

function SystemMaintenanceSection() {
  return (
    <SectionWrapper
      title="System Maintenance"
      subtitle="Status snapshot. Detailed admin tooling lives in the Overview dashboard."
    >
      <div className="space-y-3 text-sm">
        <Row label="App version" value="TanzAlert 1.0" />
        <Row label="Backend" value="Node.js + Express + MongoDB Atlas" />
        <Row label="Map provider" value="OpenStreetMap" />
        <Row label="Last backup" value="Not available" />
      </div>
      <p className="text-xs text-slate-400 mt-4">
        For backup, IoT firmware updates, or manual data exports, contact the TanzAlert development team.
      </p>
    </SectionWrapper>
  );
}
