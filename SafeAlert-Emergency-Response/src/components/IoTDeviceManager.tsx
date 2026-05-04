import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Radio, 
  Battery, 
  Signal, 
  Bluetooth, 
  Power,
  RefreshCw,
  Settings,
  AlertCircle,
  CheckCircle,
  Zap
} from 'lucide-react';
import { ButtonPatternConfig } from './ButtonPatternConfig';
import { IoTSimulator } from './IoTSimulator';
import type { IoTDevice } from '../types';

interface Props {
  device: IoTDevice | null;
  onDeviceChange: (device: IoTDevice | null) => void;
  isOffline: boolean;
}

export function IoTDeviceManager({ device, onDeviceChange, isOffline }: Props) {
  const [isScanning, setIsScanning] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'pending'>('synced');
  const socketRef = useRef<Socket | null>(null);

  // Initialize Socket.io connection for real-time device updates
  useEffect(() => {
    if (device && device.isPaired) {
      // Connect to Socket.io server
      const API_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';
      if (!socketRef.current) {
        socketRef.current = io(API_URL, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
        });

        // Listen for device status updates
        socketRef.current.on('device:updated', (updatedDevice: IoTDevice) => {
          if (updatedDevice.id === device.id) {
            onDeviceChange(updatedDevice);
          }
        });
      }

      // Fallback: Simulate device connection status updates every 5 seconds if Socket.io fails
      const interval = setInterval(() => {
        onDeviceChange({
          ...device,
          isConnected: !isOffline && Math.random() > 0.1, // Simulate occasional disconnection
          batteryLevel: Math.max(0, device.batteryLevel - Math.random() * 0.5),
          signalStrength: Math.max(0, Math.min(100, device.signalStrength + (Math.random() - 0.5) * 10)),
          lastSync: device.isConnected ? Date.now() : device.lastSync,
        });
      }, 5000);

      return () => {
        clearInterval(interval);
      };
    }

    return () => {
      if (socketRef.current && !isOffline) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [device, isOffline, onDeviceChange]);

  const handleScanForDevices = () => {
    setIsScanning(true);
    
    // Simulate scanning
    setTimeout(() => {
      setIsScanning(false);
      // Show found device (simulated)
      if (!device) {
        const mockDevice: IoTDevice = {
          id: 'iot_panic_001',
          name: 'SafeAlert Panic Button',
          model: 'SAB-2024',
          batteryLevel: 85,
          signalStrength: 92,
          isConnected: true,
          isPaired: false,
          lastSync: Date.now(),
          firmware: 'v2.1.0',
        };
        // Ask to pair
        if (confirm(`Found device: ${mockDevice.name}\nWould you like to pair with this device?`)) {
          onDeviceChange({ ...mockDevice, isPaired: true });
        }
      }
    }, 2000);
  };

  const handleUnpairDevice = () => {
    if (confirm('Are you sure you want to unpair this device?')) {
      onDeviceChange(null);
      localStorage.removeItem('iot_device');
    }
  };

  const handleSyncNow = () => {
    setSyncStatus('syncing');
    setTimeout(() => {
      if (device) {
        onDeviceChange({
          ...device,
          lastSync: Date.now(),
        });
      }
      setSyncStatus('synced');
    }, 1500);
  };

  const getBatteryColor = (level: number) => {
    if (level > 50) return 'text-green-600';
    if (level > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSignalColor = (strength: number) => {
    if (strength > 70) return 'text-green-600';
    if (strength > 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2>IoT Panic Button</h2>
        {device && (
          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {showSimulator ? 'Hide' : 'Test'} Device
          </button>
        )}
      </div>

      {/* Simulator */}
      {showSimulator && device && (
        <div className="mb-4">
          <IoTSimulator device={device} />
        </div>
      )}

      {!device ? (
        /* No Device Paired */
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-4 text-center">
            <Radio className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h3 className="mb-2">No Device Paired</h3>
            <p className="text-gray-600 mb-4">
              Connect your IoT panic button keychain to enable instant emergency alerts
            </p>
            
            <button
              onClick={handleScanForDevices}
              disabled={isScanning}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center gap-2 mx-auto"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Scanning for devices...
                </>
              ) : (
                <>
                  <Bluetooth className="w-5 h-5" />
                  Scan for Devices
                </>
              )}
            </button>
          </div>

          {/* Device Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="mb-3">About IoT Panic Button</h3>
            <div className="space-y-2 text-gray-600">
              <p>• Compact keychain design</p>
              <p>• Bluetooth Low Energy (BLE) connection</p>
              <p>• Multiple button press patterns</p>
              <p>• 30-day battery life</p>
              <p>• Water resistant (IP67)</p>
              <p>• Offline data storage capability</p>
            </div>
          </div>
        </div>
      ) : (
        /* Device Connected */
        <div className="space-y-4">
          {/* Connection Status */}
          <div className={`border-2 rounded-lg p-4 ${
            device.isConnected 
              ? 'bg-green-50 border-green-200' 
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full ${
                  device.isConnected ? 'bg-green-100' : 'bg-orange-100'
                }`}>
                  <Radio className={`w-6 h-6 ${
                    device.isConnected ? 'text-green-600' : 'text-orange-600'
                  }`} />
                </div>
                <div>
                  <h3>{device.name}</h3>
                  <p className="text-gray-600">{device.model} • {device.firmware}</p>
                </div>
              </div>
              
              {device.isConnected ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-orange-600 animate-pulse" />
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className={device.isConnected ? 'text-green-700' : 'text-orange-700'}>
                {device.isConnected ? '● Connected' : '● Disconnected'}
              </span>
              <span className="text-gray-500">
                Last sync: {new Date(device.lastSync).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Device Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Battery className={`w-5 h-5 ${getBatteryColor(device.batteryLevel)}`} />
                <span className="text-gray-600">Battery</span>
              </div>
              <p className={getBatteryColor(device.batteryLevel)}>
                {device.batteryLevel.toFixed(0)}%
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Signal className={`w-5 h-5 ${getSignalColor(device.signalStrength)}`} />
                <span className="text-gray-600">Signal</span>
              </div>
              <p className={getSignalColor(device.signalStrength)}>
                {device.signalStrength.toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Sync Status */}
          {!device.isConnected && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-yellow-800 mb-2">
                    Device disconnected. Alerts will be queued and synced when connection is restored.
                  </p>
                  <button
                    onClick={handleSyncNow}
                    disabled={syncStatus === 'syncing'}
                    className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                    {syncStatus === 'syncing' ? 'Syncing...' : 'Retry Connection'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Button Patterns */}
          <ButtonPatternConfig />

          {/* Device Actions */}
          <div className="space-y-2">
            <button
              onClick={handleSyncNow}
              disabled={syncStatus === 'syncing' || !device.isConnected}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-5 h-5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
            </button>

            <button
              onClick={handleUnpairDevice}
              className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Power className="w-5 h-5" />
              Unpair Device
            </button>
          </div>

          {/* Technical Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="mb-3">Device Information</h3>
            <div className="space-y-2 text-gray-600">
              <div className="flex justify-between">
                <span>Device ID:</span>
                <span>{device.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Model:</span>
                <span>{device.model}</span>
              </div>
              <div className="flex justify-between">
                <span>Firmware:</span>
                <span>{device.firmware}</span>
              </div>
              <div className="flex justify-between">
                <span>Connection:</span>
                <span>Bluetooth LE</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
