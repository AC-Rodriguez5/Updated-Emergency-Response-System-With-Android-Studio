import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { CheckCircle, XCircle, Truck, ChevronLeft, Navigation, User as UserIcon, Flag, ShieldCheck, Circle, AlertTriangle, AlertCircle, Loader2, MapPin } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { StatusBadge, PriorityBadge } from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { AuthedImage } from '@/components/ui/AuthedImage';
import { api, getApiError } from '@/services/apiClient';
import { getSocket } from '@/services/socketClient';
import { fmt } from '@/lib/utils';
import type { AmbulanceRequest, AmbulanceUnit, Paginated, ResponderRegistration } from '@/types';

type StatusFilter = 'pending_review' | 'approved' | 'rejected' | 'assigned' | 'completed' | 'all';

const pickupIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const dropIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41] });
const ASSIGNABLE_DUTY_STATUSES = new Set(['on_duty', 'available']);
const BLOCKED_DUTY_STATUSES = new Set([
  'off_duty',
  'busy',
  'offline',
  'suspended',
  'inactive',
  'unavailable',
  'rejected',
  'pending',
  'not_approved',
]);

function isAssignableResponder(responder: ResponderRegistration) {
  const dutyStatus = String(responder.dutyStatus ?? '').toLowerCase();
  const activeDuty = responder.isOnDuty === true || ASSIGNABLE_DUTY_STATUSES.has(dutyStatus);
  return (
    responder.isApproved === true &&
    responder.approvalStatus === 'approved' &&
    activeDuty &&
    !BLOCKED_DUTY_STATUSES.has(dutyStatus)
  );
}

function getResponderDistanceKm(
  responder: ResponderRegistration,
  pickupCoordinates: [number, number],
) {
  if (!responder.currentLocation) return null;
  const [pickupLng, pickupLat] = pickupCoordinates;
  return haversineKm(
    pickupLat,
    pickupLng,
    responder.currentLocation.latitude,
    responder.currentLocation.longitude,
  );
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`;
}

function formatDutyStatus(dutyStatus?: string) {
  return dutyStatus ? dutyStatus.replace(/_/g, ' ') : 'on duty';
}

function formatResponderOption(responder: ResponderRegistration, distanceKm: number | null) {
  const agency = responder.agencyType ?? responder.department ?? 'Responder';
  const distance = distanceKm === null ? 'location unavailable' : `${formatDistance(distanceKm)} from pickup`;
  return `${responder.name} - ${agency} - ${formatDutyStatus(responder.dutyStatus)} - ${distance}`;
}

export default function AmbulanceRequestsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending_review');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<AmbulanceRequest | null>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [assignModal, setAssignModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedResponder, setSelectedResponder] = useState<string>('');
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState<string | null>(null);
  const dialogOpen = rejectModal || assignModal;

  const { data: listData, isLoading, refetch } = useQuery({
    queryKey: ['ambulance-requests', statusFilter, includeArchived],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (includeArchived) qs.set('includeArchived', 'true');
      const params = qs.toString() ? `?${qs.toString()}` : '';
      const { data } = await api.get<{ data: Paginated<AmbulanceRequest> }>(`/admin/ambulance-requests${params}`);
      return data.data;
    },
    refetchInterval: 30_000,
  });

  const { data: availableUnits } = useQuery({
    queryKey: ['ambulance-units-available', selected?._id],
    queryFn: async () => {
      const requestParam = selected?._id ? `?requestId=${encodeURIComponent(selected._id)}` : '';
      const { data } = await api.get<{ data: AmbulanceUnit[] }>(`/admin/ambulance-requests/units/available${requestParam}`);
      return data.data;
    },
    enabled: assignModal && !!selected,
  });

  const { data: responders } = useQuery({
    queryKey: ['responders-list'],
    queryFn: async () => {
      const { data } = await api.get<{ data: { items: ResponderRegistration[] } }>('/admin/registrations?type=responder&status=approved');
      return data.data.items;
    },
    enabled: assignModal,
  });

  const activeResponders = useMemo(() => {
    const pickupCoordinates = selected?.pickupLocation?.coordinates;
    return (responders ?? [])
      .filter(isAssignableResponder)
      .map((responder) => ({
        responder,
        distanceKm: pickupCoordinates
          ? getResponderDistanceKm(responder, pickupCoordinates)
          : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return a.responder.name.localeCompare(b.responder.name);
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
  }, [responders, selected?.pickupLocation?.coordinates]);

  const selectedResponderDetails =
    activeResponders.find(({ responder }) => responder._id === selectedResponder) ?? null;
  const inactiveResponderCount = Math.max((responders?.length ?? 0) - activeResponders.length, 0);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => void refetch();
    socket.on('ambulance_request.created', handler);
    socket.on('ambulance_request.reviewed', handler);
    socket.on('ambulance_request.assigned', handler);
    socket.on('ambulance_request.completed', handler);
    return () => {
      socket.off('ambulance_request.created', handler);
      socket.off('ambulance_request.reviewed', handler);
      socket.off('ambulance_request.assigned', handler);
      socket.off('ambulance_request.completed', handler);
    };
  }, [refetch]);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/admin/ambulance-requests/${id}/approve`, { notes: 'Approved by admin' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ambulance-requests'] }); setSelected((s) => s ? { ...s, status: 'approved' } : s); },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => api.post(`/admin/ambulance-requests/${id}/reject`, { reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ambulance-requests'] }); setRejectModal(false); setSelected(null); },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ id, unitId, responderId }: { id: string; unitId: string; responderId: string }) => {
      const { data } = await api.post<{ data: AmbulanceRequest }>(
        `/admin/ambulance-requests/${id}/assign`,
        { ambulanceUnitId: unitId, responderId },
      );
      return data.data;
    },
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['ambulance-requests'] });
      void qc.invalidateQueries({ queryKey: ['ambulance-units-available'] });
      void qc.invalidateQueries({ queryKey: ['responders-list'] });
      void qc.invalidateQueries({ queryKey: ['responders-live'] });
      void qc.invalidateQueries({ queryKey: ['admin-overview'] });
      setAssignModal(false);
      setSelected(updated);
      setSelectedUnit('');
      setSelectedResponder('');
      setAssignmentError(null);
      setAssignmentSuccess('Ambulance unit and responder assigned successfully.');
    },
    onError: (error) => {
      setAssignmentError(getApiError(error));
    },
  });

  const transitionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: 'mark-on-the-way' | 'mark-picked-up' | 'mark-completed';
    }) => {
      const { data } = await api.post<{ data: AmbulanceRequest }>(
        `/admin/ambulance-requests/${id}/${action}`,
        {},
      );
      return data.data;
    },
    onSuccess: (updated) => {
      void qc.invalidateQueries({ queryKey: ['ambulance-requests'] });
      setSelected(updated);
    },
  });

  const requests = listData?.items ?? [];

  const openAssignModal = () => {
    setSelectedUnit('');
    setSelectedResponder('');
    setAssignmentError(null);
    setAssignmentSuccess(null);
    setAssignModal(true);
  };

  const closeAssignModal = () => {
    setAssignModal(false);
    setAssignmentError(null);
  };

  const handleAssign = () => {
    if (!selected) return;
    setAssignmentError(null);
    setAssignmentSuccess(null);

    if (!selectedUnit) {
      setAssignmentError('Select an available ambulance unit before assigning.');
      return;
    }
    if (activeResponders.length === 0) {
      setAssignmentError('No active approved responders are available for assignment.');
      return;
    }
    if (!selectedResponderDetails) {
      setAssignmentError('Select an active approved responder before assigning.');
      return;
    }

    assignMutation.mutate({
      id: selected._id,
      unitId: selectedUnit,
      responderId: selectedResponderDetails.responder._id,
    });
  };

  if (selected) {
    // A booking past its retention window keeps its skeleton and loses its
    // personal contents, so every one of these can be absent.
    const pickup = selected.pickupLocation?.coordinates;
    const drop = selected.dropOffLocation?.coordinates;
    const redacted = Boolean(selected.personalDataRedactedAt);
    return (
      <AdminShell
        title="Ambulance Request Detail"
        actions={
          <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ChevronLeft className="w-4 h-4" /> Back to list
          </button>
        }
      >
        {selected.isEmergencyPriority && (
          <div className="mb-4 bg-red-600 text-white rounded-2xl px-6 py-3 flex items-center gap-3 font-bold">
            <AlertIcon />
            CRITICAL — Emergency Ambulance Request
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                Sender Information
                {selected.isTanzaCitizenPriority && (
                  <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2.5 py-0.5 font-bold">Tanza Priority</span>
                )}
              </h2>
              <dl className="space-y-3">
                <Row label="Full name" value={selected.senderSnapshot?.fullName} />
                <Row label="Age" value={selected.senderSnapshot?.age?.toString()} />
                <Row label="Blood type" value={selected.senderSnapshot?.bloodType} />
                <Row label="Municipality" value={selected.senderSnapshot?.municipality} />
                <Row label="Barangay" value={selected.senderSnapshot?.barangay} />
              </dl>
              <div className="mt-5 border-t border-slate-100 pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                  <ShieldCheck className="h-4 w-4 text-blue-600" /> Sender Verification
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <VerificationPhoto
                    label="Profile / Face Photo"
                    fileId={selected.senderSnapshot?.faceCaptureFileId}
                  />
                  <VerificationPhoto
                    label="Valid ID"
                    fileId={selected.senderSnapshot?.validIdFileId ?? selected.senderSnapshot?.proofOfResidencyFileId}
                  />
                </div>
              </div>
              {selected.outsideScopeFlag && (
                <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl p-3 font-semibold">
                  Outside Tanza scope. Requires admin decision.
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 mb-4">Status</h2>
              <div className="flex items-center gap-3 mb-4">
                <StatusBadge status={selected.status} />
                <PriorityBadge priority={selected.isEmergencyPriority ? 'critical' : 'medium'} />
              </div>
              {selected.status === 'pending_review' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => approveMutation.mutate(selected._id)}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => setRejectModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                </div>
              )}
              {selected.status === 'approved' && (
                <button
                  onClick={openAssignModal}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold"
                >
                  <Truck className="w-4 h-4" /> Assign Ambulance Unit
                </button>
              )}
              {assignmentSuccess && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{assignmentSuccess}</span>
                </div>
              )}
              {(['assigned', 'on_the_way', 'arrived_pickup', 'patient_onboard'] as const).includes(
                selected.status as 'assigned' | 'on_the_way' | 'arrived_pickup' | 'patient_onboard',
              ) && (
                <div className="flex flex-wrap gap-2">
                  {selected.status === 'assigned' && (
                    <button
                      onClick={() =>
                        transitionMutation.mutate({ id: selected._id, action: 'mark-on-the-way' })
                      }
                      disabled={transitionMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                      <Navigation className="w-4 h-4" /> Mark On the Way
                    </button>
                  )}
                  {selected.status === 'on_the_way' && (
                    <button
                      onClick={() =>
                        transitionMutation.mutate({ id: selected._id, action: 'mark-picked-up' })
                      }
                      disabled={transitionMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                      <UserIcon className="w-4 h-4" /> Mark Picked Up
                    </button>
                  )}
                  {(selected.status === 'arrived_pickup' || selected.status === 'patient_onboard') && (
                    <button
                      onClick={() =>
                        transitionMutation.mutate({ id: selected._id, action: 'mark-completed' })
                      }
                      disabled={transitionMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                      <Flag className="w-4 h-4" /> Mark Completed
                    </button>
                  )}
                </div>
              )}
              {selected.rejectionReason && (
                <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                  <strong>Rejection reason:</strong> {selected.rejectionReason}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-bold text-slate-900 mb-4">Transport Form</h2>
              <div className="mb-3">
                <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-full px-3 py-1 capitalize">
                  {selected.requestType} Transport
                </span>
              </div>
              <dl className="space-y-3">
                {redacted && (
                  <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    Personal details were erased on{' '}
                    {new Date(selected.personalDataRedactedAt!).toLocaleDateString()} under
                    the data retention policy. The record of the transport itself is kept.
                  </p>
                )}
                <Row label="Patient name" value={selected.patient?.fullName} />
                <Row label="Contact" value={selected.patient?.contactNumber} />
                <Row label="Address" value={selected.patient?.address} />
                <Row label="Condition" value={selected.patient?.medicalCondition} />
                {selected.patient?.specialRequirements && <Row label="Special req." value={selected.patient.specialRequirements} />}
                {selected.accompanyingPerson && <Row label="Accompanying" value={`${selected.accompanyingPerson.fullName} · ${selected.accompanyingPerson.contactNumber}`} />}
                {selected.requestedDate && <Row label="Requested date" value={selected.requestedDate} />}
                {selected.requestedTime && <Row label="Requested time" value={selected.requestedTime} />}
              </dl>
            </div>

            {/*
              Leaflet paints its own panes at z-index 400 and up. The map card is not a
              stacking context, so those panes used to outrank the modal overlay (z-40)
              and the tiles floated on top of the Assign / Reject dialogs. `isolate`
              traps them inside this card, and the map is unmounted outright while a
              dialog is open -- nothing to float, and no hidden map holding tile
              requests open behind the overlay.
            */}
            {!dialogOpen && pickup && drop && (
            <div className="isolate bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900 text-sm">Route Map</h2>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1.5"><Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" /> Pickup: {selected.pickupLocation?.addressLabel}</span><br />
                  <span className="inline-flex items-center gap-1.5"><Circle className="h-2.5 w-2.5 fill-red-500 text-red-500" /> Drop-off: {selected.dropOffLocation?.addressLabel}</span>
                </p>
              </div>
              <div style={{ height: 240 }}>
                <MapContainer
                  center={[pickup[1], pickup[0]]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[pickup[1], pickup[0]]} icon={pickupIcon}>
                    <Popup>Pickup: {selected.pickupLocation?.addressLabel}</Popup>
                  </Marker>
                  <Marker position={[drop[1], drop[0]]} icon={dropIcon}>
                    <Popup>Drop-off: {selected.dropOffLocation?.addressLabel}</Popup>
                  </Marker>
                </MapContainer>
              </div>
            </div>
            )}
          </div>
        </div>

        <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Transport Request">
          <p className="text-slate-600 text-sm mb-4">Provide a reason for rejection. The applicant will be notified.</p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="Reason for rejection..."
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
          />
          <div className="flex gap-3 justify-end">
            <button onClick={() => setRejectModal(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-700">Cancel</button>
            <button
              onClick={() => rejectReason.trim() && rejectMutation.mutate({ id: selected._id, reason: rejectReason.trim() })}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject Request'}
            </button>
          </div>
        </Modal>

        <Modal open={assignModal} onClose={closeAssignModal} title="Assign Ambulance Unit" className="max-w-2xl">
          <div className="space-y-5">
            {assignmentError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{assignmentError}</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Select Available Ambulance Unit</label>
              {!availableUnits ? (
                <p className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading units...
                </p>
              ) : availableUnits.length === 0 ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">
                  No ambulance units available for this time range.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto">
                  {availableUnits.map((unit) => (
                    <button
                      type="button"
                      key={unit._id}
                      onClick={() => {
                        setSelectedUnit(unit._id);
                        setAssignmentError(null);
                      }}
                      className={`min-h-16 p-3 rounded-xl border text-left text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        selectedUnit === unit._id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                      }`}
                    >
                      <span className="block">Unit #{unit.unitNumber}</span>
                      <span className={`mt-1 block text-xs font-medium ${selectedUnit === unit._id ? 'text-blue-100' : 'text-slate-500'}`}>
                        {unit.availabilityStatus}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-slate-700">Select Active Responder</label>
                {inactiveResponderCount > 0 && (
                  <span className="text-xs font-semibold text-slate-500">
                    {inactiveResponderCount} inactive hidden
                  </span>
                )}
              </div>

              {!responders ? (
                <p className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading responders...
                </p>
              ) : activeResponders.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
                  No approved responders are currently on duty or available. Ask a responder to go on duty before assigning this request.
                </div>
              ) : (
                <div className="space-y-3">
                  <select
                    value={selectedResponder}
                    onChange={(e) => {
                      setSelectedResponder(e.target.value);
                      setAssignmentError(null);
                    }}
                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose active responder</option>
                    {activeResponders.map(({ responder, distanceKm }) => (
                      <option key={responder._id} value={responder._id}>
                        {formatResponderOption(responder, distanceKm)}
                      </option>
                    ))}
                  </select>

                  {selectedResponderDetails && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{selectedResponderDetails.responder.name}</p>
                          <p className="mt-1 text-xs font-semibold capitalize text-blue-700">
                            {formatDutyStatus(selectedResponderDetails.responder.dutyStatus)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
                          {selectedResponderDetails.responder.badgeId ?? 'No badge'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        <span>{selectedResponderDetails.responder.agencyType ?? selectedResponderDetails.responder.department ?? 'Responder'}</span>
                        <span>{selectedResponderDetails.responder.phone ?? 'No phone listed'}</span>
                        {selectedResponderDetails.distanceKm !== null && (
                          <span className="flex items-center gap-1 sm:col-span-2">
                            <MapPin className="h-3.5 w-3.5" />
                            {formatDistance(selectedResponderDetails.distanceKm)} from pickup
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={closeAssignModal} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-700">Cancel</button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!selectedUnit || !selectedResponderDetails || assignMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
              >
                {assignMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </Modal>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Ambulance Requests">
      <div className="flex gap-2 flex-wrap items-center mb-6">
        {(['pending_review', 'approved', 'assigned', 'completed', 'rejected', 'all'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors capitalize ${
              statusFilter === s ? 'bg-[#0F172A] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
        {(statusFilter === 'rejected' || statusFilter === 'all') && (
          <label className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            Show archived rejected (&gt; 31 days)
          </label>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {isLoading ? <TableSkeleton /> : requests.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No {statusFilter.replace('_', ' ')} requests</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-6 py-3 text-left">Type</th>
                  <th className="px-6 py-3 text-left">Patient</th>
                  <th className="px-6 py-3 text-left">Sender</th>
                  <th className="px-6 py-3 text-left">Pickup</th>
                  <th className="px-6 py-3 text-left">Scheduled</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Submitted</th>
                  <th className="px-6 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {requests.map((req) => (
                  <tr
                    key={req._id}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${req.isEmergencyPriority ? 'bg-red-50/40' : ''}`}
                    onClick={() => setSelected(req)}
                  >
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-0.5 capitalize ${
                        req.requestType === 'emergency' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {req.isEmergencyPriority && <AlertIcon small />}{req.requestType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-900 font-medium">{req.patient?.fullName ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-500">{req.senderSnapshot?.fullName ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs max-w-[140px] truncate">{req.pickupLocation?.addressLabel ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {req.requestedDate ? `${req.requestedDate.slice(0, 10)} ${req.requestedTime ?? ''}` : '—'}
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{fmt(req.createdAt)}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelected(req); }}
                        className="px-3 py-1.5 bg-[#0F172A] text-white rounded-lg text-xs font-semibold hover:bg-slate-700"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-4">
      <dt className="text-slate-400 text-xs w-28 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-slate-800 text-sm font-medium flex-1">{value}</dd>
    </div>
  );
}

function VerificationPhoto({ label, fileId }: { label: string; fileId?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <AuthedImage
        fileId={fileId}
        alt={`${label} preview`}
        emptyLabel="Not uploaded"
        className="h-36 w-full rounded-lg"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className={`text-[11px] font-bold ${fileId ? 'text-green-700' : 'text-slate-400'}`}>
          {fileId ? 'Available' : 'Missing'}
        </span>
      </div>
    </div>
  );
}

function AlertIcon({ small = false }: { small?: boolean }) {
  return (
    <AlertTriangle
      className={`${small ? 'mr-1 h-3.5 w-3.5' : 'h-5 w-5'} inline-flex flex-shrink-0`}
      aria-hidden="true"
    />
  );
}
