# SafeAlert Code Architecture PRD

**Purpose:** Defines Flutter clean architecture, AdminWeb structure, backend module pattern, middleware order and error handling.

**Included sections:** Sections 18 to 20

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

---

## 18. Flutter architecture

### 18.1 Layering

Each Flutter app shall use feature-first clean architecture.

```text
feature/
  data/
    datasources/
    dto/
    repositories/
  domain/
    entities/
    repositories/
    usecases/
  application/
    providers/
    controllers/
  presentation/
    screens/
    widgets/
```

### 18.2 State management

Use Riverpod providers.

Rules:

- UI widgets cannot call Dio directly.
- UI widgets call controllers or use cases.
- Repositories handle API and local data source coordination.
- API DTOs map to domain entities.
- Background services must use isolated service classes.

### 18.3 API client requirements

- Dio base client with access token interceptor.
- Refresh token interceptor.
- 10-second timeout.
- Retry interceptor for idempotent endpoints.
- Request ID logging.
- Automatic logout on refresh failure.
- User-friendly error mapper.

### 18.4 Secure storage

- Access and refresh tokens stored in `flutter_secure_storage`.
- Non-sensitive cache stored in Hive or Isar.
- BLE device ID can be stored locally but must also be validated with backend.
- Emergency queue should avoid storing excessive PII.

Acceptance criteria:

- Flutter analyzer shows no errors.
- No direct API call from presentation layer.
- Token refresh works without user re-login when Remember this device is enabled.
- Expired session redirects to login.

---

---

## 19. AdminWeb architecture

### 19.1 Structure

```text
src/
  app/
    App.tsx
    router.tsx
    providers.tsx
  features/
    auth/
    approvals/
    emergencies/
    map/
    responders/
    analytics/
    audit/
  components/
    ui/
    layout/
  services/
    apiClient.ts
    socketClient.ts
  types/
    api.ts
    domain.ts
```

### 19.2 AdminWeb requirements

- Use typed API client.
- No `any` in production code.
- Use Zod for form validation.
- Use React Query for server state.
- Use WebSocket for live map updates.
- Use responsive layout with breakpoints for desktop, tablet and mobile.
- Use protected routes.
- Use audit-friendly admin actions.

Acceptance criteria:

- `npm run typecheck` passes.
- `npm run lint` passes.
- Admin pages are accessible only to admin role.
- Live map updates via WebSocket.
- Registration review forms validate before submission.

---

---

## 20. Backend architecture

### 20.1 Module pattern

Each backend module shall follow:

```text
module/
  module.routes.ts
  module.controller.ts
  module.service.ts
  module.repository.ts
  module.schema.ts
  module.types.ts
  module.test.ts
```

### 20.2 Middleware requirements

Required middleware order:

1. Request ID
2. Security headers
3. CORS whitelist
4. Body parser with size limit
5. Mongo sanitize
6. Rate limiter by route group
7. Authentication where required
8. Role guard where required
9. Zod validation
10. Controller
11. Error handler

### 20.3 Error handling

Backend error response:

```json
{
  "requestId": "req_123",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need to be corrected.",
    "details": []
  }
}
```

Rules:

- Do not expose stack trace in production.
- Do not expose database errors to client.
- Log full error server-side with request ID.
- Return user-friendly messages.

Acceptance criteria:

- Invalid input returns structured validation error.
- Database outage returns safe generic message.
- Server logs include request ID.
- Production response never includes stack trace.

---
