import mongoose, { Schema, Document } from 'mongoose';

export interface IResponder extends Document {
  name: string;
  email: string;
  password: string;
  badgeId: string;
  department: 'police' | 'medical' | 'fire' | 'rescue' | 'barangay';
  isOnDuty: boolean;
  currentLocation?: {
    latitude: number;
    longitude: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const responderSchema = new Schema<IResponder>({
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

export const Responder = mongoose.model<IResponder>('Responder', responderSchema);
