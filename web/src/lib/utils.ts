import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt(date: string | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-PH', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function fmtDate(date: string | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

export function truncate(str: string, len = 40): string {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

/**
 * Coarse "how long ago", for a last-seen column.
 *
 * Deliberately vague past an hour: the underlying timestamp only advances when the
 * owner's phone relays a check-in, so minute-level precision on a two-day-old
 * value would imply more certainty than the data carries.
 */
export function sinceLabel(seconds: number | undefined): string {
  if (seconds === undefined) return 'Never';
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export const SOURCE_LABELS: Record<string, string> = {
  mobile_app: 'Mobile App',
  iot_keychain: 'IoT Keychain',
  iot_device: 'Panic Button',
};

export function sourceLabel(source: string | undefined): string {
  return (source && SOURCE_LABELS[source]) ?? 'Mobile App';
}

export function isHardwareSource(source: string | undefined): boolean {
  return source === 'iot_device' || source === 'iot_keychain';
}

/**
 * A panic-button incident exists before its position does: the alert goes out on
 * the button press and the GNSS receiver may still be searching. Anything that
 * renders a location has to say so rather than print a blank or a 0,0 fix.
 */
export function locationLabel(emergency: {
  barangay?: string;
  currentLocation?: { coordinates: [number, number] };
  locationStatus?: string;
}): string {
  if (emergency.barangay) return emergency.barangay;
  const coords = emergency.currentLocation?.coordinates;
  if (!coords) return 'Waiting for GPS';
  return `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`;
}

export function hasCoordinates(emergency: {
  currentLocation?: { coordinates: [number, number] };
}): boolean {
  return Array.isArray(emergency.currentLocation?.coordinates);
}
