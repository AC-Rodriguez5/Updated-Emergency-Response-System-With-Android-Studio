import { describe, it, expect } from 'vitest';
import { createResponderSchema } from '../src/modules/admin/responders.schemas.js';
import { changePasswordSchema } from '../src/modules/auth/auth.schemas.js';
import { listAdminQuerySchema } from '../src/modules/ambulance/ambulance.schemas.js';

// ─── createResponderSchema (Phase 1 slice 4 — PRD §6.2) ──────────────────────

describe('createResponderSchema', () => {
  const base = {
    name: 'Maria Santos',
    email: 'maria@tanzalert.test',
    password: 'password123',
    phone: '+63917000010',
    streetAddress: '21 MDRRMO Drive, Tanza',
    dateOfBirth: '1995-06-12T00:00:00Z',
    responderRole: 'medic' as const,
    dutyStatus: 'available' as const,
  };

  it('accepts a valid PRD §6.2 responder payload', () => {
    expect(createResponderSchema.safeParse(base).success).toBe(true);
  });

  it('accepts every PRD-listed responder role', () => {
    for (const role of [
      'medic',
      'fire_responder',
      'police_responder',
      'ambulance_driver',
      'disaster_response',
      'general_responder',
    ] as const) {
      expect(
        createResponderSchema.safeParse({ ...base, responderRole: role }).success,
        `role ${role} should be valid`,
      ).toBe(true);
    }
  });

  it('rejects under-18 responders', () => {
    const fifteenYears = new Date();
    fifteenYears.setFullYear(fifteenYears.getFullYear() - 15);
    expect(
      createResponderSchema.safeParse({ ...base, dateOfBirth: fifteenYears.toISOString() }).success,
    ).toBe(false);
  });

  it('rejects unknown duty status', () => {
    expect(
      createResponderSchema.safeParse({ ...base, dutyStatus: 'on_lunch' }).success,
    ).toBe(false);
  });

  it('rejects bad ambulance unit id format', () => {
    expect(
      createResponderSchema.safeParse({ ...base, assignedAmbulanceUnitId: 'not-an-id' }).success,
    ).toBe(false);
  });

  it('accepts a valid 24-char hex unit id', () => {
    expect(
      createResponderSchema.safeParse({
        ...base,
        assignedAmbulanceUnitId: '507f1f77bcf86cd799439011',
      }).success,
    ).toBe(true);
  });
});

// ─── changePasswordSchema (Phase 3 slice 5) ──────────────────────────────────

describe('changePasswordSchema', () => {
  it('accepts strong new password', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass1',
        newPassword: 'newstrongpass',
      }).success,
    ).toBe(true);
  });

  it('rejects new password shorter than 8', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass1',
        newPassword: 'short',
      }).success,
    ).toBe(false);
  });

  it('rejects empty current password', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'newstrongpass',
      }).success,
    ).toBe(false);
  });
});

// ─── listAdminQuerySchema includeArchived (Phase 2 slice 5) ──────────────────

describe('listAdminQuerySchema.includeArchived', () => {
  it("defaults includeArchived to false", () => {
    const result = listAdminQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeArchived).toBe(false);
    }
  });

  it("coerces string 'true' to boolean", () => {
    const result = listAdminQuerySchema.safeParse({ includeArchived: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeArchived).toBe(true);
    }
  });

  it("coerces string 'false' to boolean", () => {
    const result = listAdminQuerySchema.safeParse({ includeArchived: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.includeArchived).toBe(false);
    }
  });

  it('rejects garbage value', () => {
    expect(
      listAdminQuerySchema.safeParse({ includeArchived: 'maybe' }).success,
    ).toBe(false);
  });
});
