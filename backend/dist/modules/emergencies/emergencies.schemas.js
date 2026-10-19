import { z } from 'zod';
export const emergencyTypeSchema = z.enum(['medical', 'crime', 'fire', 'general_sos']);
export const emergencySourceSchema = z.literal('mobile_app');
export const geoPointSchema = z
    .object({
    type: z.literal('Point'),
    coordinates: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
    ]),
    accuracyMeters: z.number().min(0).max(5000).optional(),
    capturedAt: z.string().datetime(),
})
    .strict();
export const createEmergencySchema = z
    .object({
    type: emergencyTypeSchema,
    source: emergencySourceSchema.default('mobile_app'),
    location: geoPointSchema,
    notes: z.string().trim().max(500).optional(),
    barangay: z.string().trim().max(120).optional(),
})
    .strict();
export const idParamSchema = z
    .object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId') })
    .strict();
export const listActiveQuerySchema = z
    .object({
    type: emergencyTypeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
})
    .strict();
export const listMineQuerySchema = z
    .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
})
    .strict();
export const cancelBodySchema = z
    .object({ reason: z.string().trim().max(500).optional() })
    .strict();
export const assignBodySchema = z
    .object({
    responderId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId').optional(),
})
    .strict();
export const acknowledgeBodySchema = z.object({}).strict();
// A reason is optional but worth asking for: "already on another call" is what
// tells a dispatcher whether to send the next-nearest unit or chase this one.
export const releaseBodySchema = z
    .object({ reason: z.string().trim().max(500).optional() })
    .strict();
export const reportBodySchema = z
    .object({
    note: z.string().trim().min(1).max(1000),
    reportType: z
        .enum(['arrival', 'field_report', 'follow_up', 'resolution_request'])
        .default('field_report'),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
})
    .strict();
export const requestUpdateBodySchema = z
    .object({ message: z.string().trim().min(5).max(1000) })
    .strict();
// One line on the incident, from any of the three people watching it. Shorter
// floor than an admin's update request: "help" or "2nd floor" is a complete
// thought in an emergency, and so is a one-tap code with no words at all.
//
// `audience` is ignored for the person in the emergency -- everything they say
// is addressed to everyone -- and defaults to `dispatch` for a responder or an
// admin, so the working channel stays the default and reaching the resident is
// a deliberate act.
export const userMessageBodySchema = z
    .object({
    message: z.string().trim().min(1).max(500),
    audience: z.enum(['dispatch', 'all']).optional(),
    code: z.string().trim().max(40).optional(),
})
    .strict();
export const arrivedBodySchema = z.object({}).strict();
export const onTheWayBodySchema = z.object({}).strict();
export const resolveBodySchema = z
    .object({ resolutionNotes: z.string().trim().max(1000).optional() })
    .strict();
