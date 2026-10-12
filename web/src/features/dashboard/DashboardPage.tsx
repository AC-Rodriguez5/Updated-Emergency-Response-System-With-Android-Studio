import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ambulance,
  Clock,
  Cpu,
  Users,
  UserCheck,
  ClipboardCheck,
  CheckCircle2,
  Timer,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { StatCard } from '@/components/ui/StatCard';
import { StatusBadge, TypeBadge, PriorityBadge } from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { api } from '@/services/apiClient';
import { getSocket } from '@/services/socketClient';
import { fmt } from '@/lib/utils';
import type { DeviceFleet, Emergency, Paginated } from '@/types';
import { motion } from 'motion/react';
import { listVariants } from '@/styles/motion';

interface OverviewSnapshot {
  activeEmergencies: number;
  pendingAmbulanceRequests: number;
  availableResponders: number;
  activeResponders: number;
  pendingApprovals: number;
  resolvedToday: number;
  averageResponseTime: string;
  systemStatus: {
    api: 'online' | 'offline';
    database: 'connected' | 'disconnected';
    socket: 'connected' | 'disconnected';
    map: 'active' | 'error';
  };
}

export default function DashboardPage() {
  const { data: overview, refetch: refetchOverview } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const { data } = await api.get<{ data: OverviewSnapshot }>('/admin/overview');
      return data.data;
    },
    refetchInterval: 30_000,
  });

  // Fleet readiness belongs on the landing page: a paired wearable with no
  // fingerprint enrolled cannot raise an alert at all, and nothing else on the
  // dashboard would reveal that until someone pressed it in an emergency.
  const { data: fleet } = useQuery({
    queryKey: ['admin-device-summary'],
    queryFn: async () => {
      const { data } = await api.get<{ data: DeviceFleet }>('/admin/devices?limit=1');
      return data.data.summary;
    },
    refetchInterval: 60_000,
  });

  const {
    data: activeData,
    isLoading,
    refetch: refetchActive,
  } = useQuery({
    queryKey: ['active-emergencies'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Paginated<Emergency> }>('/emergencies/active');
      return data.data;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => {
      void refetchActive();
      void refetchOverview();
    };
    socket.on('emergency.created', handler);
    socket.on('emergency.iot_keychain_created', handler);
    socket.on('emergency.iot_device_created', handler);
    socket.on('emergency.updated', handler);
    socket.on('emergency.resolved', handler);
    socket.on('emergency.assigned', handler);
    socket.on('ambulance_request.created', handler);
    socket.on('ambulance_request.completed', handler);
    return () => {
      socket.off('emergency.created', handler);
      socket.off('emergency.iot_keychain_created', handler);
      socket.off('emergency.iot_device_created', handler);
      socket.off('emergency.updated', handler);
      socket.off('emergency.resolved', handler);
      socket.off('emergency.assigned', handler);
      socket.off('ambulance_request.created', handler);
      socket.off('ambulance_request.completed', handler);
    };
  }, [refetchActive, refetchOverview]);

  const emergencies = activeData?.items ?? [];

  return (
    <AdminShell title="Overview">
      <div className="space-y-8">
        <motion.div
          variants={listVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <StatCard
            label="Active Emergencies"
            value={overview?.activeEmergencies ?? '—'}
            icon={<AlertTriangle className="w-6 h-6" />}
            urgent={(overview?.activeEmergencies ?? 0) > 0}
          />
          <StatCard
            label="Pending Ambulance"
            value={overview?.pendingAmbulanceRequests ?? '—'}
            icon={<Ambulance className="w-6 h-6" />}
            urgent={(overview?.pendingAmbulanceRequests ?? 0) > 0}
          />
          <StatCard
            label="Available Responders"
            value={overview?.availableResponders ?? '—'}
            icon={<Users className="w-6 h-6" />}
          />
          <StatCard
            label="Active Responders"
            value={overview?.activeResponders ?? '—'}
            icon={<UserCheck className="w-6 h-6" />}
          />
          <StatCard
            label="Pending Approvals"
            value={overview?.pendingApprovals ?? '—'}
            icon={<ClipboardCheck className="w-6 h-6" />}
            trend={(overview?.pendingApprovals ?? 0) > 0 ? 'Needs review' : undefined}
          />
          <Link to="/devices" className="min-w-0">
            <StatCard
              label="Panic Buttons Online"
              value={fleet ? `${fleet.online}/${fleet.total - fleet.unpaired}` : '—'}
              icon={<Cpu className="w-6 h-6" />}
              urgent={!!fleet?.needsAttention}
              trend={
                fleet?.needsAttention
                  ? `${fleet.needsAttention} cannot raise an alert`
                  : 'All paired devices ready'
              }
            />
          </Link>
          <StatCard
            label="Resolved Today"
            value={overview?.resolvedToday ?? '—'}
            icon={<CheckCircle2 className="w-6 h-6" />}
          />
          <StatCard
            label="Avg. Response Time"
            value={overview?.averageResponseTime ?? '—'}
            icon={<Timer className="w-6 h-6" />}
            trend="Last 30 days"
          />
          <StatCard
            label="Critical Queue"
            value={emergencies.filter((e) => e.priority === 'critical').length}
            icon={<Clock className="w-6 h-6" />}
            urgent={emergencies.some((e) => e.priority === 'critical')}
          />
        </motion.div>

        <div className="ta-panel overflow-hidden rounded-2xl">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Active Emergencies</h2>
            <span className="text-sm text-slate-500">{emergencies.length} total</span>
          </div>
          {isLoading ? (
            <TableSkeleton />
          ) : emergencies.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No active emergencies</p>
              <p className="text-sm mt-1">All clear — Tanza MDRRMO</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-6 py-3 text-left">Type / Source</th>
                    <th className="px-6 py-3 text-left">Priority</th>
                    <th className="px-6 py-3 text-left">Tanza</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Reported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {emergencies.map((em) => (
                    <tr key={em._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <TypeBadge type={em.type} source={em.source} />
                        {em.barangay && (
                          <p className="text-xs text-slate-400 mt-1">{em.barangay}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <PriorityBadge priority={em.priority} />
                      </td>
                      <td className="px-6 py-4">
                        {em.outsideScopeFlag ? (
                          <span className="text-amber-600 text-xs font-semibold">⚠ Outside</span>
                        ) : (
                          <span className="text-green-600 text-xs font-semibold">✓ Tanza</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={em.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {fmt(em.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ta-panel rounded-2xl p-5 sm:p-6">
          <h2 className="font-bold text-slate-900 mb-4">System Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SystemStatusTile
              label="API Server"
              value={overview?.systemStatus.api === 'online' ? 'Online' : 'Offline'}
              ok={overview?.systemStatus.api === 'online'}
            />
            <SystemStatusTile
              label="Database"
              value={overview?.systemStatus.database === 'connected' ? 'Connected' : 'Disconnected'}
              ok={overview?.systemStatus.database === 'connected'}
            />
            <SystemStatusTile
              label="WebSocket"
              value={overview?.systemStatus.socket === 'connected' ? 'Connected' : 'Disconnected'}
              ok={overview?.systemStatus.socket === 'connected'}
            />
            <SystemStatusTile
              label="Map Service"
              value={overview?.systemStatus.map === 'active' ? 'Active' : 'Error'}
              ok={overview?.systemStatus.map === 'active'}
            />
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function SystemStatusTile({ label, value, ok }: { label: string; value: string; ok: boolean | undefined }) {
  const indicator = ok === undefined ? 'bg-slate-300' : ok ? 'bg-green-500' : 'bg-red-500';
  return (
    <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="relative flex size-2">
          {ok && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />}
          <span className={`relative inline-flex size-2 rounded-full ${indicator}`} />
        </span>
        <span className="text-xs font-semibold text-slate-700">{label}</span>
      </div>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
