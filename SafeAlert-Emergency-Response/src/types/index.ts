export type EmergencyCategory = 
  | 'medical'
  | 'fire'
  | 'crime'
  | 'accident'
  | 'natural-disaster'
  | 'other';

export interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface Alert {
  id: string;
  userId: string;
  userName: string;
  category: EmergencyCategory;
  location: Location;
  timestamp: number;
  message?: string;
  status: 'active' | 'acknowledged' | 'resolved';
  contacts: string[];
  triggeredBy?: 'app' | 'iot-device';
  deviceId?: string;
}

export interface IoTDevice {
  id: string;
  name: string;
  model: string;
  batteryLevel: number;
  signalStrength: number;
  isConnected: boolean;
  isPaired: boolean;
  lastSync: number;
  firmware: string;
}

export interface ButtonPattern {
  category: EmergencyCategory;
  pattern: 'single' | 'double' | 'triple' | 'long-press' | 'sos';
  description: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'alert' | 'location' | 'status-update';
  data: any;
  timestamp: number;
  synced: boolean;
}
