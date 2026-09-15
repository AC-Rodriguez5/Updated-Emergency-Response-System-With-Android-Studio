# SafeAlert Split PRD Index

**Source file:** SafeAlert_Production_Ready_PRD_Flutter_IoT (1).md

**Split approach:** The master PRD was divided by implementation ownership and functional domain, not by page count. Each file can be handed to the responsible team as a focused PRD.

## Files

### [01_Product_Strategy_Scope_and_Roles_PRD.md](./01_Product_Strategy_Scope_and_Roles_PRD.md)
**Title:** SafeAlert Product Strategy, Scope and Roles PRD

**Purpose:** Defines the product vision, objectives, quality targets, scope boundaries and user roles.

**Original coverage:** Original preamble, Sections 1 to 5

### [02_System_Architecture_Tech_Stack_and_Migration_PRD.md](./02_System_Architecture_Tech_Stack_and_Migration_PRD.md)
**Title:** SafeAlert System Architecture, Tech Stack and Migration PRD

**Purpose:** Defines the target system architecture, repository structure, technology decisions and React Native or Expo to Flutter migration path.

**Original coverage:** Sections 6 to 8

### [03_Authentication_Registration_and_Approvals_PRD.md](./03_Authentication_Registration_and_Approvals_PRD.md)
**Title:** SafeAlert Authentication, Registration and Approval PRD

**Purpose:** Defines account authentication, approval gating, registration fields, approval workflows and related acceptance criteria.

**Original coverage:** Sections 9.1 to 9.2

### [04_MobileForUser_Emergency_and_Facilities_PRD.md](./04_MobileForUser_Emergency_and_Facilities_PRD.md)
**Title:** SafeAlert MobileForUser Emergency and Facilities PRD

**Purpose:** Defines user emergency submission, active emergency tracking, location sharing, maps and nearby emergency facilities.

**Original coverage:** Sections 9.3 and 9.5

### [05_ESP32_BLE_Panic_Button_PRD.md](./05_ESP32_BLE_Panic_Button_PRD.md)
**Title:** SafeAlert ESP32 BLE Panic Button PRD

**Purpose:** Defines BLE hardware behavior, GATT service contract, pairing, background monitoring and IoT screen requirements.

**Original coverage:** Section 9.4

### [06_MobileForResponder_PRD.md](./06_MobileForResponder_PRD.md)
**Title:** SafeAlert MobileForResponder PRD

**Purpose:** Defines responder emergency map, filtering, route guidance, location sharing, on-the-way status and response reports.

**Original coverage:** Section 9.6

### [07_AdminWeb_Dashboard_PRD.md](./07_AdminWeb_Dashboard_PRD.md)
**Title:** SafeAlert AdminWeb Dashboard PRD

**Purpose:** Defines admin dashboard modules, approval queues, live emergency monitoring, responder tracking, resolution, analytics and records.

**Original coverage:** Section 9.7

### [08_Emergency_Lifecycle_API_Realtime_and_Notifications_PRD.md](./08_Emergency_Lifecycle_API_Realtime_and_Notifications_PRD.md)
**Title:** SafeAlert Emergency Lifecycle, API, Real-Time and Notifications PRD

**Purpose:** Defines emergency statuses, allowed transitions, API standards, required endpoints, WebSocket events and push notifications.

**Original coverage:** Sections 9.8, 10 and 14

### [09_Security_Performance_Reliability_and_Privacy_PRD.md](./09_Security_Performance_Reliability_and_Privacy_PRD.md)
**Title:** SafeAlert Security, Performance, Reliability and Privacy PRD

**Purpose:** Defines security hardening, performance targets, data retention, retry behavior, background behavior and privacy controls.

**Original coverage:** Sections 11, 12, 13, 21 and 22

### [10_Analytics_PRD.md](./10_Analytics_PRD.md)
**Title:** SafeAlert Analytics PRD

**Purpose:** Defines operational analytics events, admin analytics metrics, charts and acceptance criteria.

**Original coverage:** Section 15

### [11_Backend_Data_Model_PRD.md](./11_Backend_Data_Model_PRD.md)
**Title:** SafeAlert Backend Data Model PRD

**Purpose:** Defines core TypeScript interfaces for users, responders, emergencies, location samples, BLE devices and audit logs.

**Original coverage:** Section 17

### [12_Code_Architecture_PRD.md](./12_Code_Architecture_PRD.md)
**Title:** SafeAlert Code Architecture PRD

**Purpose:** Defines Flutter clean architecture, AdminWeb structure, backend module pattern, middleware order and error handling.

**Original coverage:** Sections 18 to 20

### [13_Testing_CI_Release_and_Checklist_PRD.md](./13_Testing_CI_Release_and_Checklist_PRD.md)
**Title:** SafeAlert Testing, CI, Release and Implementation Checklist PRD

**Purpose:** Defines test coverage, CI quality gates, release plan, acceptance summary, implementation checklist and final development guidance.

**Original coverage:** Sections 23 to 28

### [14_UI_UX_Design_System_and_Screen_Specs_PRD.md](./14_UI_UX_Design_System_and_Screen_Specs_PRD.md)
**Title:** SafeAlert UI, UX, Design System and Screen Specs PRD

**Purpose:** Defines shared design principles, detailed screen specifications, responsive layout, iconography, visual style and component implementation examples.

**Original coverage:** Section 16 plus Appendices A to D

## Suggested ownership

| File | Primary owner |
|---|---|
| 01_Product_Strategy_Scope_and_Roles_PRD.md | Product manager |
| 02_System_Architecture_Tech_Stack_and_Migration_PRD.md | Solution architect |
| 03_Authentication_Registration_and_Approvals_PRD.md | Backend lead and AdminWeb lead |
| 04_MobileForUser_Emergency_and_Facilities_PRD.md | Flutter user app lead |
| 05_ESP32_BLE_Panic_Button_PRD.md | IoT and Flutter user app leads |
| 06_MobileForResponder_PRD.md | Flutter responder app lead |
| 07_AdminWeb_Dashboard_PRD.md | AdminWeb lead |
| 08_Emergency_Lifecycle_API_Realtime_and_Notifications_PRD.md | Backend lead |
| 09_Security_Performance_Reliability_and_Privacy_PRD.md | Backend lead and QA lead |
| 10_Analytics_PRD.md | Backend lead and AdminWeb lead |
| 11_Backend_Data_Model_PRD.md | Backend lead |
| 12_Code_Architecture_PRD.md | Technical lead |
| 13_Testing_CI_Release_and_Checklist_PRD.md | QA lead and technical lead |
| 14_UI_UX_Design_System_and_Screen_Specs_PRD.md | UI/UX designer and frontend leads |
