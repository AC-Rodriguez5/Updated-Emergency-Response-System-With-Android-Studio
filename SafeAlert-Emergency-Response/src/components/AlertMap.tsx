import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Clock, User, MessageSquare, Radio, Smartphone, Maximize2, Minimize2 } from 'lucide-react';
import { OpenStreetMapView } from './OpenStreetMapView';
import type { Alert } from '../types';

interface Props {
  alerts: Alert[];
  onUpdateStatus: (alertId: string, status: Alert['status']) => void;
}

export function AlertMap({ alerts, onUpdateStatus }: Props) {
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  // Filter out resolved alerts from the map
  const activeAlerts = alerts.filter(alert => alert.status !== 'resolved');

  const handleSelectAlert = (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      setSelectedAlert(alert);
    }
  };

  // Update status and clear selected alert if it's being resolved
  const handleUpdateStatus = (alertId: string, status: Alert['status']) => {
    onUpdateStatus(alertId, status);
    if (status === 'resolved' && selectedAlert?.id === alertId) {
      setSelectedAlert(null);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'medical': 'bg-red-500',
      'fire': 'bg-orange-500',
      'crime': 'bg-purple-500',
      'accident': 'bg-yellow-500',
      'natural-disaster': 'bg-blue-500',
      'other': 'bg-gray-500',
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

  // Calculate map center from active alerts only
  const bounds = activeAlerts.reduce(
    (acc, alert) => ({
      minLat: Math.min(acc.minLat, alert.location.latitude),
      maxLat: Math.max(acc.maxLat, alert.location.latitude),
      minLng: Math.min(acc.minLng, alert.location.longitude),
      maxLng: Math.max(acc.maxLng, alert.location.longitude),
    }),
    {
      minLat: activeAlerts[0]?.location.latitude ?? 14.5995,
      maxLat: activeAlerts[0]?.location.latitude ?? 14.5995,
      minLng: activeAlerts[0]?.location.longitude ?? 120.9842,
      maxLng: activeAlerts[0]?.location.longitude ?? 120.9842,
    }
  );

  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;

  const fullScreenMap = isMaximized && (
    <div className="fixed inset-0 z-50 bg-black">
      <div className="w-full h-full relative">
        {/* Maximize/Minimize Button */}
        <button
          onClick={() => setIsMaximized(false)}
          className="absolute top-4 right-4 z-[1001] bg-white hover:bg-gray-100 text-gray-700 p-2 rounded-lg shadow-lg transition-colors"
          title="Exit Full Screen"
        >
          <Minimize2 className="w-5 h-5" />
        </button>

        <OpenStreetMapView
          alerts={activeAlerts}
          selectedAlertId={selectedAlert?.id}
          onSelectAlert={handleSelectAlert}
          center={{ lat: centerLat, lng: centerLng }}
          zoom={12}
        />

        {/* Alert Details Panel - Overlay when maximized */}
        {selectedAlert && (
          <div className="absolute top-4 left-4 z-[1001] w-80 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg border border-white/30 overflow-hidden shadow-xl">
              {/* Header */}
              <div className={`${getCategoryColor(selectedAlert.category)} bg-opacity-90 text-white p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <h3>Alert Details</h3>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="text-white hover:text-gray-200"
                  >
                    ✕
                  </button>
                </div>
                <p>{getCategoryLabel(selectedAlert.category)}</p>
              </div>

              {/* Content */}
              <div className="p-4 space-y-4 bg-white/90 backdrop-blur-md">
                <div>
                  <div className="flex items-center gap-2 text-gray-700 mb-1">
                    <User className="w-4 h-4" />
                    <span className="font-semibold">Reporter</span>
                  </div>
                  <p className="text-gray-900">{selectedAlert.userName}</p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-gray-700 mb-1">
                    {selectedAlert.triggeredBy === 'iot-device' ? (
                      <Radio className="w-4 h-4" />
                    ) : (
                      <Smartphone className="w-4 h-4" />
                    )}
                    <span className="font-semibold">Triggered By</span>
                  </div>
                  <p className="text-gray-900">
                    {selectedAlert.triggeredBy === 'iot-device' 
                      ? 'IoT Panic Button' 
                      : 'Mobile Application'}
                  </p>
                  {selectedAlert.deviceId && (
                    <p className="text-sm text-gray-700">Device: {selectedAlert.deviceId}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2 text-gray-700 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="font-semibold">Time</span>
                  </div>
                  <p className="text-gray-900">{formatDate(selectedAlert.timestamp)}</p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-gray-700 mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="font-semibold">Location</span>
                  </div>
                  <p className="text-sm text-gray-900">
                    Lat: {selectedAlert.location.latitude.toFixed(6)}<br />
                    Long: {selectedAlert.location.longitude.toFixed(6)}<br />
                    Accuracy: ±{selectedAlert.location.accuracy.toFixed(0)}m
                  </p>
                </div>

                {selectedAlert.message && (
                  <div>
                    <div className="flex items-center gap-2 text-gray-700 mb-1">
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-semibold">Additional Information</span>
                    </div>
                    <p className="bg-white/70 rounded p-3 text-gray-900">{selectedAlert.message}</p>
                  </div>
                )}

                <div>
                  <p className="text-gray-700 font-semibold mb-2">Status</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedAlert.id, 'acknowledged')}
                      className={`flex-1 px-3 py-2 rounded transition-colors ${
                        selectedAlert.status === 'acknowledged'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/70 text-gray-700 hover:bg-white'
                      }`}
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedAlert.id, 'resolved')}
                      className={`flex-1 px-3 py-2 rounded transition-colors ${
                        selectedAlert.status === 'resolved'
                          ? 'bg-green-600 text-white'
                          : 'bg-white/70 text-gray-700 hover:bg-white'
                      }`}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {isMaximized && typeof document !== 'undefined' && createPortal(fullScreenMap, document.body)}
      
      {!isMaximized && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Map Area */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden relative" style={{ height: '600px' }}>
              {/* Maximize/Minimize Button */}
              <button
                onClick={() => setIsMaximized(true)}
                className="absolute top-4 right-4 z-[1001] bg-white hover:bg-gray-100 text-gray-700 p-2 rounded-lg shadow-lg transition-colors"
                title="Full Screen"
              >
                <Maximize2 className="w-5 h-5" />
              </button>

              <OpenStreetMapView
                alerts={activeAlerts}
                selectedAlertId={selectedAlert?.id}
                onSelectAlert={handleSelectAlert}
                center={{ lat: centerLat, lng: centerLng }}
                zoom={12}
              />
            </div>
          </div>

          {/* Alert Details Panel - Normal view */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {selectedAlert ? (
                <div>
                  {/* Header */}
                  <div className={`${getCategoryColor(selectedAlert.category)} text-white p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3>Alert Details</h3>
                      <button
                        onClick={() => setSelectedAlert(null)}
                        className="text-white hover:text-gray-200"
                      >
                        ✕
                      </button>
                    </div>
                    <p>{getCategoryLabel(selectedAlert.category)}</p>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <User className="w-4 h-4" />
                        <span>Reporter</span>
                      </div>
                      <p>{selectedAlert.userName}</p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        {selectedAlert.triggeredBy === 'iot-device' ? (
                          <Radio className="w-4 h-4" />
                        ) : (
                          <Smartphone className="w-4 h-4" />
                        )}
                        <span>Triggered By</span>
                      </div>
                      <p>
                        {selectedAlert.triggeredBy === 'iot-device' 
                          ? 'IoT Panic Button' 
                          : 'Mobile Application'}
                      </p>
                      {selectedAlert.deviceId && (
                        <p className="text-sm text-gray-500">Device: {selectedAlert.deviceId}</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Clock className="w-4 h-4" />
                        <span>Time</span>
                      </div>
                      <p>{formatDate(selectedAlert.timestamp)}</p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <MapPin className="w-4 h-4" />
                        <span>Location</span>
                      </div>
                      <p className="text-sm">
                        Lat: {selectedAlert.location.latitude.toFixed(6)}<br />
                        Long: {selectedAlert.location.longitude.toFixed(6)}<br />
                        Accuracy: ±{selectedAlert.location.accuracy.toFixed(0)}m
                      </p>
                    </div>

                    {selectedAlert.message && (
                      <div>
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <MessageSquare className="w-4 h-4" />
                          <span>Additional Information</span>
                        </div>
                        <p className="bg-gray-50 rounded p-3">{selectedAlert.message}</p>
                      </div>
                    )}

                    <div>
                      <p className="text-gray-600 mb-2">Status</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateStatus(selectedAlert.id, 'acknowledged')}
                          className={`flex-1 px-3 py-2 rounded transition-colors ${
                            selectedAlert.status === 'acknowledged'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(selectedAlert.id, 'resolved')}
                          className={`flex-1 px-3 py-2 rounded transition-colors ${
                            selectedAlert.status === 'resolved'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p>Select an alert on the map to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}