import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  Vibration,
  TextInput,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';

const { width } = Dimensions.get('window');

// Use your computer's local IP address for Expo Go
import { API_URL } from '../config/api';

// GPS update interval in milliseconds
const GPS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

interface Props {
  email: string;
  onLogout: () => void;
}

interface EmergencyType {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  isPrimary: boolean;
  relationship?: string;
}

interface AlertHistory {
  id: string;
  type: string;
  timestamp: Date;
  location: string;
  status: 'sent' | 'received' | 'resolved' | 'cancelled';
}

interface ActiveAlert {
  id: string;
  type: string;
  startTime: Date;
  status: 'pending' | 'responding' | 'resolved' | 'cancelled';
  responderName?: string;
}

const emergencyTypes: EmergencyType[] = [
  { id: 'medical', name: 'Medical Emergency', icon: 'heart', color: '#DC2626' },
  { id: 'fire', name: 'Fire', icon: 'flame', color: '#EA580C' },
  { id: 'crime', name: 'Crime/Threat', icon: 'shield', color: '#7C3AED' },
  { id: 'accident', name: 'Accident', icon: 'car', color: '#D97706' },
  { id: 'natural', name: 'Natural Disaster', icon: 'thunderstorm', color: '#7C3AED' },
  { id: 'other', name: 'Other Emergency', icon: 'warning', color: '#D97706' },
];

type TabType = 'emergency' | 'iot' | 'contacts' | 'history' | 'settings';

export default function UserDashboard({ email, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('emergency');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedEmergency, setSelectedEmergency] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [iotConnected, setIotConnected] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingUpdates, setPendingUpdates] = useState<any[]>([]);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const gpsUpdateInterval = useRef<NodeJS.Timeout | null>(null);
  const statusPollInterval = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const appState = useRef(AppState.currentState);

  // Load user data and contacts from storage
  useEffect(() => {
    loadUserData();
    loadContacts();
    getLocation();

    // App state listener
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      stopLocationTracking();
      if (statusPollInterval.current) {
        clearInterval(statusPollInterval.current);
      }
    };
  }, []);

  // Start location tracking and status polling when there's an active alert
  useEffect(() => {
    if (activeAlert && activeAlert.status !== 'resolved') {
      startLocationTracking();
      startStatusPolling();
    } else {
      stopLocationTracking();
      if (statusPollInterval.current) {
        clearInterval(statusPollInterval.current);
        statusPollInterval.current = null;
      }
    }
  }, [activeAlert]);

  // Poll for alert status changes with Socket.io fallback
  const startStatusPolling = () => {
    if (statusPollInterval.current) {
      clearInterval(statusPollInterval.current);
    }
    
    // Initialize Socket.io connection if not already connected
    if (!socketRef.current && activeAlert) {
      const baseURL = API_URL.replace('/api', '');
      socketRef.current = io(baseURL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });

      // Listen for alert status updates via Socket.io
      socketRef.current.on('alert:updated', (updatedAlert: any) => {
        if (updatedAlert.id === activeAlert?.id) {
          handleAlertUpdate(updatedAlert);
        }
      });
    }
    
    // Fallback polling every 5 seconds if Socket.io fails
    statusPollInterval.current = setInterval(async () => {
      if (activeAlert && activeAlert.status !== 'resolved') {
        await checkAlertStatus();
      }
    }, 5000);
  };

  const handleAlertUpdate = async (updatedAlert: any) => {
    if (!activeAlert) return;
    
    const serverStatus = updatedAlert.status;
    const responderName = updatedAlert.responderName;
    
    // Update if status changed
    if (serverStatus !== activeAlert.status) {
      if (serverStatus === 'resolved' || serverStatus === 'cancelled') {
        // Alert resolved/cancelled - clear active alert and update history
        Vibration.vibrate([100, 100, 100]);
        Alert.alert(
          serverStatus === 'resolved' ? '✓ Emergency Resolved' : '✕ Alert Cancelled',
          serverStatus === 'resolved' 
            ? 'Your emergency has been resolved by the responder. Stay safe!'
            : 'This alert has been cancelled.',
          [{ text: 'OK' }]
        );
        
        // Update history
        setAlertHistory(prev => prev.map(h => 
          h.id === activeAlert.id ? { ...h, status: serverStatus } : h
        ));
        
        // Clear active alert
        setActiveAlert(null);
        await AsyncStorage.removeItem('activeAlert');
        
      } else if (serverStatus === 'responding') {
        // Responder is on the way
        Vibration.vibrate([100, 50, 100]);
        const updatedAlertState = {
          ...activeAlert,
          status: 'responding' as const,
          responderName: responderName || 'Responder',
        };
        setActiveAlert(updatedAlertState);
        await AsyncStorage.setItem('activeAlert', JSON.stringify(updatedAlertState));
        
        // Update history
        setAlertHistory(prev => prev.map(h => 
          h.id === activeAlert.id ? { ...h, status: 'received' } : h
        ));
      }
    }
  };

  const checkAlertStatus = async () => {
    if (!activeAlert) return;
    
    try {
      const response = await fetch(`${API_URL}/alerts/${activeAlert.id}`);
      const data = await response.json();
      
      if (data.alert) {
        const serverStatus = data.alert.status;
        const responderName = data.alert.responderName;
        
        // Update if status changed
        if (serverStatus !== activeAlert.status) {
          if (serverStatus === 'resolved' || serverStatus === 'cancelled') {
            // Alert resolved/cancelled - clear active alert and update history
            Vibration.vibrate([100, 100, 100]);
            Alert.alert(
              serverStatus === 'resolved' ? '✓ Emergency Resolved' : '✕ Alert Cancelled',
              serverStatus === 'resolved' 
                ? 'Your emergency has been resolved by the responder. Stay safe!'
                : 'This alert has been cancelled.',
              [{ text: 'OK' }]
            );
            
            // Update history
            setAlertHistory(prev => prev.map(h => 
              h.id === activeAlert.id ? { ...h, status: serverStatus } : h
            ));
            
            // Clear active alert
            setActiveAlert(null);
            await AsyncStorage.removeItem('activeAlert');
            
          } else if (serverStatus === 'responding') {
            // Responder is on the way
            Vibration.vibrate([100, 50, 100]);
            const updatedAlert = {
              ...activeAlert,
              status: 'responding' as const,
              responderName: responderName || 'Responder',
            };
            setActiveAlert(updatedAlert);
            await AsyncStorage.setItem('activeAlert', JSON.stringify(updatedAlert));
            
            // Update history
            setAlertHistory(prev => prev.map(h => 
              h.id === activeAlert.id ? { ...h, status: 'received' } : h
            ));
          }
        }
      }
    } catch (error) {
      console.error('Error checking alert status:', error);
    }
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground - refresh location
      if (activeAlert) {
        getLocation();
      }
    }
    appState.current = nextAppState;
  };

  const loadUserData = async () => {
    try {
      const storedUserId = await AsyncStorage.getItem('userId');
      const storedActiveAlert = await AsyncStorage.getItem('activeAlert');
      
      if (storedUserId) setUserId(storedUserId);
      if (storedActiveAlert) {
        const alert = JSON.parse(storedActiveAlert);
        setActiveAlert(alert);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadContacts = async () => {
    try {
      const storedContacts = await AsyncStorage.getItem('contacts');
      if (storedContacts) {
        setContacts(JSON.parse(storedContacts));
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const saveContacts = async (newContacts: Contact[]) => {
    try {
      await AsyncStorage.setItem('contacts', JSON.stringify(newContacts));
    } catch (error) {
      console.error('Error saving contacts:', error);
    }
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied');
        return;
      }

      // Start watching location
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: GPS_UPDATE_INTERVAL,
          distanceInterval: 5, // Update if moved 5 meters
        },
        (newLocation) => {
          setLocation(newLocation);
          // Send location update to server
          if (activeAlert) {
            sendLocationUpdate(newLocation);
          }
        }
      );
    } catch (error) {
      console.error('Error starting location tracking:', error);
      setLocationError('Unable to track location');
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (gpsUpdateInterval.current) {
      clearInterval(gpsUpdateInterval.current);
      gpsUpdateInterval.current = null;
    }
  };

  const sendLocationUpdate = async (loc: Location.LocationObject) => {
    if (!activeAlert || !isOnline) {
      // Queue update for later if offline
      if (activeAlert && !isOnline) {
        setPendingUpdates(prev => [...prev, {
          alertId: activeAlert.id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          timestamp: new Date(),
        }]);
      }
      return;
    }

    try {
      await fetch(`${API_URL}/alerts/${activeAlert.id}/location`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          address: 'Live location update',
        }),
      });
    } catch (error) {
      console.error('Error sending location update:', error);
      // Queue for retry
      setPendingUpdates(prev => [...prev, {
        alertId: activeAlert.id,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        timestamp: new Date(),
      }]);
    }
  };

  const sendPendingUpdates = async () => {
    if (pendingUpdates.length === 0) return;

    const updates = [...pendingUpdates];
    setPendingUpdates([]);

    for (const update of updates) {
      try {
        await fetch(`${API_URL}/alerts/${update.alertId}/location`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            latitude: update.latitude,
            longitude: update.longitude,
            accuracy: update.accuracy,
          }),
        });
      } catch (error) {
        console.error('Error sending pending update:', error);
      }
    }
  };

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(loc);
    } catch (error) {
      setLocationError('Unable to get location');
    }
  };

  const sendEmergencyAlert = async (type: string) => {
    setSelectedEmergency(type);
    setIsSending(true);
    Vibration.vibrate(200);

    // Get fresh location
    await getLocation();

    const alertData = {
      type: type, // Already using correct type ID (medical, fire, crime, etc.) or 'SOS'
      description: `${type} emergency reported via mobile app`,
      location: {
        latitude: location?.coords.latitude || 14.5995,
        longitude: location?.coords.longitude || 120.9842,
        accuracy: location?.coords.accuracy || 10,
        address: 'Location from mobile device',
      },
      userName: email.split('@')[0],
      userPhone: contacts.length > 0 ? contacts[0].phone : 'Not provided',
      emergencyContacts: contacts.map(c => ({
        name: c.name,
        phone: c.phone,
        relationship: c.relationship || 'Contact',
      })),
    };

    try {
      console.log('Sending alert to:', API_URL);
      console.log('Alert data:', JSON.stringify(alertData));
      
      const response = await fetch(`${API_URL}/alerts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alertData),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', JSON.stringify(data));

      if (response.ok) {
        // Store alert ID for continuous GPS tracking
        const newActiveAlert: ActiveAlert = {
          id: data.alert?._id || data.alert?.id,
          type,
          startTime: new Date(),
          status: 'pending',
        };
        setActiveAlert(newActiveAlert);
        await AsyncStorage.setItem('activeAlert', JSON.stringify(newActiveAlert));

        const newAlert: AlertHistory = {
          id: data.alert?._id || data.alert?.id || Date.now().toString(),
          type,
          timestamp: new Date(),
          location: location ? `${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}` : 'Unknown',
          status: 'sent',
        };
        setAlertHistory(prev => [newAlert, ...prev]);
        setIsOnline(true);

        Alert.alert(
          '✓ Alert Sent',
          `Your ${type} alert has been sent to emergency responders. GPS tracking is now active.`,
          [{ text: 'OK' }]
        );
      } else {
        throw new Error(data.error || data.message || 'Failed to send alert');
      }
    } catch (error: any) {
      console.error('Send alert error:', error);
      setIsOnline(false);
      
      // Save alert locally for retry
      const newAlert: AlertHistory = {
        id: Date.now().toString(),
        type,
        timestamp: new Date(),
        location: location ? `${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}` : 'Unknown',
        status: 'sent',
      };
      setAlertHistory(prev => [newAlert, ...prev]);
      
      Alert.alert(
        'Connection Error',
        `Could not reach the server. Please check:\n\n1. Backend is running on your computer\n2. Phone and computer are on same WiFi\n3. API_URL is correct (${API_URL})\n\nError: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsSending(false);
      setSelectedEmergency(null);
    }
  };

  const cancelActiveAlert = async () => {
    if (!activeAlert) return;

    Alert.alert(
      'Cancel Alert',
      'Are you sure you want to cancel the active alert? Responders will be notified.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/alerts/${activeAlert.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'cancelled' }),
              });
            } catch (error) {
              console.error('Error cancelling alert:', error);
            }
            setActiveAlert(null);
            await AsyncStorage.removeItem('activeAlert');
            stopLocationTracking();
          },
        },
      ]
    );
  };

  const handleEmergencyPress = (type: EmergencyType) => {
    Alert.alert(
      `${type.name}`,
      `Send ${type.name.toLowerCase()} alert to emergency responders?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send Alert', 
          style: 'destructive',
          onPress: () => sendEmergencyAlert(type.id)
        },
      ]
    );
  };

  const handleSOSPress = () => {
    Vibration.vibrate(300);
    Alert.alert(
      '🚨 SOS Emergency',
      'This will send an urgent alert to ALL emergency contacts and nearby responders. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'SEND SOS', 
          style: 'destructive',
          onPress: () => sendEmergencyAlert('SOS')
        },
      ]
    );
  };

  const addContact = async () => {
    if (!newContactName.trim() || !newContactPhone.trim()) {
      Alert.alert('Error', 'Please enter both name and phone number.');
      return;
    }

    const newContact: Contact = {
      id: Date.now().toString(),
      name: newContactName.trim(),
      phone: newContactPhone.trim(),
      isPrimary: contacts.length === 0,
    };

    const updatedContacts = [...contacts, newContact];
    setContacts(updatedContacts);
    await saveContacts(updatedContacts);
    
    // Also save to backend if userId exists
    if (userId) {
      try {
        await fetch(`${API_URL}/contacts/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newContact.name,
            phone: newContact.phone,
            isPrimary: newContact.isPrimary,
          }),
        });
      } catch (error) {
        console.error('Error saving contact to server:', error);
      }
    }
    
    setNewContactName('');
    setNewContactPhone('');
    Alert.alert('Success', 'Contact added successfully.');
  };

  const deleteContact = async (id: string) => {
    Alert.alert(
      'Delete Contact',
      'Are you sure you want to delete this contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const updatedContacts = contacts.filter(c => c.id !== id);
            setContacts(updatedContacts);
            await saveContacts(updatedContacts);
          }
        },
      ]
    );
  };

  const tabs: { id: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'emergency', label: 'Emergency', icon: 'location' },
    { id: 'iot', label: 'IoT Device', icon: 'radio' },
    { id: 'contacts', label: 'Contacts', icon: 'people' },
    { id: 'history', label: 'History', icon: 'time' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const renderEmergencyTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Active Alert Banner */}
      {activeAlert && (
        <View style={[
          styles.activeAlertBanner,
          activeAlert.status === 'responding' && { backgroundColor: '#059669' }
        ]}>
          <View style={styles.activeAlertContent}>
            <Ionicons 
              name={activeAlert.status === 'responding' ? 'car' : 'radio'} 
              size={24} 
              color="#FFF" 
            />
            <View style={styles.activeAlertText}>
              <Text style={styles.activeAlertTitle}>
                {activeAlert.status === 'responding' 
                  ? 'Responder On The Way!' 
                  : 'Alert Active - GPS Tracking'}
              </Text>
              <Text style={styles.activeAlertSubtitle}>
                {activeAlert.type} • {activeAlert.status === 'responding'
                  ? `🚨 ${activeAlert.responderName || 'Responder'} is coming`
                  : isOnline ? '🟢 Live' : '🔴 Offline - will sync'}
              </Text>
            </View>
          </View>
          {activeAlert.status !== 'responding' && (
            <TouchableOpacity style={styles.cancelAlertButton} onPress={cancelActiveAlert}>
              <Text style={styles.cancelAlertText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Connection Status */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={20} color="#D97706" />
          <Text style={styles.offlineText}>
            Offline - Location updates will be sent when connection is restored
          </Text>
        </View>
      )}

      {/* GPS Status Card */}
      <View style={styles.gpsCard}>
        <View style={styles.gpsHeader}>
          <Ionicons name="navigate" size={24} color="#059669" />
          <Text style={styles.gpsTitle}>GPS Status</Text>
          <View style={[styles.gpsBadge, { backgroundColor: location ? '#D1FAE5' : '#FEE2E2' }]}>
            <Text style={[styles.gpsBadgeText, { color: location ? '#059669' : '#DC2626' }]}>
              {activeAlert ? 'Tracking' : location ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        {location ? (
          <View style={styles.gpsDetails}>
            <Text style={styles.gpsCoord}>Lat: {location.coords.latitude.toFixed(6)}</Text>
            <Text style={styles.gpsCoord}>Long: {location.coords.longitude.toFixed(6)}</Text>
            <Text style={styles.gpsCoord}>Accuracy: ±{location.coords.accuracy?.toFixed(0) || 10}m</Text>
          </View>
        ) : (
          <Text style={styles.gpsError}>{locationError || 'Getting location...'}</Text>
        )}
        <View style={styles.gpsNote}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.gpsNoteText}>
            {activeAlert ? 'GPS tracking every 5 seconds' : 'GPS location ready'}
          </Text>
        </View>
      </View>

      {/* Emergency Alert Section */}
      <Text style={styles.sectionTitle}>Emergency Alert</Text>
      <Text style={styles.sectionSubtitle}>Select emergency type to send alert</Text>

      {/* Warning if no contacts */}
      {contacts.length === 0 && (
        <View style={styles.warningCard}>
          <Ionicons name="warning" size={20} color="#D97706" />
          <Text style={styles.warningText}>Please add emergency contacts before sending alerts</Text>
        </View>
      )}

      {/* Emergency Grid */}
      <View style={styles.emergencyGrid}>
        {emergencyTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.emergencyCard,
              { backgroundColor: type.color },
              selectedEmergency === type.name && styles.emergencyCardActive
            ]}
            onPress={() => handleEmergencyPress(type)}
            disabled={isSending}
          >
            <Ionicons name={type.icon} size={32} color="#FFF" />
            <Text style={styles.emergencyName}>{type.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick SOS */}
      <Text style={styles.sectionTitle}>Quick SOS</Text>
      <TouchableOpacity
        style={styles.sosButton}
        onPress={handleSOSPress}
        disabled={isSending}
      >
        <View style={styles.sosInner}>
          <Ionicons name="alert-circle" size={48} color="#FFF" />
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.sosSubtext}>Press for immediate help</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderIoTTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>IoT Panic Button</Text>
      
      <View style={styles.iotCard}>
        <View style={styles.iotIconContainer}>
          <Ionicons name="radio" size={48} color={iotConnected ? '#059669' : '#9CA3AF'} />
        </View>
        <Text style={styles.iotStatus}>
          {iotConnected ? 'Device Connected' : 'No Device Connected'}
        </Text>
        <Text style={styles.iotDescription}>
          Connect your IoT panic button device to send emergency alerts with a single press.
        </Text>
        <TouchableOpacity
          style={[styles.iotButton, iotConnected && styles.iotButtonDisconnect]}
          onPress={() => setIotConnected(!iotConnected)}
        >
          <Text style={styles.iotButtonText}>
            {iotConnected ? 'Disconnect Device' : 'Scan for Devices'}
          </Text>
        </TouchableOpacity>
      </View>

      {iotConnected && (
        <View style={styles.iotInfoCard}>
          <Ionicons name="checkmark-circle" size={24} color="#059669" />
          <View style={styles.iotInfoContent}>
            <Text style={styles.iotInfoTitle}>Panic Button Ready</Text>
            <Text style={styles.iotInfoText}>Press the physical button to send an SOS alert.</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderContactsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Emergency Contacts</Text>
      <Text style={styles.sectionSubtitle}>Add people to notify during emergencies</Text>

      {/* Add Contact Form */}
      <View style={styles.addContactForm}>
        <TextInput
          style={styles.input}
          placeholder="Contact Name"
          value={newContactName}
          onChangeText={setNewContactName}
          placeholderTextColor="#9CA3AF"
        />
        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          value={newContactPhone}
          onChangeText={setNewContactPhone}
          keyboardType="phone-pad"
          placeholderTextColor="#9CA3AF"
        />
        <TouchableOpacity style={styles.addButton} onPress={addContact}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addButtonText}>Add Contact</Text>
        </TouchableOpacity>
      </View>

      {/* Contact List */}
      {contacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>No contacts added yet</Text>
        </View>
      ) : (
        contacts.map((contact) => (
          <View key={contact.id} style={styles.contactCard}>
            <View style={styles.contactAvatar}>
              <Text style={styles.contactInitial}>{contact.name[0].toUpperCase()}</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactPhone}>{contact.phone}</Text>
            </View>
            {contact.isPrimary && (
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryText}>Primary</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => deleteContact(contact.id)}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderHistoryTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Alert History</Text>
      
      {alertHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color="#D1D5DB" />
          <Text style={styles.emptyText}>No alerts sent yet</Text>
        </View>
      ) : (
        alertHistory.map((alert) => (
          <View key={alert.id} style={styles.historyCard}>
            <View style={styles.historyIcon}>
              <Ionicons 
                name={alert.status === 'resolved' || alert.status === 'cancelled' ? 'checkmark-circle' : 'alert-circle'} 
                size={24} 
                color={alert.status === 'resolved' ? '#059669' : alert.status === 'cancelled' ? '#6B7280' : '#DC2626'} 
              />
            </View>
            <View style={styles.historyInfo}>
              <Text style={styles.historyType}>{alert.type}</Text>
              <Text style={styles.historyLocation}>📍 {alert.location}</Text>
              <Text style={styles.historyTime}>
                {alert.timestamp.toLocaleString()}
              </Text>
            </View>
            <View style={[styles.statusBadge, 
              { backgroundColor: 
                alert.status === 'resolved' ? '#D1FAE5' : 
                alert.status === 'cancelled' ? '#F3F4F6' :
                alert.status === 'received' ? '#DBEAFE' : '#FEF3C7' 
              }
            ]}>
              <Text style={[styles.statusText,
                { color: 
                  alert.status === 'resolved' ? '#059669' : 
                  alert.status === 'cancelled' ? '#6B7280' :
                  alert.status === 'received' ? '#2563EB' : '#D97706' 
                }
              ]}>
                {alert.status === 'resolved' ? '✓ Resolved' :
                 alert.status === 'cancelled' ? '✕ Cancelled' :
                 alert.status === 'received' ? '🚨 Responding' : 
                 alert.status}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderSettingsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Settings</Text>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>Account</Text>
        <Text style={styles.settingsValue}>{email}</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>Contacts</Text>
        <Text style={styles.settingsValue}>{contacts.length} saved</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>Alerts Sent</Text>
        <Text style={styles.settingsValue}>{alertHistory.length}</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>IoT Device</Text>
        <Text style={styles.settingsValue}>{iotConnected ? 'Connected' : 'Not Connected'}</Text>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>App Version</Text>
        <Text style={styles.settingsValue}>1.0.0</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={20} color="#FFF" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Main Content */}
      {activeTab === 'emergency' && renderEmergencyTab()}
      {activeTab === 'iot' && renderIoTTab()}
      {activeTab === 'contacts' && renderContactsTab()}
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'settings' && renderSettingsTab()}

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={styles.navItem}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={24}
              color={activeTab === tab.id ? '#DC2626' : '#9CA3AF'}
            />
            <Text style={[
              styles.navLabel,
              { color: activeTab === tab.id ? '#DC2626' : '#9CA3AF' }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  gpsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  gpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  gpsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  gpsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gpsBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  gpsDetails: {
    gap: 4,
  },
  gpsCoord: {
    fontSize: 14,
    color: '#4B5563',
  },
  gpsError: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  gpsNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  gpsNoteText: {
    fontSize: 12,
    color: '#6B7280',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 4,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
  },
  emergencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  emergencyCard: {
    width: (width - 44) / 2,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyCardActive: {
    opacity: 0.7,
  },
  emergencyName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 8,
    textAlign: 'center',
  },
  sosButton: {
    backgroundColor: '#DC2626',
    borderRadius: 24,
    marginBottom: 24,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  sosInner: {
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  sosText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 8,
  },
  sosSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  iotCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  iotIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iotStatus: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  iotDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  iotButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  iotButtonDisconnect: {
    backgroundColor: '#DC2626',
  },
  iotButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  iotInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  iotInfoContent: {
    flex: 1,
  },
  iotInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 4,
  },
  iotInfoText: {
    fontSize: 14,
    color: '#047857',
  },
  addContactForm: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: '#1F2937',
  },
  addButton: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  contactPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
  primaryBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  primaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 12,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  historyLocation: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  historyTime: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  settingsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsLabel: {
    fontSize: 16,
    color: '#1F2937',
  },
  settingsValue: {
    fontSize: 16,
    color: '#6B7280',
  },
  logoutButton: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: 20,
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  activeAlertBanner: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeAlertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activeAlertText: {
    marginLeft: 12,
    flex: 1,
  },
  activeAlertTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  activeAlertSubtitle: {
    fontSize: 13,
    color: '#FEE2E2',
    marginTop: 2,
  },
  cancelAlertButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelAlertText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  offlineText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
  },
});
