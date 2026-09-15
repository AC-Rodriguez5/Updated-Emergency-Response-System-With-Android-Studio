import mongoose, { Schema } from 'mongoose';

const responderSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  badgeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  department: {
    type: String,
    required: true,
    enum: ['police', 'medical', 'fire', 'rescue', 'barangay'],
  },
  isOnDuty: {
    type: Boolean,
    default: false,
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
  },
}, {
  timestamps: true,
});

export const Responder = mongoose.model('Responder', responderSchema);