import { MapPin, Clock, User, Navigation, CheckCircle, AlertCircle, Radio, Smartphone } from 'lucide-react';
import type { Alert } from '../types';

interface Props {
  alerts: Alert[];
  onUpdateStatus: (alertId: string, status: Alert['status']) => void;
}

export function AlertList({ alerts, onUpdateStatus }: Props) {
  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'medical': 'bg-red-100 text-red-700 border-red-200',
      'fire': 'bg-orange-100 text-orange-700 border-orange-200',
      'crime': 'bg-purple-100 text-purple-700 border-purple-200',
      'accident': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'natural-disaster': 'bg-blue-100 text-blue-700 border-blue-200',
      'other': 'bg-gray-100 text-gray-700 border-gray-200',
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

  const getStatusBadge = (status: Alert['status']) => {
    const badges = {
      active: {
        color: 'bg-red-100 text-red-700',
        icon: <AlertCircle className="w-4 h-4" />,
        label: 'Active',
      },
      acknowledged: {
        color: 'bg-blue-100 text-blue-700',
        icon: <Clock className="w-4 h-4" />,
        label: 'Acknowledged',
      },
      resolved: {
        color: 'bg-green-100 text-green-700',
        icon: <CheckCircle className="w-4 h-4" />,
        label: 'Resolved',
      },
    };
    return badges[status];
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">No alerts found</p>
        <p className="text-gray-400">Alerts will appear here when users send emergency requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {alerts.map(alert => {
        const statusBadge = getStatusBadge(alert.status);
        
        return (
          <div
            key={alert.id}
            className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
          >
            {/* Header */}
            <div className={`border-l-4 p-4 ${getCategoryColor(alert.category)}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="mb-1">{getCategoryLabel(alert.category)}</h3>
                  <div className="flex items-start gap-3 text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>{alert.userName}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(alert.timestamp)}</span>
                    </div>
                    {alert.triggeredBy && (
                      <div className="flex items-center gap-1">
                        {alert.triggeredBy === 'iot-device' ? (
                          <>
                            <Radio className="w-4 h-4 text-purple-600" />
                            <span className="text-purple-600">IoT</span>
                          </>
                        ) : (
                          <>
                            <Smartphone className="w-4 h-4 text-blue-600" />
                            <span className="text-blue-600">App</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${statusBadge.color}`}>
                  {statusBadge.icon}
                  <span>{statusBadge.label}</span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <MapPin className="w-4 h-4" />
                    <span>Location Coordinates</span>
                  </div>
                  <p className="text-gray-900">
                    {alert.location.latitude.toFixed(6)}, {alert.location.longitude.toFixed(6)}
                  </p>
                  <p className="text-gray-500">Accuracy: ±{alert.location.accuracy.toFixed(0)}m</p>
                </div>

                <div>
                  <p className="text-gray-600 mb-1">Contacts Notified</p>
                  <p className="text-gray-900">{alert.contacts.length} emergency contact(s)</p>
                </div>
              </div>

              {alert.message && (
                <div className="mb-4">
                  <p className="text-gray-600 mb-1">Additional Information</p>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-700">{alert.message}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onUpdateStatus(alert.id, 'acknowledged')}
                  disabled={alert.status === 'acknowledged' || alert.status === 'resolved'}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    alert.status === 'acknowledged'
                      ? 'bg-blue-100 text-blue-700 cursor-not-allowed'
                      : alert.status === 'resolved'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {alert.status === 'acknowledged' ? 'Acknowledged ✓' : 'Acknowledge'}
                </button>

                <button
                  onClick={() => onUpdateStatus(alert.id, 'resolved')}
                  disabled={alert.status === 'resolved'}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    alert.status === 'resolved'
                      ? 'bg-green-100 text-green-700 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {alert.status === 'resolved' ? 'Resolved ✓' : 'Mark as Resolved'}
                </button>

                <a
                  href={`https://www.google.com/maps?q=${alert.location.latitude},${alert.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  Navigate
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}