import { useState, useEffect } from 'react';
import { EmergencyCategories } from './EmergencyCategories';
import { ContactList } from './ContactList';
import { AlertHistory } from './AlertHistory';
import { GPSTracker } from './GPSTracker';
import { IoTDeviceManager } from './IoTDeviceManager';
import { MapPin, Users, Clock, Settings, Radio } from 'lucide-react';
import type { Contact, Alert, Location, EmergencyCategory, IoTDevice } from '../types';

interface Props {
  onLogout?: () => void;
}

export function UserDashboard({ onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<'home' | 'iot' | 'contacts' | 'history' | 'settings'>('home');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [iotDevice, setIoTDevice] = useState<IoTDevice | null>(null);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedContacts = localStorage.getItem('emergency_contacts');
    const savedAlerts = localStorage.getItem('alert_history');
    
    if (savedContacts) {
      setContacts(JSON.parse(savedContacts));
    }
    if (savedAlerts) {
      setAlerts(JSON.parse(savedAlerts));
    }

    // Check online status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save contacts to localStorage
  useEffect(() => {
    localStorage.setItem('emergency_contacts', JSON.stringify(contacts));
  }, [contacts]);

  // Save alerts to localStorage
  useEffect(() => {
    localStorage.setItem('alert_history', JSON.stringify(alerts));
  }, [alerts]);

  // Load IoT device data
  useEffect(() => {
    const savedDevice = localStorage.getItem('iot_device');
    if (savedDevice) {
      setIoTDevice(JSON.parse(savedDevice));
    }
  }, []);

  // Save IoT device to localStorage
  useEffect(() => {
    if (iotDevice) {
      localStorage.setItem('iot_device', JSON.stringify(iotDevice));
    }
  }, [iotDevice]);

  // Simulate IoT button press
  useEffect(() => {
    const handleIoTButtonPress = (event: CustomEvent) => {
      const { category } = event.detail;
      handleEmergencyAlert(category, 'Alert triggered by IoT panic button', 'iot-device');
    };

    window.addEventListener('iot-button-press' as any, handleIoTButtonPress);
    return () => {
      window.removeEventListener('iot-button-press' as any, handleIoTButtonPress);
    };
  }, [currentLocation, contacts]);

  const handleEmergencyAlert = (category: EmergencyCategory, message?: string, triggeredBy: 'app' | 'iot-device' = 'app') => {
    if (!currentLocation) {
      alert('Unable to get current location. Please enable GPS.');
      return;
    }

    const newAlert: Alert = {
      id: `alert_${Date.now()}`,
      userId: 'user_123',
      userName: 'Current User',
      category,
      location: currentLocation,
      timestamp: Date.now(),
      message,
      status: 'active',
      contacts: contacts.filter(c => c.isPrimary).map(c => c.id),
      triggeredBy,
      deviceId: triggeredBy === 'iot-device' ? iotDevice?.id : undefined,
    };

    setAlerts(prev => [newAlert, ...prev]);
    
    // Store in offline cache
    const offlineQueue = JSON.parse(localStorage.getItem('offline_alerts') || '[]');
    offlineQueue.push(newAlert);
    localStorage.setItem('offline_alerts', JSON.stringify(offlineQueue));

    // Show confirmation
    const triggerSource = triggeredBy === 'iot-device' ? 'IoT Panic Button' : 'Mobile App';
    alert(`Emergency alert sent!\nTriggered by: ${triggerSource}\nCategory: ${category}\nLocation: ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}\nContacts notified: ${contacts.filter(c => c.isPrimary).length}`);
  };

  const tabs = [
    { id: 'home', label: 'Emergency', icon: MapPin },
    { id: 'iot', label: 'IoT Device', icon: Radio },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col">
      {/* Offline Indicator */}
      {isOffline && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center">
          Offline Mode - Alerts will be sent when connection is restored
        </div>
      )}

      {/* IoT Device Connection Indicator */}
      {iotDevice && (
        <div className={`px-4 py-2 text-center text-white ${
          iotDevice.isConnected ? 'bg-green-600' : 'bg-orange-600'
        }`}>
          {iotDevice.isConnected 
            ? `✓ ${iotDevice.name} Connected` 
            : `⚠ ${iotDevice.name} Disconnected - Using offline mode`
          }
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'home' && (
          <div className="p-4">
            <GPSTracker onLocationUpdate={setCurrentLocation} />
            <EmergencyCategories 
              onEmergencySelect={handleEmergencyAlert}
              hasContacts={contacts.length > 0}
            />
          </div>
        )}

        {activeTab === 'iot' && (
          <IoTDeviceManager 
            device={iotDevice}
            onDeviceChange={setIoTDevice}
            isOffline={isOffline}
          />
        )}
        
        {activeTab === 'contacts' && (
          <ContactList 
            contacts={contacts}
            onContactsChange={setContacts}
          />
        )}
        
        {activeTab === 'history' && (
          <AlertHistory alerts={alerts} />
        )}
        
        {activeTab === 'settings' && (
            <div className="p-4">
            <h2 className="mb-4">Settings</h2>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="mb-2">About</h3>
                <p className="text-gray-600">SafeAlert Emergency System</p>
                <p className="text-gray-600">Version 1.0.0</p>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="mb-2">Storage</h3>
                <p className="text-gray-600">Contacts: {contacts.length}</p>
                <p className="text-gray-600">Alert History: {alerts.length}</p>
                <p className="text-gray-600">IoT Device: {iotDevice ? 'Paired' : 'Not Paired'}</p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="mb-2">Data Sync</h3>
                <p className="text-gray-600">
                  {isOffline ? 'Offline - Using local storage' : 'Online - Data synced'}
                </p>
                {iotDevice && (
                  <p className="text-gray-600 mt-1">
                    IoT Device: {iotDevice.isConnected ? 'Connected' : 'Disconnected'}
                  </p>
                )}
              </div>
            </div>
              <div className="mt-4">
                <button onClick={onLogout} className="w-full bg-red-600 text-white py-2 rounded">Logout</button>
              </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 max-w-md mx-auto">
        <div className="grid grid-cols-5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isIoTTab = tab.id === 'iot';
            const hasConnection = iotDevice?.isConnected;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center justify-center py-3 transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-red-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-xs">{tab.label}</span>
                {isIoTTab && hasConnection && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full"></div>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}