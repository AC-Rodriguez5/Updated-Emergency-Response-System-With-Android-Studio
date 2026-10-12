import { z } from 'zod';

export const listDevicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(['all', 'online', 'idle', 'offline', 'unpaired']).default('all'),
    // Devices that cannot raise an alert at all, for the "who needs attention"
    // view. See `readinessOf` in devices.service.ts.
    needsAttention: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    q: z.string().trim().max(120).optional(),
  })
  .strict();
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;
