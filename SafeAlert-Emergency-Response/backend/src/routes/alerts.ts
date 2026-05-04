import { Router } from 'express';
import { Alert, User } from '../models/index.js';
import mongoose from 'mongoose';

const router = Router();

// Create Alert (from user app)
router.post('/', async (req, res) => {
  try {
    const { type, description, location, userId, userName, userPhone, emergencyContacts } = req.body;

    if (!type || !location) {
      return res.status(400).json({ error: 'Type and location are required' });
    }

    // Determine priority based on type
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (type === 'SOS' || type === 'medical') {
      priority = 'critical';
    } else if (type === 'fire' || type === 'crime') {
      priority = 'high';
    } else if (type === 'accident' || type === 'rescue') {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    const now = new Date();
    
    // Handle userId - create new ObjectId if not a valid one
    let userObjectId;
    try {
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        userObjectId = new mongoose.Types.ObjectId(userId);
      } else {
        userObjectId = new mongoose.Types.ObjectId();
      }
    } catch {
      userObjectId = new mongoose.Types.ObjectId();
    }

    const alert = new Alert({
      type,
      description: description || `${type} emergency reported`,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address || 'Location not specified',
        accuracy: location.accuracy,
      },
      locationHistory: [{
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: now,
        accuracy: location.accuracy,
      }],
      lastLocationUpdate: now,
      isOnline: true,
      userId: userObjectId,
      userName: userName || 'Anonymous',
      userPhone: userPhone || 'Not provided',
      emergencyContacts: emergencyContacts || [],
      priority,
      status: 'pending',
    });

    await alert.save();

    // Emit to connected responders via Socket.io (if available)
    const io = req.app.get('io');
    if (io) {
      io.emit('alert:new', alert);
    }

    res.status(201).json({
      message: 'Alert created successfully',
      alert,
    });
  } catch (error) {
    console.error('Create alert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update GPS Location (continuous tracking)
router.patch('/:id/location', async (req, res) => {
  try {
    const { latitude, longitude, accuracy, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const now = new Date();
    
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          location: { latitude, longitude, accuracy, address: address || 'Location updating...' },
          lastLocationUpdate: now,
          isOnline: true,
        },
        $push: {
          locationHistory: {
            $each: [{ latitude, longitude, timestamp: now, accuracy }],
            $slice: -100, // Keep only last 100 location points
          },
        },
      },
      { new: true }
    ).lean();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Emit location update to responders
    const io = req.app.get('io');
    if (io) {
      io.emit('location:updated', {
        alertId: alert._id,
        location: alert.location,
        lastLocationUpdate: alert.lastLocationUpdate,
        isOnline: true,
      });
    }

    res.json({ message: 'Location updated', alert });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark user as offline (called when app detects connection loss, or by heartbeat timeout)
router.patch('/:id/offline', async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { isOnline: false },
      { new: true }
    ).lean();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('user:offline', { alertId: alert._id });
    }

    res.json({ message: 'User marked offline', alert });
  } catch (error) {
    console.error('Mark offline error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get All Alerts (for responder dashboard)
router.get('/', async (req, res) => {
  try {
    const { status, type, limit = 50 } = req.query;
    
    const query: any = {};
    
    if (status) {
      query.status = status;
    }
    
    if (type) {
      query.type = type;
    }

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Transform data for frontend with idle time calculation
    const formattedAlerts = alerts.map((alert: any) => {
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
        isOnline: alert.isOnline !== false, // Default to true if not set
        idleTime: idleTimeDisplay,
        idleMinutes: idleMinutes,
      };
    });

    res.json({
      alerts: formattedAlerts,
      total: formattedAlerts.length,
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Alert by ID
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id).lean();
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ alert });
  } catch (error) {
    console.error('Get alert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Alert Status (for responders)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, responderId, responderName } = req.body;

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'responding' && responderId) {
      updateData.responderId = new mongoose.Types.ObjectId(responderId);
      updateData.responderName = responderName;
      updateData.responseTime = new Date();
    }

    if (status === 'resolved') {
      updateData.resolvedTime = new Date();
    }

    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).lean();

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Emit update to connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('alert:updated', alert);
    }

    res.json({
      message: 'Alert updated successfully',
      alert,
    });
  } catch (error) {
    console.error('Update alert error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alerts by user ID
router.get('/user/:userId', async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      alerts,
      total: alerts.length,
    });
  } catch (error) {
    console.error('Get user alerts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get alert statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const [total, pending, responding, resolved] = await Promise.all([
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

    res.json({
      total,
      pending,
      responding,
      resolved,
      last24Hours,
      byType: byType.reduce((acc: Record<string, number>, item: { _id: string; count: number }) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to get relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export default router;
