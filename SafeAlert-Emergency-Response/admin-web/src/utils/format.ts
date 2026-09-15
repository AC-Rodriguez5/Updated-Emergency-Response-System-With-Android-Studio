import type { Emergency, GeoLocation } from '@/types';
export const labels: Record<string, string> = { pending: 'Awaiting responder', assigned: 'Responder assigned', responder_on_the_way: 'On the way', responder_nearby: 'Responder nearby', responder_report_submitted: 'Report submitted', resolved: 'Resolved', cancelled: 'Cancelled', false_alarm: 'False alarm', medical: 'Medical', crime: 'Crime', fire: 'Fire', general_sos: 'General SOS', mobile_app: 'Mobile app', iot_ble: 'Panic button', approved: 'Approved', rejected: 'Rejected' };
export const label = (value: string) => labels[value] || value.replace(/_/g, ' ');
export const dateTime = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value)) : 'Not available';
export const duration = (seconds?: number | null) => seconds == null ? 'Not available' : seconds < 60 ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`;
export const activeEmergency = (emergency: Emergency) => !['resolved', 'cancelled', 'false_alarm'].includes(emergency.status);
export const validLocation = (value?: GeoLocation): value is GeoLocation => !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat >= -90 && value.lat <= 90 && value.lng >= -180 && value.lng <= 180;
export const staleLocation = (value?: GeoLocation) => !value?.capturedAt || Number.isNaN(Date.parse(value.capturedAt)) || Date.now() - Date.parse(value.capturedAt) > 60_000;
export const shortId = (id: string) => id.slice(-8).toUpperCase();
