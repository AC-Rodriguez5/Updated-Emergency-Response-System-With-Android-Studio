import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BatteryWarning,
  CheckCircle,
  Cpu,
  Fingerprint,
  Info,
  RadioTower,
  Search,
  Siren,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/apiClient';
import { fmt, sinceLabel } from '@/lib/utils';
import type { DeviceFleet, DeviceLinkStatus, PanicDevice } from '@/types';

const FILTERS: { value: 'all' | DeviceLinkStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'online', label: 'Online' },
  { value: 'idle', label: 'Idle' },
  { value: 'offline', label: 'Offline' },
  { value: 'unpaired', label: 'Unpaired' },
];

function LinkStatusBadge({ status }: { status: DeviceLinkStatus }) {
  const map = {
    online: { label: 'Online', variant: 'green' as const },
    idle: { label: 'Idle', variant: 'amber' as const },
    offline: { label: 'Offline', variant: 'red' as const },
    unpaired: { label: 'Unpaired', variant: 'outline' as const },
  };
  const cfg = map[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

/**
 * The readiness column answers "would this device work if pressed right now",
 * which is a different question from whether we have heard from it lately.
 */
function ReadinessCell({ device }: { device: PanicDevice }) {
  if (device.readiness === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
        <CheckCircle className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  const reason =
    device.readiness === 'not_enrolled'
      ? 'No fingerprint enrolled — cannot send an SOS'
      : device.readiness === 'owner_not_approved'
        ? "Owner's account is not approved"
        : device.revokedReason
          ? `Unpaired — ${device.revokedReason}`
          : 'Unpaired';
  return (
    <span
      className="inline-flex items-start gap-1.5 text-xs font-bold text-red-700"
      title={reason}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span className="font-semibold leading-4">{reason}</span>
    </span>
  );
}

export default function DevicesPage() {
  const [filter, setFilter] = useState<'all' | DeviceLinkStatus>('all');
  const [needsAttention, setNeedsAttention] = useState(false);
  const [search, setSearch] = useState('');

  // Liveness is not arranged here any more. `RealtimeProvider` maps every
  // backend event onto the query keys it invalidates, so this page is current
  // because it reads the cache — not because it remembered to subscribe. The
  // interval below is only a safety net for a socket that is down.
  const { data, isLoading } = useQuery({
    queryKey: ['admin-devices', filter, needsAttention, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100', status: filter });
      if (needsAttention) params.set('needsAttention', 'true');
      if (search.trim()) params.set('q', search.trim());
      const { data } = await api.get<{ data: DeviceFleet }>(`/admin/devices?${params}`);
      return data.data;
    },
    // Last-seen ages continuously, so the table is re-fetched rather than left to
    // show a stale "just now".
    refetchInterval: 30_000,
  });

  const devices = data?.items ?? [];
  const summary = data?.summary;
  const onlineMinutes = data ? Math.round(data.thresholds.onlineWithinSeconds / 60) : 5;

  return (
    <AdminShell title="Panic Button Devices">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Paired devices"
            value={summary ? summary.total - summary.unpaired : '—'}
            icon={<Cpu className="size-5" />}
            trend={summary ? `${summary.unpaired} unpaired` : undefined}
          />
          <StatCard
            label="Online now"
            value={summary?.online ?? '—'}
            icon={<RadioTower className="size-5" />}
            trend={`seen in the last ${onlineMinutes} min`}
          />
          <StatCard
            label="Needs attention"
            value={summary?.needsAttention ?? '—'}
            icon={<AlertTriangle className="size-5" />}
            urgent={!!summary?.needsAttention}
            trend="cannot raise an alert"
          />
          <StatCard
            label="Tracking an incident"
            value={summary?.tracking ?? '—'}
            icon={<Siren className="size-5" />}
            urgent={!!summary?.tracking}
            trend="streaming GPS now"
          />
        </div>

        {/* The honesty note. Without it, "Offline" reads as "the device is broken",
            when it usually means the owner's phone has not been near it. */}
        <div className="flex gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            <strong>Last seen</strong> advances when the owner&apos;s phone relays a
            Bluetooth check-in, or when the device itself sends an alert or a GPS fix.
            A device can be powered and perfectly healthy and still read{' '}
            <strong>Offline</strong> simply because the owner&apos;s phone has not
            been near it or the app is not running. Use <strong>Readiness</strong> to
            judge whether a device would work if pressed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                filter === f.value
                  ? 'bg-[#0F172A] text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
              {f.value !== 'all' && summary ? ` (${summary[f.value]})` : ''}
            </button>
          ))}
          <button
            onClick={() => setNeedsAttention((v) => !v)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              needsAttention
                ? 'bg-red-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Needs attention only
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Device ID, owner, barangay"
              className="w-64 rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {isLoading ? (
            <TableSkeleton />
          ) : devices.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Cpu className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No devices match this view</p>
              {summary?.total === 0 && (
                <p className="mt-1 text-xs">
                  Devices appear here once a resident pairs one from the mobile app.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 text-left">Device</th>
                    <th className="px-6 py-3 text-left">Owner</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Last seen</th>
                    <th className="px-6 py-3 text-left">Readiness</th>
                    <th className="px-6 py-3 text-left">Delivery</th>
                    <th className="px-6 py-3 text-left">Battery</th>
                    <th className="px-6 py-3 text-left">Incidents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {devices.map((device) => (
                    <tr
                      key={device.id}
                      className={`transition-colors hover:bg-slate-50 ${
                        device.activeIncident ? 'bg-red-50/40' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-mono text-xs font-semibold text-slate-800">
                          {device.deviceId}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {device.firmwareVersion
                            ? `firmware ${device.firmwareVersion}`
                            : 'firmware unknown'}
                        </p>
                        {device.activeIncident && (
                          <Link
                            to={`/map?emergencyId=${device.activeIncident.id}`}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-red-700 hover:underline"
                          >
                            <Siren className="h-3 w-3" />
                            {device.activeIncident.locationStatus === 'pending'
                              ? 'Live alert — waiting for GPS'
                              : `Live alert — rev ${device.activeIncident.locationRevision}`}
                          </Link>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-semibold text-slate-800">
                          {device.owner?.name ?? 'Unknown'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {[device.owner?.barangay, device.owner?.phone]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <LinkStatusBadge status={device.linkStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-semibold text-slate-700">
                          {sinceLabel(device.secondsSinceSeen)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {device.lastSeenAt ? fmt(device.lastSeenAt) : 'No contact yet'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <ReadinessCell device={device} />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600"
                            title={
                              device.directCellularEnabled
                                ? 'Posts to the backend over its own cellular link'
                                : 'Relays through the paired phone over Bluetooth'
                            }
                          >
                            <Activity className="h-3 w-3" />
                            {device.directCellularEnabled ? 'Cellular' : 'Phone relay'}
                          </span>
                          {device.lastTransport && (
                            <span className="text-[11px] text-slate-400">
                              last via{' '}
                              {device.lastTransport === 'lte' ? 'cellular' : 'phone'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {device.batteryPercent === undefined ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-bold ${
                              device.batteryPercent <= 20
                                ? 'text-red-700'
                                : 'text-slate-700'
                            }`}
                          >
                            {device.batteryPercent <= 20 && (
                              <BatteryWarning className="h-3.5 w-3.5" />
                            )}
                            {device.batteryPercent}%
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                          <Fingerprint className="h-3.5 w-3.5 text-slate-400" />
                          {device.totalIncidents}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
