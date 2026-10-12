import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MapPin, CheckCircle, FileText, MessageSquare } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import {
  StatusBadge,
  TypeBadge,
  PriorityBadge,
  LocationStatusBadge,
} from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/services/apiClient';
import { getSocket } from '@/services/socketClient';
import { fmt, isHardwareSource, locationLabel, sourceLabel } from '@/lib/utils';
import type { Emergency, Paginated } from '@/types';

const FILTERS = ['all', 'critical', 'medical', 'fire', 'crime', 'general_sos'] as const;
type Filter = (typeof FILTERS)[number];

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [resolveModal, setResolveModal] = useState<{ open: boolean; id: string; type: string } | null>(null);
  const [reviewIncident, setReviewIncident] = useState<Emergency | null>(null);
  const [updateModal, setUpdateModal] = useState<{ open: boolean; id: string } | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['active-emergencies-full', filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (filter !== 'all' && filter !== 'critical') params.set('type', filter);
      const { data } = await api.get<{ data: Paginated<Emergency> }>(`/emergencies/active?${params}`);
      let items = data.data.items;
      if (filter === 'critical') items = items.filter((e) => e.priority === 'critical');
      return items;
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => void refetch();
    socket.on('emergency.created', handler);
    socket.on('emergency.updated', handler);
    socket.on('emergency.responder_report', handler);
    socket.on('emergency.update_requested', handler);
    socket.on('emergency.resolved', handler);
    socket.on('emergency.iot_keychain_created', handler);
    socket.on('emergency.iot_device_created', handler);
    // A panic button streams fixes for the whole life of its incident; each one
    // can turn "Waiting for GPS" into a real position in this table.
    socket.on('emergency.location_updated', handler);
    return () => {
      socket.off('emergency.created', handler);
      socket.off('emergency.updated', handler);
      socket.off('emergency.responder_report', handler);
      socket.off('emergency.update_requested', handler);
      socket.off('emergency.resolved', handler);
      socket.off('emergency.iot_keychain_created', handler);
      socket.off('emergency.iot_device_created', handler);
      socket.off('emergency.location_updated', handler);
    };
  }, [refetch]);

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      await api.post(`/admin/emergencies/${id}/resolve`, { resolutionNotes: notes });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['active-emergencies-full'] });
      setReviewIncident(null);
      setResolveModal(null);
      setResolveNotes('');
    },
  });

  const requestUpdateMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const { data } = await api.post<{ data: Emergency }>(
        `/admin/emergencies/${id}/request-update`,
        { message },
      );
      return data.data;
    },
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['active-emergencies-full'] });
      setReviewIncident(updated);
      setUpdateModal(null);
      setUpdateMessage('');
    },
  });

  const emergencies = data ?? [];

  return (
    <AdminShell title="Live Incidents">
      <div className="space-y-6">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors capitalize ${
                filter === f ? 'bg-[#0F172A] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f === 'general_sos' ? 'SOS' : f === 'all' ? `All (${emergencies.length})` : f}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {isLoading ? (
            <TableSkeleton />
          ) : emergencies.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No active incidents</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-6 py-3 text-left">Type</th>
                    <th className="px-6 py-3 text-left">Priority</th>
                    <th className="px-6 py-3 text-left">Source</th>
                    <th className="px-6 py-3 text-left">Location</th>
                    <th className="px-6 py-3 text-left">Scope</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Reports</th>
                    <th className="px-6 py-3 text-left">Time</th>
                    <th className="px-6 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {emergencies.map((em) => (
                    <tr
                      key={em._id}
                      className={`hover:bg-slate-50 transition-colors ${em.priority === 'critical' ? 'bg-red-50/30' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <TypeBadge type={em.type} source={em.source} />
                      </td>
                      <td className="px-6 py-4"><PriorityBadge priority={em.priority} /></td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {isHardwareSource(em.source) ? (
                          <span className="text-blue-600 font-semibold">{sourceLabel(em.source)}</span>
                        ) : (
                          sourceLabel(em.source)
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="text-xs">{locationLabel(em)}</span>
                          </div>
                          <LocationStatusBadge
                            locationStatus={em.locationStatus}
                            trackingActive={em.trackingActive}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {em.locationStatus === 'pending' ? (
                          // Scope cannot be judged without coordinates, and claiming
                          // "Tanza" here would be a guess a dispatcher may act on.
                          <span className="inline-flex items-center gap-1 text-slate-400 text-xs font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Unknown
                          </span>
                        ) : em.outsideScopeFlag ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-bold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Outside
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-bold">
                            <CheckCircle className="w-3.5 h-3.5" /> Tanza
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4"><StatusBadge status={em.status} /></td>
                      <td className="px-6 py-4">
                        <ReportSummary emergency={em} />
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{fmt(em.createdAt)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setReviewIncident(em)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={!!reviewIncident}
        onClose={() => setReviewIncident(null)}
        title="Incident Review"
        className="max-w-3xl"
      >
        {reviewIncident && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <TypeBadge type={reviewIncident.type} source={reviewIncident.source} />
                <PriorityBadge priority={reviewIncident.priority} />
                <StatusBadge status={reviewIncident.status} />
                <LocationStatusBadge
                  locationStatus={reviewIncident.locationStatus}
                  trackingActive={reviewIncident.trackingActive}
                />
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <ReviewRow label="Sender" value={reviewIncident.userSnapshot?.fullName} />
                <ReviewRow label="Location" value={locationLabel(reviewIncident)} />
                <ReviewRow label="Source" value={sourceLabel(reviewIncident.source)} />
                <ReviewRow label="Reported" value={fmt(reviewIncident.createdAt)} />
                <ReviewRow label="Responder" value={reviewIncident.assignedResponderId ? 'Assigned' : 'Unassigned'} />
                {reviewIncident.source === 'iot_device' && (
                  <>
                    <ReviewRow label="Device" value={reviewIncident.sourceDeviceId} />
                    <ReviewRow
                      label="Authorized by"
                      value={
                        reviewIncident.hardwareAuthMethod === 'fingerprint'
                          ? 'Fingerprint + button press'
                          : undefined
                      }
                    />
                    <ReviewRow label="Last GPS fix" value={fmt(reviewIncident.lastLocationAt)} />
                  </>
                )}
              </dl>
            </div>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText className="h-4 w-4 text-blue-600" /> Responder Reports
              </h3>
              <ResponderReports emergency={reviewIncident} />
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setUpdateModal({ open: true, id: reviewIncident._id })}
                disabled={!reviewIncident.assignedResponderId || requestUpdateMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquare className="h-4 w-4" /> Ask for Update
              </button>
              <button
                onClick={() => setResolveModal({ open: true, id: reviewIncident._id, type: reviewIncident.type })}
                disabled={resolveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" /> Mark as Resolved
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={updateModal?.open ?? false}
        onClose={() => setUpdateModal(null)}
        title="Ask Responder for Update"
      >
        <p className="text-slate-600 text-sm mb-4">
          Write a clear request. The assigned responder will see it in the incident details.
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Update request message</label>
        <textarea
          value={updateMessage}
          onChange={(e) => setUpdateMessage(e.target.value)}
          rows={4}
          className="mb-4 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Example: Please confirm patient status and whether transport is needed."
        />
        <div className="flex justify-end gap-3">
          <button onClick={() => setUpdateModal(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => updateModal && requestUpdateMutation.mutate({ id: updateModal.id, message: updateMessage.trim() })}
            disabled={updateMessage.trim().length < 5 || requestUpdateMutation.isPending}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {requestUpdateMutation.isPending ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </Modal>

      <Modal
        open={resolveModal?.open ?? false}
        onClose={() => setResolveModal(null)}
        title="Resolve Emergency"
      >
        <p className="text-slate-600 text-sm mb-4">
          Mark this <strong className="capitalize">{resolveModal?.type?.replace('_', ' ')}</strong> emergency as resolved? This action is permanent.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Resolution notes (optional)</label>
          <textarea
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
            rows={3}
            placeholder="Describe how the emergency was resolved..."
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={() => setResolveModal(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => resolveModal && resolveMutation.mutate({ id: resolveModal.id, notes: resolveNotes || undefined })}
            disabled={resolveMutation.isPending}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {resolveMutation.isPending ? 'Resolving…' : 'Confirm Resolve'}
          </button>
        </div>
      </Modal>
    </AdminShell>
  );
}

function reportEvents(emergency: Emergency) {
  return [...(emergency.timeline ?? [])]
    .filter((event) => event.event === 'responder_report')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function updateRequests(emergency: Emergency) {
  return [...(emergency.timeline ?? [])]
    .filter((event) => event.event === 'admin_update_requested')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

function ReportSummary({ emergency }: { emergency: Emergency }) {
  const reports = reportEvents(emergency);
  const pendingUpdate = updateRequests(emergency).find((event) => event.reportStatus === 'needs_update');
  if (reports.length === 0 && !pendingUpdate) {
    return <span className="text-xs text-slate-400">No reports</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {reports.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
          <FileText className="h-3.5 w-3.5" /> {reports.length} submitted
        </span>
      )}
      {pendingUpdate && <StatusBadge status="needs_update" />}
    </div>
  );
}

function ResponderReports({ emergency }: { emergency: Emergency }) {
  const reports = reportEvents(emergency);
  const requests = updateRequests(emergency);
  if (reports.length === 0 && requests.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No responder reports or admin update requests have been recorded yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div key={`${request.at}-${request.note}`} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-800">
              <MessageSquare className="h-4 w-4" /> Admin Update Request
            </span>
            <StatusBadge status={request.reportStatus ?? 'needs_update'} />
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-amber-900">{request.note}</p>
          <p className="mt-2 text-xs text-amber-700">{fmt(request.at)}</p>
        </div>
      ))}
      {reports.map((report) => (
        <div key={`${report.at}-${report.note}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
              <FileText className="h-4 w-4 text-blue-600" /> Responder Field Report
            </span>
            <StatusBadge status={report.reportStatus ?? 'submitted'} />
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.note}</p>
          <p className="mt-2 text-xs text-slate-500">{fmt(report.at)}</p>
        </div>
      ))}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-800">{value || 'Not available'}</dd>
    </div>
  );
}
