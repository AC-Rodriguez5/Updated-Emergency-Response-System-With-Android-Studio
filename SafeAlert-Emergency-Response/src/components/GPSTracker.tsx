import { useState, useEffect } from 'react';
import { MapPin, Navigation, AlertCircle } from 'lucide-react';
import type { Location } from '../types';

interface Props {
  onLocationUpdate: (location: Location) => void;
}

export function GPSTracker({ onLocationUpdate }: Props) {
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  useEffect(() => {
    // Try to get real GPS location
    if ('geolocation' in navigator) {
      setIsTracking(true);
      
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation: Location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now(),
          };
          setLocation(newLocation);
          onLocationUpdate(newLocation);
          setError(null);
        },
        (err) => {
          // If GPS fails, use simulated location
          const simulatedLocation: Location = {
            latitude: 14.5995 + (Math.random() - 0.5) * 0.01, // Manila area
            longitude: 120.9842 + (Math.random() - 0.5) * 0.01,
            accuracy: 10,
            timestamp: Date.now(),
          };
          setLocation(simulatedLocation);
          onLocationUpdate(simulatedLocation);
          setError('Using simulated GPS location');
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );

      return () => {
        navigator.geolocation.clearWatch(watchId);
        setIsTracking(false);
      };
    } else {
      // Fallback to simulated location
      const simulatedLocation: Location = {
        latitude: 14.5995 + (Math.random() - 0.5) * 0.01,
        longitude: 120.9842 + (Math.random() - 0.5) * 0.01,
        accuracy: 10,
        timestamp: Date.now(),
      };
      setLocation(simulatedLocation);
      onLocationUpdate(simulatedLocation);
      setError('Geolocation not supported - using simulated location');
    }
  }, [onLocationUpdate]);

  return (
    <div className="mb-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-1 ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
            {isTracking ? (
              <Navigation className="w-6 h-6 animate-pulse" />
            ) : (
              <MapPin className="w-6 h-6" />
            )}
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3>GPS Status</h3>
              <span className={`px-2 py-1 rounded text-xs ${
                isTracking ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {isTracking ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            {location && (
              <div className="text-gray-600 space-y-1">
                <p>Lat: {location.latitude.toFixed(6)}</p>
                <p>Long: {location.longitude.toFixed(6)}</p>
                <p>Accuracy: ±{location.accuracy.toFixed(0)}m</p>
              </div>
            )}

            {error && (
              <div className="mt-2 flex items-start gap-2 text-yellow-700 bg-yellow-50 p-2 rounded">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
