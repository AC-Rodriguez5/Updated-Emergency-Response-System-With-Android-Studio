import { Alert } from '../models/index.js';

export const createAlert = async (alertData) => {
  try {
    const now = new Date();

    // Determine priority based on type
    let priority = 'medium';
    if (alertData.type === 'SOS' || alertData.type === 'medical') {
      priority = 'critical';
    } else if (alertData.type === 'fire' || alertData.type === 'crime') {
      priority = 'high';
    } else if (alertData.type === 'accident' || alertData.type === 'rescue') {
      priority = 'medium';
    }

    const alert = new Alert({
      ...alertData,
      priority,
      status: 'pending',
      lastLocationUpdate: now,
      locationHistory: alertData.location?.history || [],
    });

    await alert.save();
    return alert;
  } catch (error) {
    console.error('Create alert error:', error);
    throw error;
  }
};

export const updateAlertLocation = async (alertId, location) => {
  try {
    if (!location.latitude || !location.longitude) {
      throw new Error('Latitude and longitude are required');
    }

    const now = new Date();

    const alert = await Alert.findById(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    // Update location
    alert.location = {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address || 'Location updating...',
      accuracy: location.accuracy,
    };
    alert.lastLocationUpdate = now;
    alert.isOnline = true;

    // Push to history
    alert.locationHistory.push({
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: now,
      accuracy: location.accuracy,
    });

    // Keep only last 100 location points
    alert.locationHistory = alert.locationHistory.slice(-100);

    await alert.save();
    return alert;
  } catch (error) {
    console.error('Update alert location error:', error);
    throw error;
  }
};

export const markAlertOffline = async (alertId) => {
  try {
    const alert = await Alert.findByIdAndUpdate(alertId, { isOnline: false }, { new: true });
    if (!alert) {
      throw new Error('Alert not found');
    }
    return alert;
  } catch (error) {
    console.error('Mark alert offline error:', error);
    throw error;
  }
};

export const updateAlertStatus = async (alertId, status, responderId, responderName) => {
  try {
    const updateData = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'responding' && responderId) {
      updateData.responderId = responderId;
      updateData.responderName = responderName;
      updateData.responseTime = new Date();
    }

    if (status === 'resolved') {
      updateData.resolvedTime = new Date();
    }

    const alert = await Alert.findByIdAndUpdate(alertId, updateData, { new: true });
    if (!alert) {
      throw new Error('Alert not found');
    }

    return alert;
  } catch (error) {
    console.error('Update alert status error:', error);
    throw error;
  }
};

export const getAllAlerts = async (options = {}) => {
  try {
    const { status, type, limit = 50 } = options;
    const query = {};

    if (status) query.status = status;
    if (type) query.type = type;

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Format for frontend
    const formattedAlerts = alerts.map((alert) => {
      const lastUpdate = new Date(alert.lastLocationUpdate || alert.updatedAt);
      const idleTimeMs = Date.now() - lastUpdate.getTime();
      const idleMinutes = Math.floor(idleTimeMs / 60000);
      let idleTimeDisplay = '';

      if (idleMinutes >= 60) {
        const hours = Math.floor(idleMinutes / 60);
        const mins = idleMinutes % 60;
        idleTimeDisplay = `${hours}h ${mins}m`;
      } else if (idleMinutes > 0) {
        idleTimeDisplay = `${idleMinutes}m`;
      } else {
        idleTimeDisplay = 'Just now';
      }

      return {
        id: alert._id,
        type: alert.type,
        priority: alert.priority,
        location: {
          lat: alert.location.latitude,
          lng: alert.location.longitude,
          address: alert.location.address,
          accuracy: alert.location.accuracy,
        },
        description: alert.description,
        time: getRelativeTime(alert.createdAt),
        status: alert.status,
        userName: alert.userName,
        userPhone: alert.userPhone,
        emergencyContacts: alert.emergencyContacts || [],
        responderId: alert.responderId,
        responderName: alert.responderName,
        createdAt: alert.createdAt,
        lastLocationUpdate: alert.lastLocationUpdate,
        isOnline: alert.isOnline !== false,
        idleTime: idleTimeDisplay,
        idleMinutes,
      };
    });

    return {
      alerts: formattedAlerts,
      total: formattedAlerts.length,
    };
  } catch (error) {
    console.error('Get all alerts error:', error);
    throw error;
  }
};

export const getAlertById = async (alertId) => {
  try {
    const alert = await Alert.findById(alertId).lean();
    if (!alert) {
      return null;
    }
    return alert;
  } catch (error) {
    console.error('Get alert by ID error:', error);
    throw error;
  }
};

export const getUserAlerts = async (userId) => {
  try {
    const alerts = await Alert.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return {
      alerts,
      total: alerts.length,
    };
  } catch (error) {
    console.error('Get user alerts error:', error);
    throw error;
  }
};

export const getAlertStats = async () => {
  try {
    const [
      total,
      pending,
      responding,
      resolved,
    ] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ status: 'pending' }),
      Alert.countDocuments({ status: 'responding' }),
      Alert.countDocuments({ status: 'resolved' }),
    ]);

    const byType = await Alert.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const last24Hours = await Alert.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    return {
      total,
      pending,
      responding,
      resolved,
      last24Hours,
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
    };
  } catch (error) {
    console.error('Get alert stats error:', error);
    throw error;
  }
};

export const getAlertHistory = async (alertId) => {
  try {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return null;
    }
    return alert.locationHistory;
  } catch (error) {
    console.error('Get alert history error:', error);
    throw error;
  }
};

export const getRelativeTime = (date) => {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

export default {
  createAlert,
  updateAlertLocation,
  markAlertOffline,
  updateAlertStatus,
  getAllAlerts,
  getAlertById,
  getUserAlerts,
  getAlertStats,
  getAlertHistory,
  getRelativeTime,
};