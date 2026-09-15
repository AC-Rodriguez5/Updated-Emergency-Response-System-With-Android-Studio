# SafeAlert Backend Data Model PRD

**Purpose:** Defines core TypeScript interfaces for users, responders, emergencies, location samples, BLE devices and audit logs.

**Included sections:** Section 17

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

---

## 17. Backend data model

### 17.1 User

```ts
interface User {
  id: string;
  role: "user";
  fullName: string;
  dateOfBirth: string;
  age: number;
  contactNumber: string;
  email: string;
  passwordHash: string;
  address: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  proofOfResidencyFileId: string;
  faceCaptureFileId: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 17.2 Responder

```ts
interface Responder {
  id: string;
  role: "responder";
  fullName: string;
  dateOfBirth: string;
  age: number;
  contactNumber: string;
  email: string;
  passwordHash: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  agencyType: "police" | "fire" | "medical" | "rescue" | "other";
  stationName: string;
  position: string;
  credentialNumber?: string;
  credentialFileId: string;
  faceCaptureFileId: string;
  coverageArea: string;
  dutyStatus: "off_duty" | "on_duty" | "busy";
  currentLocation?: GeoPoint;
  createdAt: string;
  updatedAt: string;
}
```

### 17.3 Emergency

```ts
interface Emergency {
  id: string;
  userId: string;
  type: "medical" | "crime" | "fire" | "general_sos";
  priority: "medium" | "high" | "critical";
  source: "mobile_app" | "iot_ble";
  status:
    | "pending"
    | "assigned"
    | "responder_on_the_way"
    | "responder_nearby"
    | "responder_report_submitted"
    | "resolved"
    | "cancelled"
    | "false_alarm";
  currentLocation: GeoPoint;
  locationAccuracyMeters: number;
  assignedResponderId?: string;
  assignedAt?: string;
  responderOnTheWayAt?: string;
  responderNearbyAt?: string;
  reportSubmittedAt?: string;
  resolvedAt?: string;
  resolvedByAdminId?: string;
  cancellationReason?: string;
  resolutionNotes?: string;
  bleEventId?: string;
  idempotencyKey: string;
  timeline: EmergencyTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}
```

### 17.4 Location sample

```ts
interface LocationSample {
  id: string;
  emergencyId?: string;
  actorId: string;
  actorType: "user" | "responder";
  location: GeoPoint;
  accuracyMeters: number;
  speedMetersPerSecond?: number;
  capturedAt: string;
  receivedAt: string;
}
```

### 17.5 BLE device

```ts
interface BleDevice {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  firmwareVersion: string;
  batteryLevel: number;
  status: "paired" | "connected" | "disconnected" | "unpaired";
  lastSeenAt?: string;
  pairedAt: string;
  unpairedAt?: string;
}
```

### 17.6 Audit log

```ts
interface AuditLog {
  id: string;
  actorId: string;
  actorRole: "admin" | "responder" | "user" | "system";
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}
```

---
