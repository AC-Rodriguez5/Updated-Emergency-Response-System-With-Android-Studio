import { z } from 'zod';

import { CONSENT_SCOPES } from '../../shared/consent.js';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const registerUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20),
  password: z.string().min(8).max(200),
  municipality: z.string().trim().max(120).optional(),
  barangay: z.string().trim().max(120).optional(),
  streetAddress: z.string().trim().min(2).max(250),
  dateOfBirth: z.coerce.date().refine((d) => {
    const now = new Date();
    if (d.getTime() > now.getTime()) return false;
    const age = now.getFullYear() - d.getFullYear();
    return age >= 0 && age <= 150;
  }, 'Invalid date of birth'),
  bloodType: z.enum(BLOOD_TYPES),
  emergencyContactName: z.string().trim().min(2).max(120),
  emergencyContactNumber: z.string().trim().min(7).max(20),
  /** Solved challenge, when the deployment requires one. */
  captchaToken: z.string().trim().min(10).max(5000).optional(),
  /*
    What the resident agreed to on the consent form, and under which wording.

    Two flat fields rather than one object: registration is posted as multipart
    so the app can attach its ID photos, and multipart has no way to carry a
    nested one. Unknown scope names are dropped rather than rejected — an app
    one version ahead must not be able to fail a registration, and a name this
    server does not know is a name it cannot honour either.
  */
  consentVersion: z.string().trim().min(1).max(20).optional(),
  consentScopes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((raw) =>
      raw
        ? raw
            .split(',')
            .map((scope) => scope.trim())
            .filter((scope): scope is (typeof CONSENT_SCOPES)[number] =>
              (CONSENT_SCOPES as readonly string[]).includes(scope),
            )
        : undefined,
    ),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const registerResponderSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().min(7).max(20).optional(),
    password: z.string().min(8).max(200),
    badgeId: z.string().trim().min(2).max(80),
    department: z.enum(['police', 'medical', 'fire', 'rescue', 'barangay']),
    agencyType: z
      .enum(['mdrrmo', 'pnp', 'bfp', 'medical', 'rescue', 'barangay', 'other'])
      .optional(),
    stationName: z.string().trim().max(180).optional(),
    position: z.string().trim().max(120).optional(),
    coverageArea: z.string().trim().max(180).optional(),
  })
  .strict();

export type RegisterResponderInput = z.infer<typeof registerResponderSchema>;

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(200),
    role: z.enum(['user', 'responder', 'admin']).optional(),
    /** Solved challenge, when the deployment requires one. */
    captchaToken: z.string().trim().min(10).max(5000).optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(20).max(2000),
  })
  .strict();

export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = z
  .object({
    refreshToken: z.string().min(20).max(2000).optional(),
  })
  .strict();

export type LogoutInput = z.infer<typeof logoutSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
