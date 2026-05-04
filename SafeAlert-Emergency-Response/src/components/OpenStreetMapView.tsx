import { useEffect, useRef, useState } from 'react';
import type { Alert } from '../types';

interface Props {
  alerts: Alert[];
  selectedAlertId?: string;
  onSelectAlert: (alertId: string) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
}

// Declare Leaflet types
declare global {
  interface Window {
    L: any;
  }
}

export function OpenStreetMapView({ 
  alerts, 
  selectedAlertId, 
  onSelectAlert,
  center = { lat: 14.5995, lng: 120.9842 }, // Default: Manila, Philippines
  zoom = 12
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string>('');

  // Load Leaflet CSS and JS
  useEffect(() => {
    // Check if already loaded
    if (window.L) {
      setIsLoaded(true);
      return;
    }

    // Load Leaflet CSS
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    cssLink.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    cssLink.crossOrigin = '';
    document.head.appendChild(cssLink);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.async = true;
    
    script.onload = () => {
      setIsLoaded(true);
    };
    
    script.onerror = () => {
      setError('Failed to load OpenStreetMap library.');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current || !window.L) {
      return;
    }

    try {
      // Create map instance
      const map = window.L.map(mapRef.current).setView([center.lat, center.lng], zoom);

      // Add OpenStreetMap tile layer
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    } catch (err: any) {
      console.error('Map initialization error:', err);
      setError('Error initializing map.');
    }
  }, [isLoaded, center.lat, center.lng, zoom]);

  // Update markers when alerts change
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded || !window.L) {
      return;
    }

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    if (alerts.length === 0) {
      return;
    }

    // Create bounds to fit all markers
    const bounds: [number, number][] = [];

    // Add markers for each alert
    alerts.forEach(alert => {
      const position: [number, number] = [alert.location.latitude, alert.location.longitude];
      bounds.push(position);

      // Get marker color based on category
      const markerColor = getMarkerColor(alert.category);
      
      // Create custom icon with pulsing animation for active alerts
      const iconHtml = alert.status === 'active' 
        ? `
          <div style="position: relative;">
            <div style="
              position: absolute;
              width: 40px;
              height: 40px;
              background: ${markerColor};
              opacity: 0.3;
              border-radius: 50%;
              animation: pulse 2s infinite;
              top: -20px;
              left: -20px;
            "></div>
            <div style="
              width: 24px;
              height: 24px;
              background: ${markerColor};
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              position: relative;
              z-index: 1000;
            "></div>
          </div>
          <style>
            @keyframes pulse {
              0% {
                transform: scale(0.5);
                opacity: 0.3;
              }
              50% {
                transform: scale(1);
                opacity: 0.1;
              }
              100% {
                transform: scale(0.5);
                opacity: 0.3;
              }
            }
          </style>
        `
        : `
          <div style="
            width: ${alert.id === selectedAlertId ? '28px' : '24px'};
            height: ${alert.id === selectedAlertId ? '28px' : '24px'};
            background: ${markerColor};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          "></div>
        `;

      const customIcon = window.L.divIcon({
        html: iconHtml,
        className: 'custom-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = window.L.marker(position, { 
        icon: customIcon,
        title: `${alert.category} - ${alert.userName}`
      }).addTo(mapInstanceRef.current);

      // Create popup content
      const popupContent = createPopupContent(alert);
      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
      });

      // Handle marker click
      marker.on('click', () => {
        onSelectAlert(alert.id);
      });

      // Open popup if this alert is selected
      if (alert.id === selectedAlertId) {
        marker.openPopup();
      }

      markersRef.current.push(marker);
    });

    // Fit map to show all markers
    if (bounds.length > 0) {
      try {
        if (bounds.length === 1) {
          mapInstanceRef.current.setView(bounds[0], 15);
        } else {
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch (err) {
        console.error('Error fitting bounds:', err);
      }
    }
  }, [alerts, selectedAlertId, isLoaded, onSelectAlert]);

  const getMarkerColor = (category: Alert['category']) => {
    const colors = {
      medical: '#DC2626',
      fire: '#EA580C',
      crime: '#9333EA',
      accident: '#CA8A04',
      'natural-disaster': '#2563EB',
      other: '#6B7280',
    };
    return colors[category] || '#6B7280';
  };

  const createPopupContent = (alert: Alert) => {
    const categoryLabel = alert.category.replace('-', ' ').toUpperCase();
    const categoryColor = getMarkerColor(alert.category);
    const time = new Date(alert.timestamp).toLocaleString();
    
    return `
      <div style="padding: 4px; min-width: 200px;">
        <div style="
          background: ${categoryColor};
          color: white;
          padding: 8px;
          margin: -8px -8px 8px -8px;
          font-weight: bold;
          font-size: 14px;
        ">
          ${categoryLabel}
        </div>
        <div style="padding: 4px 0;">
          <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
            <strong>Reporter:</strong> ${alert.userName}
          </p>
          <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
            <strong>Time:</strong> ${time}
          </p>
          <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
            <strong>Status:</strong> <span style="text-transform: capitalize;">${alert.status}</span>
          </p>
          ${alert.triggeredBy ? `
            <p style="margin: 4px 0; font-size: 13px; color: #4b5563;">
              <strong>Source:</strong> ${alert.triggeredBy === 'iot-device' ? 'IoT Device' : 'Mobile App'}
            </p>
          ` : ''}
          <p style="margin: 4px 0; font-size: 11px; color: #6b7280;">
            📍 ${alert.location.latitude.toFixed(6)}, ${alert.location.longitude.toFixed(6)}
          </p>
        </div>
      </div>
    `;
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-6">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <p className="text-gray-700 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Please refresh the page to try again.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading OpenStreetMap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      
      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 max-w-xs z-[1000]">
        <h4 className="font-semibold mb-2 text-sm">Alert Categories</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span>Medical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-600"></div>
            <span>Fire</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-600"></div>
            <span>Crime</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-600"></div>
            <span>Accident</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span>Disaster</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-600"></div>
            <span>Other</span>
          </div>
        </div>
      </div>

      {/* Alert Count Badge */}
      {alerts.length > 0 && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 z-[1000]">
          <p className="text-sm">
            <span className="font-semibold">{alerts.length}</span>
            {' '}active alert{alerts.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* OSM Attribution */}
      <div className="absolute bottom-4 right-4 bg-white/90 rounded px-2 py-1 text-xs text-gray-600 z-[1000]">
        Powered by OpenStreetMap
      </div>
    </div>
  );
}
