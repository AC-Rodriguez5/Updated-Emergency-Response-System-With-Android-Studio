import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MapPin, CheckCircle, FileText, MessageSquare, Undo2, Send } from 'lucide-react';
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
import { fmt, isHardwareSource, locationLabel, sourceLabel } from '@/lib/utils';
import type { Emergency, Paginated } from '@/types';

const FILTERS = ['all', 'critical', 'medical', 'fire', 'crime', 'general_sos'] as const;
type Filter = (typeof FILTERS)[number];

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [resolveModal, setResolveModal] = useState<{ open: boolean; id: string; type: string } | null>(null);
  const [reviewIncident, setReviewIncident] = useState<Emergency | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [draft, setDraft] = useState('');
  const [tellResident, setTellResident] = useState(false);

  // Liveness is not arranged here any more. `RealtimeProvider` maps every
  // backend event onto the query keys it invalidates, so this page is current
  // because it reads the cache — not because it remembered to subscribe. The
  // interval below is only a safety net for a socket that is down.
  const { data, isLoading } = useQuery({
    queryKey: ['active-emergencies-full', filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (filter !== 'all' && filter !== 'critical') params.set('type', filter);
      const { data } = await api.get<{ data: Paginated<Emergency> }>(`/emergencies/active?${params}`);
      let items = data.data.items;
      if (filter === 'critical') items = items.filter((e) => e.priority === 'critical');
      return items;
    },
    refetchInterval: 60_000,
  });

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

  // A sentence, not a filing. "Are you still at the gate?" should not cost a
  // dispatcher two minutes of waiting for somebody to write a report about it.
  const messageMutation = useMutation({
    mutationFn: async ({ id, message, audience }: { id: string; message: string; audience: 'dispatch' | 'all' }) => {
      const { data } = await api.post<{ data: Emergency }>(
        `/emergencies/${id}/message`,
        { message, audience },
      );
      return data.data;
    },
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['active-emergencies-full'] });
      setReviewIncident(updated);
      setDraft('');
    },
  });

  // Takes the incident off its responder and returns it to the pending pool.
  // Without this an unreachable phone holds an open emergency until someone
  // closes it as resolved, which is a lie told to the reports page.
  const releaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ data: Emergency }>(
        `/emergencies/${id}/release`,
        { reason: 'Released by dispatcher' },
      );
      return data.data;
    },
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['active-emergencies-full'] });
      setReviewIncident(updated);
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
                <ReviewRow
                  label="Responder"
                  value={
                    !reviewIncident.assignedResponderId
                      ? reviewIncident.dispatchOverdue
                        ? 'Unassigned — nobody has accepted'
                        : 'Unassigned'
                      : reviewIncident.assignmentAckAt
                        ? 'Assigned and acknowledged'
                        : 'Assigned — waiting for acknowledgement'
                  }
                />
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
                <FileText className="h-4 w-4 text-blue-600" /> Messages &amp; Responder Reports
              </h3>
              <ResponderReports emergency={reviewIncident} />
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <Send className="h-4 w-4 text-blue-600" /> Say something now
              </h3>
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_REPLIES.map((quick) => (
                  <button
                    key={quick.label}
                    onClick={() =>
                      messageMutation.mutate({
                        id: reviewIncident._id,
                        message: quick.message,
                        audience: tellResident ? 'all' : 'dispatch',
                      })
                    }
                    disabled={messageMutation.isPending}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {quick.label}
                  </button>
                ))}
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Type an update for the responder…"
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-blue-400 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={tellResident}
                    onChange={(e) => setTellResident(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Also show this to the person in the emergency
                  <span className="font-normal text-slate-400">(applies to the quick replies too)</span>
                </label>
                <button
                  onClick={() =>
                    messageMutation.mutate({
                      id: reviewIncident._id,
                      message: draft,
                      audience: tellResident ? 'all' : 'dispatch',
                    })
                  }
                  disabled={!draft.trim() || messageMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" /> {messageMutation.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => releaseMutation.mutate(reviewIncident._id)}
                disabled={!reviewIncident.assignedResponderId || releaseMutation.isPending}
                title="Return this incident to the pending pool"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> {releaseMutation.isPending ? 'Releasing…' : 'Release'}
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

// Messages the person in the emergency typed from the mobile app. Newest first:
// in a live incident the latest thing they said is the thing that matters.
function userMessages(emergency: Emergency) {
  return [...(emergency.timeline ?? [])]
    .filter((event) => event.event === 'user_message')
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

// The live channel: what the responder in the field and dispatch have said to
// each other while the incident is open. Oldest first, because this one reads
// as a conversation rather than as a stack of filings.
function channelMessages(emergency: Emergency) {
  return [...(emergency.timeline ?? [])]
    .filter((event) => event.event === 'message')
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

// One tap, sent the moment it is pressed. Every one of these goes to the
// assigned responder; whether it also reaches the person in the emergency is
// the dispatcher's call, made with the checkbox below them.
const QUICK_REPLIES: Array<{ label: string; message: string }> = [
  { label: 'Status?', message: 'Status update please.' },
  { label: 'ETA?', message: 'What is your ETA?' },
  { label: 'Backup sent', message: 'Backup is on the way to you.' },
  { label: 'Help is close', message: 'Help is close. Stay where you are if it is safe.' },
  { label: 'Stand down', message: 'Stand down — this incident is being handled elsewhere.' },
];

function ReportSummary({ emergency }: { emergency: Emergency }) {
  const reports = reportEvents(emergency);
  const messages = userMessages(emergency);
  const pendingUpdate = updateRequests(emergency).find((event) => event.reportStatus === 'needs_update');
  if (reports.length === 0 && messages.length === 0 && !pendingUpdate) {
    return <span className="text-xs text-slate-400">No reports</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {messages.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
          <MessageSquare className="h-3.5 w-3.5" /> {messages.length} from sender
        </span>
      )}
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
  const messages = userMessages(emergency);
  const channel = channelMessages(emergency);
  if (
    reports.length === 0 &&
    requests.length === 0 &&
    messages.length === 0 &&
    channel.length === 0
  ) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No messages, responder reports or admin update requests have been recorded yet.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {channel.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Incident channel
          </p>
          <div className="space-y-2">
            {channel.map((entry) => (
              <div
                key={`${entry.at}-${entry.note}`}
                className={`rounded-xl p-3 ${
                  entry.actorRole === 'responder'
                    ? 'bg-blue-50 text-blue-900'
                    : 'bg-amber-50 text-amber-900'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span>{entry.actorRole === 'responder' ? 'Responder' : 'Dispatch'}</span>
                  <span className="font-medium opacity-70">{fmt(entry.at)}</span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 font-semibold">
                    {entry.audience === 'all' ? 'Seen by the resident' : 'Dispatch only'}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6">{entry.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* The sender's own words come first — nobody else on this screen is
          standing where the emergency is. */}
      {messages.map((message) => (
        <div key={`${message.at}-${message.note}`} className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-bold text-red-800">
              <MessageSquare className="h-4 w-4" /> Message from sender
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-red-900">{message.note}</p>
          <p className="mt-2 text-xs text-red-700">{fmt(message.at)}</p>
        </div>
      ))}
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
