import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function handler(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next: NextFunction) => { void fn(req, res).catch(next); };
}
export function success(res: Response, data: unknown, status = 200, meta?: unknown) {
  return res.status(status).json({ data, requestId: res.getHeader('x-request-id'), ...(meta ? { meta } : {}) });
}
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record ID');
export const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
export function pageQuery(req: Request) { return pagination.parse(req.query); }
export const emergencyTypes = ['medical', 'crime', 'fire', 'general_sos'] as const;
export const statuses = ['pending', 'assigned', 'responder_on_the_way', 'responder_nearby', 'responder_report_submitted', 'resolved', 'cancelled', 'false_alarm'] as const;
export const activeStatuses = statuses.slice(0, 5);
export const locationSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyMeters: z.number().min(0).max(5000), capturedAt: z.string().datetime(), locationFreshness: z.enum(['current', 'last_known']).optional() }).strict();
export type Location = z.infer<typeof locationSchema>;
export function validateFreshLocation(location: Location) {
  const age = Date.now() - Date.parse(location.capturedAt);
  if (age < -30_000 || age > 60_000) throw new ApiError(400, 'STALE_LOCATION', 'Get a fresh location before sending.');
}
export function distanceMeters(a: Pick<Location, 'lat'|'lng'>, b: Pick<Location, 'lat'|'lng'>) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
