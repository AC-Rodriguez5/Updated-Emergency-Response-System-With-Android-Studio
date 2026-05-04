import { Clock, MapPin, CheckCircle, AlertCircle, Radio, Smartphone } from 'lucide-react';
import type { Alert } from '../types';

interface Props {
  alerts: Alert[];
}

export function AlertHistory({ alerts }: Props) {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'medical': 'bg-red-100 text-red-700',
      'fire': 'bg-orange-100 text-orange-700',
      'crime': 'bg-purple-100 text-purple-700',
      'accident': 'bg-yellow-100 text-yellow-700',
      'natural-disaster': 'bg-blue-100 text-blue-700',
      'other': 'bg-gray-100 text-gray-700',
    };
    return colors[category] || colors.other;
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'medical': 'Medical Emergency',
      'fire': 'Fire',
      'crime': 'Crime/Threat',
      'accident': 'Accident',
      'natural-disaster': 'Natural Disaster',
      'other': 'Other Emergency',
    };
    return labels[category] || category;
  };

  const getStatusIcon = (status: string) => {
    if (status === 'resolved') return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (status === 'acknowledged') return <Clock className="w-5 h-5 text-blue-600" />;
    return <AlertCircle className="w-5 h-5 text-red-600 animate-pulse" />;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-4">
      <h2 className="mb-4">Alert History</h2>

      {alerts.length === 0 ? (
        <div className="text-center py-12">
          <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No alerts sent yet</p>
          <p className="text-gray-400">Your emergency alert history will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full ${getCategoryColor(alert.category)}`}>
                    {getCategoryLabel(alert.category)}
                  </span>
                  {alert.triggeredBy && (
                    <span className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                      alert.triggeredBy === 'iot-device' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {alert.triggeredBy === 'iot-device' ? (
                        <>
                          <Radio className="w-3 h-3" />
                          IoT Device
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-3 h-3" />
                          Mobile App
                        </>
                      )}
                    </span>
                  )}
                </div>
                {getStatusIcon(alert.status)}
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2 text-gray-600">
                  <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{formatDate(alert.timestamp)}</span>
                </div>

                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {alert.location.latitude.toFixed(6)}, {alert.location.longitude.toFixed(6)}
                  </span>
                </div>

                {alert.message && (
                  <div className="bg-gray-50 rounded p-3 mt-2">
                    <p className="text-gray-700">{alert.message}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-200">
                  <p className="text-gray-500">
                    Status: <span className="capitalize">{alert.status}</span>
                  </p>
                  <p className="text-gray-500">
                    Contacts notified: {alert.contacts.length}
                  </p>
                  {alert.deviceId && (
                    <p className="text-gray-500">
                      Device ID: {alert.deviceId}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 mt-4">
          <p className="text-gray-600">
            Total alerts sent: {alerts.length}
          </p>
          <p className="text-gray-600">
            Active: {alerts.filter(a => a.status === 'active').length}
          </p>
          <p className="text-gray-600">
            From IoT Device: {alerts.filter(a => a.triggeredBy === 'iot-device').length}
          </p>
          <p className="text-gray-600">
            From Mobile App: {alerts.filter(a => a.triggeredBy === 'app' || !a.triggeredBy).length}
          </p>
        </div>
      )}
    </div>
  );
}