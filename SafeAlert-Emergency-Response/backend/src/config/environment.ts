import { z } from 'zod';
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'test') dotenv.config();
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).default('5000'),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must use mongodb:// or mongodb+srv://'),
  JWT_SECRET: z.string().refine(value => Buffer.byteLength(value, 'utf8') >= 32, 'JWT_SECRET must be at least 32 bytes'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:3000'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_USERNAME: z.string().trim().min(3).max(64).optional(),
  ADMIN_NAME: z.string().trim().min(2).max(100).default('SafeAlert Administrator'),
  ADMIN_PASSWORD: z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Admin password exceeds bcrypt limit').optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.ADMIN_EMAIL) !== Boolean(value.ADMIN_PASSWORD)) ctx.addIssue({code:'custom',path:['ADMIN_EMAIL'],message:'ADMIN_EMAIL and ADMIN_PASSWORD must be provided together'});
  const origins = value.ALLOWED_ORIGINS.split(',').map(v => v.trim());
  if (origins.some(origin => { try { const url = new URL(origin); return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin; } catch { return true; } })) ctx.addIssue({code:'custom',path:['ALLOWED_ORIGINS'],message:'Use explicit HTTP(S) origins; wildcard origins are forbidden'});
  if (value.NODE_ENV === 'production' && origins.some(origin => !origin.startsWith('https://'))) ctx.addIssue({code:'custom',path:['ALLOWED_ORIGINS'],message:'Production origins must use HTTPS'});
});
export function validateEnvironment(input: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    // Never echo configured values or secrets in validation errors.
    throw new Error('Invalid environment: ' + parsed.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; '));
  }
  return parsed.data;
}
export const env = validateEnvironment(process.env);
