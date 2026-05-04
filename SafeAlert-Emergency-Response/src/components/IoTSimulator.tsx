import { useState } from 'react';
import { 
  Heart, 
  Flame, 
  Shield, 
  Car, 
  CloudRain, 
  AlertTriangle,
  Radio,
  Zap
} from 'lucide-react';
import type { IoTDevice, EmergencyCategory } from '../types';

interface Props {
  device: IoTDevice;
}

export function IoTSimulator({ device }: Props) {
  const [isPressed, setIsPressed] = useState(false);
  const [lastPressed, setLastPressed] = useState<string>('');

  const emergencyTypes = [
    { id: 'medical' as EmergencyCategory, label: 'Medical', icon: Heart, color: 'bg-red-500', pattern: 'Single press' },
    { id: 'fire' as EmergencyCategory, label: 'Fire', icon: Flame, color: 'bg-orange-500', pattern: 'Double press' },
    { id: 'crime' as EmergencyCategory, label: 'Crime', icon: Shield, color: 'bg-purple-500', pattern: 'Long press' },
    { id: 'accident' as EmergencyCategory, label: 'Accident', icon: Car, color: 'bg-yellow-500', pattern: 'Triple press' },
    { id: 'natural-disaster' as EmergencyCategory, label: 'Disaster', icon: CloudRain, color: 'bg-blue-500', pattern: 'Double long' },
    { id: 'other' as EmergencyCategory, label: 'Other', icon: AlertTriangle, color: 'bg-gray-500', pattern: 'SOS' },
  ];

  const handleButtonPress = (category: EmergencyCategory, pattern: string) => {
    if (!device.isConnected) {
      alert('Device is disconnected. Please reconnect to test button press.');
      return;
    }

    setIsPressed(true);
    setLastPressed(`${pattern} detected`);

    // Trigger custom event that the app will listen to
    const event = new CustomEvent('iot-button-press', {
      detail: { category }
    });
    window.dispatchEvent(event);

    setTimeout(() => {
      setIsPressed(false);
    }, 500);
  };

  return (
    <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-5 h-5 text-purple-600" />
        <h3 className="text-purple-900">IoT Device Simulator</h3>
      </div>

      <p className="text-purple-800 mb-4">
        Test button press patterns to simulate emergency alerts from your IoT panic button device.
      </p>

      {/* Device Visual */}
      <div className="bg-white rounded-lg p-4 mb-4 text-center">
        <div className="relative inline-block">
          <div className={`w-24 h-24 rounded-full ${
            isPressed ? 'bg-red-500 scale-95' : 'bg-gray-200'
          } transition-all duration-200 flex items-center justify-center shadow-lg`}>
            <Radio className={`w-12 h-12 ${isPressed ? 'text-white' : 'text-gray-400'}`} />
          </div>
          {device.isConnected && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
          )}
        </div>
        <p className="text-gray-600 mt-3">{device.name}</p>
        {lastPressed && (
          <p className="text-purple-600 mt-1 animate-pulse">{lastPressed}</p>
        )}
      </div>

      {/* Button Pattern Options */}
      <div className="space-y-2">
        <p className="text-gray-700 mb-2">Simulate Button Press:</p>
        {emergencyTypes.map(type => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => handleButtonPress(type.id, type.pattern)}
              disabled={!device.isConnected}
              className={`w-full ${type.color} text-white p-3 rounded-lg hover:opacity-90 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-between group`}
            >
              <div className="flex items-center gap-2">
                <Icon className="w-5 h-5" />
                <span>{type.label}</span>
              </div>
              <span className="text-sm opacity-75 group-hover:opacity-100">
                {type.pattern}
              </span>
            </button>
          );
        })}
      </div>

      {!device.isConnected && (
        <div className="mt-3 bg-orange-100 border border-orange-300 rounded-lg p-3">
          <p className="text-orange-800 text-sm">
            ⚠️ Device disconnected. Reconnect to test button patterns.
          </p>
        </div>
      )}

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-blue-800 text-sm">
          💡 In real device: Press the physical button using different patterns. 
          The microcontroller detects the pattern and sends the corresponding emergency category via BLE.
        </p>
      </div>
    </div>
  );
}
