import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  X,
  AlertTriangle,
  Wifi,
  ShieldCheck,
  RadioTower,
  Fingerprint,
  Satellite,
} from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import {
  TypeBadge,
  PriorityBadge,
  StatusBadge,
  LocationStatusBadge,
} from '@/components/ui/Badge';
import { AuthedImage } from '@/components/ui/AuthedImage';
import { api } from '@/services/apiClient';
import { onSocketEvents } from '@/services/socketClient';
import { useNotifications } from '@/features/notifications/NotificationProvider';
import { fmt, hasCoordinates, locationLabel, sourceLabel } from '@/lib/utils';
import { TANZA_CENTER, TANZA_ZOOM } from '@/styles/tokens';
import type { Emergency, Paginated, ResponderLiveLocation } from '@/types';

function makeIcon(color: string, badge?: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
    <path fill="${color}" stroke="white" stroke-width="2" d="M16 2C9.4 2 4 7.4 4 14c0 9 12 26 12 26s12-17 12-26C28 7.4 22.6 2 16 2z"/>
    ${badge ? `<text x="16" y="18" text-anchor="middle" fill="white" font-size="9" font-weight="bold">${badge}</text>` : `<circle cx="16" cy="14" r="5" fill="white"/>`}
  </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42],
    className: '',
  });
}

const ICONS: Record<string, L.DivIcon> = {
  medical: makeIcon('#DC2626'),
  crime: makeIcon('#7C3AED'),
  fire: makeIcon('#EA580C'),
  general_sos: makeIcon('#0F172A'),
  iot: makeIcon('#DC2626', 'IoT'),
  device: makeIcon('#B91C1C', 'SOS'),
};

function emergencyIcon(emergency: Emergency): L.DivIcon {
  if (emergency.source === 'iot_device') return ICONS.device!;
  if (emergency.source === 'iot_keychain') return ICONS.iot!;
  return ICONS[emergency.type] ?? ICONS.general_sos!;
}

const LIVE_RESPONDER_STATUSES = new Set(['on_duty', 'available', 'busy', 'responding']);

function responderIcon(status?: string) {
  const color =
    status === 'busy' || status === 'responding'
      ? '#F59E0B'
      : status === 'available'
        ? '#16A34A'
        : '#2563EB';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="12" fill="${color}" stroke="white" stroke-width="3"/>
    <path d="M15 7v8l5 3" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
    className: '',
  });
}

function FitBounds({ emergencies }: { emergencies: Emergency[] }) {
  const map = useMap();
  useEffect(() => {
    const points = emergencies
      .filter(hasCoordinates)
      .map(
        (em) =>
          [em.currentLocation!.coordinates[1], em.currentLocation!.coordinates[0]] as [
            number,
            number,
          ],
      );
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
  }, [emergencies, map]);
  return <></>;
}

function FocusEmergency({ emergency }: { emergency: Emergency | null }) {
  const map = useMap();
  useEffect(() => {
    if (!emergency || !hasCoordinates(emergency)) return;
    map.setView(
      [emergency.currentLocation!.coordinates[1], emergency.currentLocation!.coordinates[0]],
      15,
    );
  }, [emergency, map]);
  return <></>;
}

export default function MapPage() {
  const [searchParams] = useSearchParams();
  const { stopEmergencyAlert } = useNotifications();
  const [selected, setSelected] = useState<Emergency | null>(null);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [responders, setResponders] = useState<ResponderLiveLocation[]>([]);
  const focusedEmergencyId = searchParams.get('emergencyId');

  const { data } = useQuery({
    queryKey: ['map-emergencies'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Paginated<Emergency> }>('/emergencies/active?limit=100');
      return data.data.items;
    },
    // Every incident change arrives on the socket and is applied above. This is
    // the backstop for a socket that is down, not the way the map keeps up.
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (data) setEmergencies(data);
  }, [data]);

  const { data: responderData } = useQuery({
    queryKey: ['map-responders-live'],
    queryFn: async () => {
      const { data } = await api.get<{ data: ResponderLiveLocation[] }>('/responders/locations/live');
      return data.data;
    },
    // Was three seconds — a poll that fast is what you need when you do not
    // trust the stream. Positions now arrive as they are ingested.
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (responderData) setResponders(responderData);
  }, [responderData]);

  useEffect(() => {
    stopEmergencyAlert();
  }, [stopEmergencyAlert]);

  useEffect(() => {
    if (!focusedEmergencyId) return;
    const match = emergencies.find((em) => em._id === focusedEmergencyId);
    if (!match) return;
    setSelected(match);
    stopEmergencyAlert(match._id);
  }, [emergencies, focusedEmergencyId, stopEmergencyAlert]);

  useEffect(() => {
    const upsert = async (payload: { emergencyId: string }) => {
      try {
        const { data } = await api.get<{ data: Emergency }>(`/emergencies/${payload.emergencyId}`);
        setEmergencies((prev) => {
          const idx = prev.findIndex((e) => e._id === data.data._id);
          if (idx >= 0) { const next = [...prev]; next[idx] = data.data; return next; }
          return [data.data, ...prev];
        });
        // The open detail panel holds its own copy, so a streamed GPS fix has to be
        // pushed into it too or the dispatcher keeps reading a stale position.
        setSelected((s) => (s?._id === data.data._id ? data.data : s));
      } catch {}
    };

    const remove = (payload: { emergencyId: string }) => {
      setEmergencies((prev) => prev.filter((e) => e._id !== payload.emergencyId));
      setSelected((s) => s?._id === payload.emergencyId ? null : s);
    };

    // Subscribed through the client's own registry rather than off a socket
    // handle. `getSocket()` is null until the session is restored, and this
    // effect used to return on that — leaving the map polling for the rest of
    // the session, with a panic-button pin appearing up to twenty seconds late.
    const offUpserts = onSocketEvents<{ emergencyId: string }>(
      [
        'emergency.created',
        'emergency.iot_keychain_created',
        'emergency.iot_device_created',
        'emergency.location_updated',
        'emergency.updated',
        'emergency.assigned',
      ],
      (payload) => void upsert(payload),
    );
    const offResolved = onSocketEvents<{ emergencyId: string }>(
      ['emergency.resolved'],
      remove,
    );

    return () => {
      offUpserts();
      offResolved();
    };
  }, []);

  useEffect(() => {
    const upsertResponder = (payload: {
      responderId: string;
      name?: string;
      agencyType?: string;
      dutyStatus?: string;
      coordinates?: [number, number];
      accuracyMeters?: number;
      capturedAt?: string;
      currentLocation?: { latitude: number; longitude: number };
      isVisibleOnMap?: boolean;
    }) => {
      const status = payload.dutyStatus;
      const isVisible = payload.isVisibleOnMap ?? (!status || LIVE_RESPONDER_STATUSES.has(status));
      if (!isVisible) {
        setResponders((prev) => prev.filter((r) => r.responderId !== payload.responderId));
        return;
      }
      const currentLocation =
        payload.currentLocation ??
        (payload.coordinates
          ? { latitude: payload.coordinates[1], longitude: payload.coordinates[0] }
          : undefined);
      if (!currentLocation) return;
      setResponders((prev) => {
        const existing = prev.find((r) => r.responderId === payload.responderId);
        const next: ResponderLiveLocation = {
          responderId: payload.responderId,
          name: payload.name ?? existing?.name ?? 'Responder',
          agencyType: payload.agencyType ?? existing?.agencyType,
          dutyStatus: status ?? existing?.dutyStatus ?? 'on_duty',
          currentLocation,
          lastSeen: payload.capturedAt ?? existing?.lastSeen,
        };
        const idx = prev.findIndex((r) => r.responderId === payload.responderId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = next;
          return copy;
        }
        return [next, ...prev];
      });
    };

    return onSocketEvents<Parameters<typeof upsertResponder>[0]>(
      ['location.responder_updated', 'responder.status_updated'],
      upsertResponder,
    );
  }, []);

  // Incidents the map cannot plot yet. Without this strip a fingerprint-authorized
  // panic-button alert would be invisible here for as long as its receiver needs.
  const locating = emergencies.filter((em) => !hasCoordinates(em));

  return (
    <AdminShell title="Map Center">
      <div className="flex gap-4 -mt-2">
        <div className="flex flex-1 flex-col gap-3 min-w-0" style={{ height: 'calc(100vh - 160px)' }}>
        {locating.length > 0 && (
          <div className="flex-shrink-0 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800">
              <Satellite className="h-3.5 w-3.5" />
              Locating ({locating.length}) — alert received, no position yet
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {locating.map((em) => (
                <button
                  key={em._id}
                  onClick={() => {
                    setSelected(em);
                    stopEmergencyAlert(em._id);
                  }}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-left text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  {em.userSnapshot?.fullName ?? 'Unknown sender'}
                  <span className="ml-2 font-normal text-amber-700">{fmt(em.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <MapContainer
            center={TANZA_CENTER}
            zoom={TANZA_ZOOM}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {/* A panic-button incident has no marker until its first GNSS fix lands.
              Those appear in the "Locating" strip below the map instead, so they are
              never silently dropped off the dispatcher's screen. */}
          {emergencies.filter(hasCoordinates).map((em) => (
            <Marker
              key={em._id}
              position={[em.currentLocation!.coordinates[1], em.currentLocation!.coordinates[0]]}
              icon={emergencyIcon(em)}
              eventHandlers={{
                click: () => {
                  setSelected(em);
                  stopEmergencyAlert(em._id);
                },
              }}
            >
              <Popup>
                <div className="text-xs font-bold">{em.type.replace('_', ' ').toUpperCase()}</div>
                <div className="text-xs text-gray-500">{em.barangay ?? 'Tanza'}</div>
                {em.source === 'iot_device' && (
                  <div className="text-xs font-semibold text-red-600">
                    Panic button · rev {em.locationRevision}
                  </div>
                )}
              </Popup>
            </Marker>
          ))}
          {responders
            .filter((r) => r.currentLocation)
            .map((responder) => (
              <Marker
                key={`responder-${responder.responderId}`}
                position={[
                  responder.currentLocation!.latitude,
                  responder.currentLocation!.longitude,
                ]}
                icon={responderIcon(responder.dutyStatus)}
              >
                <Popup>
                  <div className="text-xs font-bold">{responder.name}</div>
                  <div className="text-xs text-gray-500">
                    {(responder.agencyType ?? 'Responder').toUpperCase()} · {responder.dutyStatus ?? 'on duty'}
                  </div>
                </Popup>
              </Marker>
            ))}
          <FitBounds emergencies={emergencies} />
          <FocusEmergency emergency={selected} />
          </MapContainer>
        </div>
        </div>

        {selected && (
          <div className="w-80 bg-white rounded-2xl border border-slate-200 overflow-y-auto flex-shrink-0" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between">
              <div>
                <TypeBadge type={selected.type} source={selected.source} />
                {selected.priority === 'critical' && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-red-600 text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" /> CRITICAL
                  </div>
                )}
                <div className="mt-1.5">
                  <LocationStatusBadge
                    locationStatus={selected.locationStatus}
                    trackingActive={selected.trackingActive}
                  />
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 text-sm">
              <StatusBadge status={selected.status} />

              {selected.outsideScopeFlag && (
                <div className="flex gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-xl p-3 font-semibold">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Outside Tanza Municipality. Admin decision required.</span>
                </div>
              )}

              {selected.userSnapshot && (
                <div className="space-y-3 bg-slate-50 rounded-xl p-4">
                  <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Sender Details</h3>
                  <div className="space-y-2.5">
                    <Detail label="Name" value={selected.userSnapshot.fullName} />
                    <Detail label="Age" value={selected.userSnapshot.age?.toString()} />
                    <Detail
                      label="Date of birth"
                      value={
                        selected.userSnapshot.dateOfBirth
                          ? new Date(selected.userSnapshot.dateOfBirth).toLocaleDateString()
                          : undefined
                      }
                    />
                    <Detail label="Blood type" value={selected.userSnapshot.bloodType} />
                    <Detail
                      label="Address"
                      value={[
                        selected.userSnapshot.streetAddress,
                        selected.userSnapshot.barangay,
                        selected.userSnapshot.municipality,
                      ].filter(Boolean).join(', ') || undefined}
                    />
                    <Detail label="Contact number" value={selected.userSnapshot.phone} />
                    <Detail label="Emergency contact" value={selected.userSnapshot.emergencyContactName} />
                    <Detail label="Emergency number" value={selected.userSnapshot.emergencyContactNumber} />
                  </div>
                </div>
              )}

              <div className="space-y-3 bg-slate-50 rounded-xl p-4">
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Sender Verification
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <VerificationPhoto
                    label="Profile / Face Photo"
                    fileId={selected.userSnapshot?.faceCaptureFileId}
                  />
                  <VerificationPhoto
                    label="Valid ID"
                    fileId={selected.userSnapshot?.proofOfResidencyFileId}
                  />
                </div>
                <p className="text-[11px] leading-4 text-slate-500">
                  Verification images are loaded through the protected admin file endpoint.
                </p>
              </div>

              <div className="space-y-2.5 bg-slate-50 rounded-xl p-4">
                <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Current Location</h3>
                <Detail label="Barangay" value={selected.barangay} />
                {selected.currentLocation ? (
                  <>
                    <Detail
                      label="Coordinates"
                      value={`${selected.currentLocation.coordinates[1].toFixed(5)}, ${selected.currentLocation.coordinates[0].toFixed(5)}`}
                    />
                    {selected.currentLocation.accuracyMeters !== undefined && (
                      <Detail label="Accuracy" value={`±${selected.currentLocation.accuracyMeters.toFixed(0)}m`} />
                    )}
                    <Detail label="Fix captured" value={fmt(selected.currentLocation.capturedAt)} />
                    <Detail label="Updates received" value={`${selected.locationRevision}`} />
                  </>
                ) : (
                  <p className="rounded-lg bg-amber-100 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-800">
                    Waiting for GPS. The alert and the sender's registered details are
                    confirmed; the device is still searching for a satellite fix and will
                    fill this in as soon as it has one.
                  </p>
                )}
              </div>

              {selected.source === 'iot_keychain' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2.5">
                  <h3 className="font-bold text-blue-700 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" /> IoT Keychain
                  </h3>
                  <Detail label="Device ID" value={selected.sourceDeviceId} />
                  <Detail label="Event ID" value={selected.bleEventId} />
                  {selected.deviceBatteryAtTrigger !== undefined && (
                    <Detail label="Battery at trigger" value={`${selected.deviceBatteryAtTrigger}%`} />
                  )}
                </div>
              )}

              {selected.source === 'iot_device' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2.5">
                  <h3 className="font-bold text-red-700 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Fingerprint className="w-3.5 h-3.5" /> Hardware Panic Button
                  </h3>
                  <Detail label="Device ID" value={selected.sourceDeviceId} />
                  <Detail label="Event ID" value={selected.hardwareEventId ?? selected.bleEventId} />
                  <Detail
                    label="Authorized by"
                    value={
                      selected.hardwareAuthMethod === 'fingerprint'
                        ? 'Enrolled fingerprint + button press'
                        : undefined
                    }
                  />
                  <Detail
                    label="Delivered over"
                    value={selected.deliveryTransports
                      ?.map((t) => (t === 'lte' ? 'Cellular' : 'Phone (BLE)'))
                      .join(' + ')}
                  />
                  <Detail
                    label="GPS tracking"
                    value={selected.trackingActive ? 'Streaming until resolved' : 'Stopped'}
                  />
                  <Detail label="Last fix at" value={fmt(selected.lastLocationAt)} />
                  {selected.gnssSatellites !== undefined && (
                    <Detail label="Satellites" value={`${selected.gnssSatellites}`} />
                  )}
                  {selected.gnssHdop !== undefined && (
                    <Detail label="HDOP" value={selected.gnssHdop.toFixed(1)} />
                  )}
                  {selected.deviceBatteryAtTrigger !== undefined && (
                    <Detail label="Battery at trigger" value={`${selected.deviceBatteryAtTrigger}%`} />
                  )}
                </div>
              )}

              {selected.notes && <Detail label="Notes" value={selected.notes} />}
              <Detail label="Reported at" value={fmt(selected.createdAt)} />
            </div>
          </div>
        )}

        {!selected && (
          <div className="w-72 bg-white rounded-2xl border border-slate-200 overflow-y-auto flex-shrink-0" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-sm">Active Incidents ({emergencies.length})</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <RadioTower className="h-3.5 w-3.5 text-blue-600" />
                {responders.length} live responders
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {emergencies.length === 0 ? (
                <p className="p-6 text-center text-slate-400 text-sm">No active incidents</p>
              ) : emergencies.map((em) => (
                <button
                  key={em._id}
                  onClick={() => {
                    setSelected(em);
                    stopEmergencyAlert(em._id);
                  }}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <TypeBadge type={em.type} source={em.source} />
                  <p className="text-xs text-slate-500 mt-1.5">{locationLabel(em)} · {fmt(em.createdAt)}</p>
                  <p className="text-[11px] text-slate-400">{sourceLabel(em.source)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Detail({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-slate-400 text-xs w-28 flex-shrink-0">{label}</span>
      <span className="text-slate-800 text-xs font-medium flex-1 break-words">{value}</span>
    </div>
  );
}

function VerificationPhoto({ label, fileId }: { label: string; fileId?: string }) {
  return (
    <div className="space-y-2">
      <AuthedImage
        fileId={fileId}
        alt={`${label} preview`}
        emptyLabel="Not uploaded"
        className="h-28 w-full rounded-lg"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-600">{label}</span>
        <span className={`text-[10px] font-bold ${fileId ? 'text-green-700' : 'text-slate-400'}`}>
          {fileId ? 'Available' : 'Missing'}
        </span>
      </div>
    </div>
  );
}
