import { z } from 'zod';

export const userRegistrationSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8),
  phone: z.string().min(10).max(15),
  dateOfBirth: z.string().datetime(), // ISO string
  address: z.string().min(5).max(255),
  consentLocation: z.boolean().refine(val => val === true, {
    message: "Location processing consent is required",
  })
});

export const responderRegistrationSchema = userRegistrationSchema.extend({
  agencyType: z.enum(['police', 'fire', 'medical', 'rescue', 'other']),
  departmentName: z.string().min(2).max(100),
  role: z.string().min(2).max(100),
  credentialNumber: z.string().optional(),
  coverageArea: z.string().min(2).max(100)
});

export const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional()
});

export const tokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required")
});

export const emergencyCreationSchema = z.object({
  type: z.enum(['medical', 'crime', 'fire', 'general_sos', 'accident', 'natural', 'other']),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  idempotencyKey: z.string().uuid()
});

export const blePairingSchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  deviceName: z.string().min(1, "Device name is required"),
  firmwareVersion: z.string().optional()
});

export const bleStatusUpdateSchema = z.object({
  batteryLevel: z.number().min(0).max(100).optional(),
  firmwareVersion: z.string().optional()
});

export const responderReportSchema = z.object({
  arrivalTimestamp: z.string().datetime(),
  situationNotes: z.string().min(1, "Situation notes are required"),
  actionTaken: z.string().min(1, "Action taken is required"),
  needsAdminResolution: z.boolean(),
  photoUrls: z.array(z.string().url()).optional()
});

export const locationSampleSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  capturedAt: z.string().datetime().optional()
});