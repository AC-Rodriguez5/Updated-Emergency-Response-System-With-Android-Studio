import AuditLog from '../models/AuditLog.ts';
import type { ClientSession } from 'mongoose';
export interface AuditEvent {
  actorId: string; actorRole: 'user' | 'responder' | 'admin' | 'system'; action: string;
  targetId?: string; targetType?: string; reason?: string; details?: Record<string, unknown>;
}
export async function recordAudit(event: AuditEvent, session?: ClientSession): Promise<void> {
  await AuditLog.create([event], { session });
}
