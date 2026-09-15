import mongoose, { Schema } from 'mongoose';

const alertSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['medical', 'fire', 'police', 'rescue', 'crime', 'accident', 'natural', 'SOS', 'other'],
  },
  description: {
    type: String,
    required: true,
  },
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: 'Location not specified' },
    accuracy: { type: Number },
  },
  locationHistory: [{
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    accuracy: { type: Number },
  }],
  lastLocationUpdate: {
    type: Date,
    default: Date.now,
  },
  isOnline: {
    type: Boolean,
    default: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userName: {
    type: String,
    required: true,
  },
  userPhone: {
    type: String,
    required: true,
  },
  emergencyContacts: [{
    name: { type: String },
    phone: { type: String },
    relationship: { type: String },
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['pending', 'responding', 'resolved', 'cancelled'],
    default: 'pending',
  },
  responderId: {
    type: Schema.Types.ObjectId,
    ref: 'Responder',
  },
  responderName: String,
  responseTime: Date,
  resolvedTime: Date,
  notes: String,
}, {
  timestamps: true,
});

// Index for efficient queries
alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ userId: 1 });
alertSchema.index({ responderId: 1 });
alertSchema.index({ lastLocationUpdate: -1 });

export const Alert = mongoose.model('Alert', alertSchema);