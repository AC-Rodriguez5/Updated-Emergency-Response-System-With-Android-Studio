import { Request, Response } from 'express';
import Emergency from '../models/Emergency';
import LocationSample from '../models/LocationSample';
import { getIO } from '../config/socket';

export const createEmergency = async (req: Request, res: Response) => {
  try {
    const { type, latitude, longitude, idempotencyKey } = req.body;
    const userId = req.user!.userId;

    // REL-011: Safe retries using idempotencyKey (Prevents duplicate alerts from bad networks)
    const existing = await Emergency.findOne({ idempotencyKey });
    if (existing) {
      return res.status(200).json({ message: 'Emergency already received', emergency: existing });
    }

    const emergency = new Emergency({
      type,
      userId,
      currentLocation: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON format must be [longitude, latitude]
      },
      idempotencyKey,
      status: 'sent'
    });

    await emergency.save();
    
    // TODO: Emit socket event to Admins and Responders here in the next step
    
    return res.status(201).json({ message: 'Emergency alert sent successfully', emergency });
  } catch (error) {
    console.error('Create Emergency Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const logLocation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy, capturedAt } = req.body;
    const actorId = req.user!.userId;
    const actorType = req.user!.role as 'user' | 'responder';

    const emergency = await Emergency.findById(id);
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' });

    const sample = new LocationSample({
      emergencyId: id,
      actorId,
      actorType,
      location: { type: 'Point', coordinates: [longitude, latitude] },
      accuracy,
      capturedAt: capturedAt ? new Date(capturedAt) : new Date()
    });
    await sample.save();

    emergency.currentLocation = { type: 'Point', coordinates: [longitude, latitude] };
    await emergency.save();

    // Broadcast live location to the tracking dashboard
    getIO().to('admin_room').to(`user_${emergency.userId}`).emit('location:update', sample);

    return res.status(201).json({ message: 'Location logged' });
  } catch (error) {
    console.error('Log Location Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getActiveEmergencies = async (req: Request, res: Response) => {
  try {
    const emergencies = await Emergency.find({ status: { $ne: 'resolved' } })
      .populate('userId', 'name phone')
      .populate('assignedResponderId', 'name departmentName phone')
      .sort({ createdAt: -1 });
    
    return res.status(200).json(emergencies);
  } catch (error) {
    console.error('Get Emergencies Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const claimEmergency = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const responderId = req.user!.userId;

    const emergency = await Emergency.findById(id);
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' });
    
    if (emergency.status !== 'sent' && emergency.status !== 'awaitingResponder') {
        return res.status(400).json({ error: 'Emergency is already assigned or resolved' });
    }

    emergency.assignedResponderId = responderId as any;
    emergency.status = 'responderAssigned';
    await emergency.save();

    // TODO: Emit socket update to User and Admin

    return res.status(200).json({ message: 'Emergency claimed successfully', emergency });
  } catch (error) {
    console.error('Claim Emergency Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markOnTheWay = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const responderId = req.user!.userId;

    const emergency = await Emergency.findOne({ _id: id, assignedResponderId: responderId });
    if (!emergency) return res.status(404).json({ error: 'Emergency not found or not assigned to you' });

    emergency.status = 'responderOnTheWay';
    await emergency.save();

    return res.status(200).json({ message: 'Marked as on the way', emergency });
  } catch (error) {
    console.error('Mark On The Way Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const submitReport = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const responderId = req.user!.userId;
    const { arrivalTimestamp, situationNotes, actionTaken, needsAdminResolution, photoUrls } = req.body;

    const emergency = await Emergency.findOne({ _id: id, assignedResponderId: responderId });
    if (!emergency) return res.status(404).json({ error: 'Emergency not found or not assigned to you' });

    emergency.status = 'responseSubmitted';
    emergency.onGroundReport = {
      arrivalTimestamp: new Date(arrivalTimestamp),
      situationNotes, actionTaken, needsAdminResolution, photoUrls
    };
    await emergency.save();

    return res.status(200).json({ message: 'Report submitted successfully', emergency });
  } catch (error) {
    console.error('Submit Report Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const resolveEmergency = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const emergency = await Emergency.findById(id);
    
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' });
    
    emergency.status = 'resolved';
    await emergency.save();

    // TODO: Emit socket update 

    return res.status(200).json({ message: 'Emergency resolved successfully', emergency });
  } catch (error) {
    console.error('Resolve Emergency Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};