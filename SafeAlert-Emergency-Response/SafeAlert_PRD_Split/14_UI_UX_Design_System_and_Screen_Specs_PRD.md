# SafeAlert UI, UX, Design System and Screen Specs PRD

**Purpose:** Defines shared design principles, detailed screen specifications, responsive layout, iconography, visual style and component implementation examples.

**Included sections:** Section 16 plus Appendices A to D

> Source: SafeAlert Emergency Response System Production PRD, Version 2.0, dated May 4, 2026.
> This file was split from the original master PRD for cleaner implementation ownership.

---

## 16. UI and UX requirements

### 16.1 Shared design principles

UX-001: UI shall be clean, urgent and accessible.

UX-002: Emergency actions shall be visually dominant.

UX-003: Red shall be used for critical action and danger only.

UX-004: Blue shall be used for navigation and responder actions.

UX-005: Green shall represent safe, resolved or connected state.

UX-006: Amber shall represent warning, pending or stale state.

UX-007: Every screen shall include loading, empty and error states.

UX-008: Touch targets shall be at least 44 by 44 px.

UX-009: Color must not be the only status indicator.

UX-010: Text must remain readable under outdoor conditions.

---

### 16.2 Design System

#### Typography
Use SF Pro Display (or system font equivalent) with 3-weight scale:
- **Body**: 17px regular, line-height 1.5
- **Title 1**: 34px bold
- **Title 2**: 28px semibold
- **Title 3**: 22px semibold

#### Color Palette

| Role | Hex Code | Usage |
|---|---|---|
| Primary Red | `#E52834` | Emergency actions, danger, critical alerts |
| Primary Blue | `#0A84FF` | Navigation, responder actions, links |
| Primary Green | `#34C759` | Safe, resolved, connected states |
| Primary Amber | `#FFB81C` | Warning, pending, stale states |
| Primary Purple | `#AF52DE` | Secondary accents, decorative elements |
| Background White | `#FFFFFF` | Primary content backgrounds |
| Background Gray | `#F5F5F5` | Secondary backgrounds, cards |
| Background Dark | `#1C1C1E` | Dark mode backgrounds |
| Text Primary | `#000000` | Primary text content |
| Text Secondary | `#737373` | Subtitles, captions, helper text |

#### Layout Structure

**Mobile Apps (User & Responder)**
- Single sidebar navigation drawer
- Emergency home as default landing page
- Bottom sheet for confirmations
- Full-width content area with max-width constraints

**Admin Web Dashboard**
- Left sidebar navigation (fixed width ~250px)
- Top header bar for search and user menu
- Main content area with responsive grid
- Breakpoints: mobile (<768px), tablet (768-1024px), desktop (>1024px)

#### Components

**Emergency Button Card**
- Full-width rectangular container with rounded corners (12px radius)
- Large emergency icon (64x64px)
- Label text below icon
- Color coded by type:
  - Medical: Red background
  - Crime: Purple background
  - Fire: Orange background
  - General SOS: Blue background
- Hold-to-send: 2-second activation threshold

**Registration Form**
- Two-column layout for desktop, single column for mobile
- Input fields with clear labels and validation feedback
- Live face capture camera preview
- File upload zone with drag-and-drop support
- Consent checkbox at bottom with terms link

**Approval Review Card**
- Applicant information at top
- Photo/document preview in card body
- Approval/Reject action buttons at bottom
- Reason text area for rejection
- Timestamp of submission

**Map Interface**
- Full-screen container with scrollable viewport
- Emergency markers by type and priority color
- Filter panel overlay at top or side
- Responder location markers with pulse animation
- Touch gestures: pinch-to-zoom, drag, tap-to-select

**Status Timeline**
- Vertical line with circular nodes
- Colored badges for each status
- Timestamp below each node
- Collapse/expand capability for detail

#### Responsive Behavior

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px | Single column, hamburger nav |
| Tablet | 768-1024px | Two-column where appropriate |
| Desktop | > 1024px | Full sidebar, multi-column content |

#### Responsive Behavior

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | < 768px | Single column, hamburger nav |
| Tablet | 768-1024px | Two-column where appropriate |
| Desktop | > 1024px | Full sidebar, multi-column content |

---

### 16.3 Accessibility Requirements

A11Y-001: All UI components must meet WCAG 2.1 AA compliance.

A11Y-002: Color contrast ratios must be at least 4.5:1 for normal text and 3:1 for large text.

A11Y-003: Emergency buttons must be reachable with one thumb on devices 5-6 inches.

A11Y-004: All interactive elements must be focusable and accessible via keyboard.

A11Y-005: Screen reader announcements for status changes must be concise and timed appropriately.

A11Y-006: Visual indicators must be accompanied by text labels or icons (not color alone).

A11Y-007: Video content must include captions and transcripts.

A11Y-008: Animations must respect reduced-motion preferences.

---

### 16.4 Flutter Implementation Notes

#### Color Implementation
```dart
class SafeAlertColors {
  static const emergencyRed = Color(0xFFE52834);
  static const responderBlue = Color(0xFF0A84FF);
  static const safeGreen = Color(0xFF34C759);
  static const warningAmber = Color(0xFFFFB81C);
  static const accentPurple = Color(0xFFAF52DE);
  static const backgroundWhite = Color(0xFFFFFFFF);
  static const backgroundGray = Color(0xFFF5F5F5);
  static const textPrimary = Color(0xFF000000);
  static const textSecondary = Color(0xFF737373);
}
```

#### Theme Implementation
```dart
ThemeData lightTheme = ThemeData(
  useMaterial3: true,
  colorScheme: ColorScheme.fromSeed(
    seedColor: SafeAlertColors.emergencyRed,
    brightness: Brightness.light,
  ),
  appBarTheme: AppBarTheme(
    centerTitle: true,
    elevation: 0,
    backgroundColor: SafeAlertColors.backgroundWhite,
  ),
  cardTheme: CardTheme(
    elevation: 2,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
    ),
  ),
  bottomSheetTheme: BottomSheetThemeData(
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(20),
      ),
    ),
  ),
);
```

#### Emergency Button Component
```dart
class EmergencyButton extends StatelessWidget {
  final EmergencyButtonConfig config;
  final VoidCallback onPressed;
  
  const EmergencyButton({
    required this.config,
    required this.onPressed,
  });
  
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showConfirmation(context),
      onPanStart: (_) => _startHoldTimer(),
      onPanEnd: (_) => _cancelHoldTimer(),
      child: Container(
        width: double.infinity,
        padding: EdgeInsets.symmetric(vertical: 40, horizontal: 32),
        decoration: BoxDecoration(
          color: config.color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: config.color.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              config.icon,
              size: 64,
              color: Colors.white,
            ),
            SizedBox(height: 12),
            Text(
              config.label,
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

Required screens:

1. Splash and startup check
2. Login
3. Registration
4. Pending approval
5. Emergency home
6. Emergency confirmation
7. Active emergency tracking
8. Map and nearby facilities
9. Facility details
10. IoT device pairing
11. Emergency history
12. Settings
13. Permission education screens
14. Notification detail deep link

---

### 16.2.1 Detailed Screen Specifications

Each mobile screen uses consistent layout: sidebar navigation (left), content area (right), bottom action bar (when applicable).

#### 1. Splash and Startup Check
**Layout:**
- Full-screen gradient background (Red to Purple diagonal)
- App logo centered at top (80px height)
- Loading spinner or welcome animation
- Permission checklist overlay (location, camera, Bluetooth, notifications)
- "Get Started" button at bottom

**Content:**
- Permission status icons (checkmark or prohibition)
- Brief educational tooltip for each permission
- "Continue" button disabled until critical permissions granted

---

#### 2. Login Screen
**Layout:**
- Header: "Welcome Back" (Title 1)
- Email input field (large, 60px height)
- Password input field (with toggle visibility)
- "Remember this device" checkbox with label
- "Forgot Password" link (secondary text)
- Login button (full width, primary color)
- Footer: "Don't have an account? Register link"

**Validation:**
- Real-time email format check
- Password strength indicator
- Clear error messages

---

#### 3. Registration Screen
**Layout:**
- Two-column grid for desktop, single column for mobile
- Section headers with icons
- Input fields with floating labels
- File upload zones (dashed border, drag-and-drop)
- Live camera preview for face capture
- Consent checkbox at bottom

**Fields:**
- Full name (required)
- Date of birth (computed age display)
- Contact number (with country code picker)
- Email (validated)
- Password (min 8 characters, strength indicator)
- Address/municipality
- Proof of residency upload (ID image/PDF)
- Live face capture (camera preview)
- Consent checkbox

---

#### 4. Pending Approval Screen
**Layout:**
- Header: "Your Registration is Pending"
- Illustration/icon of review process
- Status timeline: Submitted → Reviewing → Approved
- Estimated wait time display
- Support contact link
- Logout button at bottom

---

#### 5. Emergency Home Screen
**Layout:**
- Header: User name + profile icon
- Emergency buttons grid (4 large cards, 2 columns)
- Status section: Device status, active emergency indicator
- Quick stats: Total emergencies sent, average response time
- Bottom navigation or FAB for quick action

**Emergency Buttons:**
- Medical (Red)
- Crime (Purple)
- Fire (Orange)
- General SOS (Blue)

---

#### 6. Emergency Confirmation Screen
**Layout:**
- Large emergency icon at top
- Title: Emergency type (e.g., "Medical Emergency")
- Location display with pin icon
- Timestamp display
- Cancel button (destructive, red)
- Educational note: "Our team is notified immediately"
- Progress indicator showing steps remaining

---

#### 7. Active Emergency Tracking Screen
**Layout:**
- Header: Emergency type + status badge
- Map full-screen with responder marker when assigned
- Status timeline at top or bottom
- Contact info card
- Notes/text area for updates
- Share location toggle
- Emergency type filter chip bar

**Status Display:**
- Sent → Waiting for responder (amber badge)
- Responder assigned (blue badge)
- Responder on the way (green badge with pulse)
- Responder nearby (green badge with proximity indicator)
- Response submitted
- Resolved (green badge)

---

#### 8. Map and Nearby Facilities Screen
**Layout:**
- Map container (full viewport minus header/footer)
- Header with location button, search
- Filter chip bar (facility types)
- Marker popup details on tap
- Distance and contact info overlay

**Markers:**
- Hospitals: Green cross icon
- Police stations: Blue shield icon
- Fire departments: Orange fire icon
- Rescue stations: Purple star icon

---

#### 9. Facility Details Screen
**Layout:**
- Header: Facility name + type badge
- Map showing facility location
- Contact card with call button
- Distance indicator
- Operating hours
- Get Directions button
- Back button at top

---

#### 10. IoT Device Pairing Screen
**Layout:**
- Header: "Pair Panic Button"
- Status: Scanning / Paired / Disconnected
- Device info card when paired:
  - Device name
  - Device ID
  - Battery level with icon
  - Firmware version
  - Last seen timestamp
- Pair button (scanning state)
- Unpair button (destructive)
- Manual test button
- Reconnection status indicator

---

#### 11. Emergency History Screen
**Layout:**
- Header: "Emergency History"
- List of past emergencies
- Each item shows:
  - Type icon
  - Date/time
  - Status
  - Responder name (if assigned)
  - Resolution notes (resolved)
- Pull-to-refresh
- Export to PDF option

---

#### 12. Settings Screen
**Layout:**
- Header: "Settings"
- Groups:
  - Account (edit profile, change password)
  - Device (BLE device management)
  - Notifications (toggle by type)
  - Privacy (data settings, clear cache)
  - About (version, help, support)
- Toggle switches for preferences
- Section dividers

---

### 16.3 MobileForResponder Detailed Screens

Each responder screen uses: sidebar navigation, full-width content, action buttons at bottom.

#### 1. Splash and Startup Check
Same as User app but with responder-specific branding (agency logo).

---

#### 2. Login Screen
Same as User app login.

---

#### 3. Registration Screen
**Additional fields vs User:**
- Agency type (police, fire, medical, rescue, other)
- Station/department name
- Position/role
- Coverage area
- Professional credential upload
- Credential number
- Face capture (required)

---

#### 4. Pending Approval Screen
Same as User app.

---

#### 5. On-Duty Toggle Screen
**Layout:**
- Header: "On Duty Status"
- Large toggle switch (On/Off)
- Status indicator (green when on, gray when off)
- Current duty time display
- Warning message when off duty
- Emergency alert if on duty without assignment

---

#### 6. Active Emergency Map Screen
**Layout:**
- Header: "Active Emergencies"
- Filter panel (type, status, priority)
- Map with emergency markers
- List of available emergencies (scrollable)
- Tap marker → open emergency detail
- FAB: "My Location" refresh

**Emergency Markers:**
- Color by type (same as user app)
- Priority indicated by pulsing intensity
- Assigned emergencies show responder avatar
- Distance chip below marker

---

#### 7. Emergency Filter Panel
**Layout:**
- Horizontal scroll chips
- Type filter: Medical, Crime, Fire, General SOS
- Status filter: All, Pending, Assigned, On the Way
- Priority filter: All, High, Critical
- Distance sort option
- Reset button

---

#### 8. Emergency Detail Screen
**Layout:**
- Header: Emergency type + status badge
- Victim information card
- Location map with pin
- Timestamp display
- Distance indicator
- Contact card
- Notes section
- Timeline of events

---

#### 9. Route Guidance Screen
**Layout:**
- Full-screen map with route overlay
- Navigation button (large, bottom)
- ETA display
- Current speed indicator
- Turn-by-turn instructions (expandable)
- Pause/Resume navigation controls
- Report arrival button

---

#### 10. Response Report Form
**Layout:**
- Header: "Response Report"
- Arrival timestamp (auto-filled)
- Situation notes (text area)
- Actions taken (checklist)
- Additional notes
- Photo upload (optional)
- Submit button (full width)

---

#### 11. Notification Detail Deep Link
Tapping notification opens relevant screen with deep link parameters.

---

#### 12. Settings Screen
Same as User app settings.

---

### 16.4 AdminWeb Detailed Screens

Admin web uses responsive layout: left sidebar navigation (~250px), header bar, main content area.

#### 1. Admin Login Screen
**Layout:**
- Centered card on gradient background
- Logo at top
- Email/username and password fields
- Login button
- "Forgot Password" link
- Footer with support contact

---

#### 2. Overview Dashboard Screen
**Layout:**
- Header: "Dashboard"
- Statistics row (4 cards):
  - Active emergencies
  - Pending approvals
  - Responders on duty
  - Average response time
- Live map section
- Recent activity feed
- Alerts section (stale GPS, high-priority emergencies)

**Map Features:**
- Toggle for responder locations
- Emergency markers
- Type/priority filters
- Time range selector

---

#### 3. Pending User Approvals Screen
**Layout:**
- Header: "User Approvals"
- Filter tabs: All, Pending, Approved, Rejected
- Card grid for pending applications
- Each card shows:
  - Applicant photo
  - Full name
  - Contact info
  - Submission date
  - Status badge

**Card Actions:**
- View details button
- Approve button
- Reject button (with reason modal)

---

#### 4. Pending Responder Approvals Screen
Same layout as User Approvals but with responder-specific fields visible.

---

#### 5. Live Emergency Map Screen
**Layout:**
- Header: "Live Map"
- Filter sidebar (type, status, agency)
- Main map area
- Emergency detail drawer (right side)
- Responder count indicator

**Detail Drawer:**
- Emergency info
- Current location
- Status timeline
- Assigned responder (if any)
- Resolve action (admin only)

---

#### 6. Emergency Detail Drawer
**Content:**
- Emergency type + priority badge
- Victim information
- Location with map thumbnail
- Status timeline
- Timeline events list
- Contact information
- Notes
- Actions: Assign responder, Resolve, Cancel

---

#### 7. Active Responders Screen
**Layout:**
- Header: "Active Responders"
- List of responders on duty
- Each row shows:
  - Responder photo and name
  - Agency/position
  - Current location (with coordinates)
  - Status indicator
  - Last update timestamp
- Map toggle
- Filter by agency

---

#### 8. Emergency Records Screen
**Layout:**
- Header: "Emergency Records"
- Date range picker
- Filter sidebar (type, status, date range)
- Table view with sortable columns:
  - ID
  - Victim name
  - Type
  - Status
  - Created date
  - Resolved date
  - Actions (view, export)
- Pagination controls
- Export to PDF/CSV

---

#### 9. Analytics Screen
**Layout:**
- Header: "Analytics"
- Date range selector
- Charts row:
  - Monthly emergency counts (bar chart)
  - Response time by type (grouped bar)
  - Resolution trends (line chart)
- Tables:
  - Top responders by response count
  - Emergency hotspots (geospatial)
- Export button

---

#### 10. Audit Logs Screen
**Layout:**
- Header: "Audit Logs"
- Search bar
- Filter sidebar (actor, action, date)
- Table with:
  - Timestamp
  - Actor name and role
  - Action
  - Target
  - Details
- Pagination
- Export option

---

#### 11. Settings Screen
**Layout:**
- Header: "Settings"
- Sections:
  - System configuration
  - Emergency categories
  - Coverage areas
  - Email templates
  - Logo upload
- Save button

---

### 16.5 Responsive Layout Guidelines

**Desktop (>1024px):**
- Left sidebar navigation (fixed ~250px)
- Top header bar (search, user menu, notifications)
- Main content area (scrollable)

**Tablet (768-1024px):**
- Collapsible sidebar (hamburger menu)
- Single column content
- Cards stack vertically
- Charts resize proportionally

**Mobile (<768px):**
- Hamburger navigation (bottom or top)
- Full-width cards
- Simplified charts (stacked instead of grouped)
- Touch-optimized targets (minimum 44x44px)
- Bottom sheet overlays for confirmations

---

### 16.6 Iconography

All icons use Material Design 3 icon set with custom additions.

#### Emergency Type Icons
- **Medical**: `medical_services` (red)
- **Crime**: `security` (purple)
- **Fire**: `emergency` (orange)
- **General SOS**: `call_sos` (blue)
- **Police**: `security` (blue)
- **Fire Department**: `emergency` (orange)
- **Hospital**: `local_hospital` (green)
- **Fire Station**: `local_fire_department` (orange)
- **Police Station**: `local_police` (blue)
- **Ambulance**: `ev_station` (green)

#### Status Icons
- **Active**: `radio_button_checked` (green)
- **Pending**: `hourglass_empty` (amber)
- **Complete**: `check_circle` (green)
- **Error**: `error` (red)
- **Warning**: `warning` (amber)
- **Info**: `info` (blue)
- **Location**: `my_location` (blue)
- **GPS**: `gps_fixed` (green)

#### Navigation Icons
- **Home**: `home` (white)
- **Search**: `search` (white)
- **Notifications**: `notifications` (white)
- **Settings**: `settings` (white)
- **Profile**: `person` (white)
- **Menu**: `menu` (white)
- **Close**: `close` (white)
- **Arrow Back**: `arrow_back` (white)
- **Arrow Forward**: `arrow_forward` (white)

**Icon Size Standards:**
- Large: 64px (emergency buttons)
- Medium: 48px (navigation, cards)
- Small: 24px (toolbar, chips)
- Tiny: 18px (secondary actions)

---

### 16.7 Visual Style Guide

#### Shapes and Corners
- **Small**: 4px (buttons, small chips)
- **Medium**: 8px (inputs, standard cards)
- **Large**: 12px (emergency buttons, primary cards)
- **X-Large**: 20px (bottom sheets, modals)
- **Round**: 50px (circular elements, avatars)

#### Spacing System
- **xs**: 4px (tight spacing)
- **sm**: 8px (compact spacing)
- **md**: 16px (standard spacing)
- **lg**: 24px (section spacing)
- **xl**: 32px (page spacing)
- **2xl**: 48px (hero spacing)

#### Shadows
```dart
BoxShadow lightShadow = BoxShadow(
  color: Colors.black.withValues(alpha: 0.08),
  blurRadius: 4,
  offset: Offset(0, 2),
);

BoxShadow mediumShadow = BoxShadow(
  color: Colors.black.withValues(alpha: 0.12),
  blurRadius: 8,
  offset: Offset(0, 4),
);

BoxShadow largeShadow = BoxShadow(
  color: Colors.black.withValues(alpha: 0.16),
  blurRadius: 12,
  offset: Offset(0, 6),
);
```

#### Gradients
- **Primary**: Red (#E52834) to Purple (#AF52DE), 135deg
- **Emergency**: Red (#E52834) to Dark Red (#9E1B24), 45deg
- **Success**: Green (#34C759) to Light Green (#84D768), 90deg
- **Warning**: Amber (#FFB81C) to Orange (#FF9800), 45deg

---

### 16.8 Required Screen Lists and Acceptance Criteria
8. Emergency detail
9. Route guidance
10. Response report form
11. Notification detail deep link
12. Settings

### 16.4 AdminWeb screens

Required screens:

1. Admin login
2. Overview dashboard
3. Pending user approvals
4. Pending responder approvals
5. Live emergency map
6. Emergency detail drawer
7. Active responders
8. Emergency records
9. Analytics
10. Audit logs
11. Settings

Acceptance criteria:

- All screens render correctly on target sizes.
- Forms show field-level validation.
- Empty states explain what to do next.
- Error states include retry where applicable.
- Emergency buttons are reachable with one hand on common phone sizes.

---


---

## A. Design System Appendices

This appendix contains the complete visual design system extracted from the SafeAlert Figma design.

### A.1 Color Palette

| Role | Hex Code | RGBA | Usage |
|------|----------|------|-------|
| Primary Red | `#E52834` | rgba(229, 40, 52, 1) | Emergency actions, danger, critical alerts |
| Primary Blue | `#0A84FF` | rgba(10, 132, 255, 1) | Navigation, responder actions, links |
| Primary Green | `#34C759` | rgba(52, 199, 89, 1) | Safe, resolved, connected states |
| Primary Amber | `#FFB81C` | rgba(255, 184, 28, 1) | Warning, pending, stale states |
| Primary Purple | `#AF52DE` | rgba(175, 82, 222, 1) | Secondary accents, decorative elements |
| Background White | `#FFFFFF` | rgba(255, 255, 255, 1) | Primary content backgrounds |
| Background Gray | `#F5F5F5` | rgba(245, 245, 245, 1) | Secondary backgrounds, cards |
| Background Dark | `#1C1C1E` | rgba(28, 28, 30, 1) | Dark mode backgrounds |
| Text Primary | `#000000` | rgba(0, 0, 0, 1) | Primary text content |
| Text Secondary | `#737373` | rgba(115, 115, 115, 1) | Subtitles, captions, helper text |

### A.2 Typography Scale

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|--------|
| Title 1 | 34px | Bold | 1.2 | Page headers, major sections |
| Title 2 | 28px | Semibold | 1.3 | Screen headers |
| Title 3 | 22px | Semibold | 1.4 | Section headers |
| Body Large | 18px | Regular | 1.5 | Callouts, labels |
| Body | 17px | Regular | 1.5 | Main content text |
| Body Small | 14px | Regular | 1.4 | Helper text, captions |
| Caption | 12px | Regular | 1.3 | Metadata, hints |

### A.3 Emergency Button Specifications

| Type | Icon | Color | Priority | Hold Timeout |
|------|------|-------|----------|--------------|
| Medical | `medical_services` | Red (`#E52834`) | High | 2 seconds |
| Crime | `security` | Purple (`#AF52DE`) | Critical | 2 seconds |
| Fire | `emergency` | Orange (`#FF9800`) | Critical | 2 seconds |
| General SOS | `call_sos` | Blue (`#0A84FF`) | High | 2 seconds |

**Button Dimensions:**
- Width: 100% of container (minimum 340px)
- Padding: 40px vertical, 32px horizontal
- Border radius: 12px
- Icon size: 64px
- Label font size: 24px

### A.4 Card Specifications

| Card Type | Border Radius | Elevation | Background | Usage |
|-----------|---------------|-----------|------------|-------|
| Emergency Button | 12px | Medium | Type color | Emergency actions |
| Facility Card | 12px | Medium | White | Map results |
| Approval Card | 12px | Medium | White | Pending reviews |
| Emergency Status | 12px | Medium | White | Timeline items |
| Stats Card | 12px | Light | Gray (`#F5F5F5`) | Dashboard |

### A.5 Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight spacing, icons |
| `sm` | 8px | Compact spacing |
| `md` | 16px | Standard spacing |
| `lg` | 24px | Section spacing |
| `xl` | 32px | Page spacing |
| `2xl` | 48px | Hero spacing |

### A.6 Border Radius System

| Token | Radius | Usage |
|-------|--------|-------|
| `sm` | 4px | Small buttons, chips |
| `md` | 8px | Inputs, standard cards |
| `lg` | 12px | Primary cards, emergency buttons |
| `xl` | 20px | Bottom sheets, modals |
| `full` | 50px | Circles, avatars |

### A.7 Shadow System

| Depth | Blur Radius | Offset Y | Color Alpha | Usage |
|-------|-------------|----------|-------------|-------|
| 1 | 4px | 2px | 8% | Subtle elevation |
| 2 | 8px | 4px | 12% | Medium elevation |
| 3 | 12px | 6px | 16% | Primary elevation |
| 4 | 20px | 12px | 20% | Modal backdrops |

### A.8 Gradient Definitions

| Name | Start Color | End Color | Angle | Usage |
|------|-------------|-----------|-------|-------|
| Primary | `#E52834` | `#AF52DE` | 135deg | Gradients, backgrounds |
| Emergency | `#E52834` | `#9E1B24` | 45deg | Emergency actions |
| Success | `#34C759` | `#84D768` | 90deg | Completed actions |
| Warning | `#FFB81C` | `#FF9800` | 45deg | Warnings, alerts |

---

---

## B. Screen Layout Standards

### B.1 Mobile App Layout

All mobile screens follow this layout structure:

```
┌─────────────────────────────────────────┐
│  Navigation Drawer (when open)          │
│  ┌─────────────────────────────────────┐│
│  │  [Logo]                             ││
│  │  [User Profile]                     ││
│  │  [Settings]                         ││
│  │  [Help]                             ││
│  │  [Logout]                           ││
│  └─────────────────────────────────────┘│
│           │                              │
├───────────┼──────────────────────────────┤
│           │  [Content Area]              │
│           │  ┌─────────────────────────┐ │
│           │  │ [Top App Bar]           │ │
│           │  ├─────────────────────────┤ │
│           │  │   [Main Content]        │ │
│           │  │                         │ │
│           │  │                         │ │
│           │  │                         │ │
│           │  ├─────────────────────────┤ │
│           │  │   [Bottom Action Bar]   │ │
│           │  └─────────────────────────┘ │
│           │                              │
│           │  Status Bar                  │
└───────────┴──────────────────────────────┘
```

**Content Area Constraints:**
- Max width: 600px (wraps to single column on smaller screens)
- Padding: 16px on sides
- Min height: Full screen minus app bars

### B.2 Admin Web Layout

Admin web follows a sidebar layout:

```
┌──────────────────────────────────────────────────────────────┐
│  [Header Bar]                                                 │
│  ┌─────────────┬─────────────────────────────────────────────┐
│  │             │                                              │
│  │  Sidebar    │                                              │
│  │  Navigation │   [Main Content Area]                       │
│  │             │                                              │
│  │             │                                              │
│  │             │                                              │
│  │             │                                              │
│  └─────────────┴─────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

**Sidebar:**
- Width: 250px (fixed)
- Height: Full screen minus header
- Navigation items: Full height, icon + text

**Header Bar:**
- Height: 56px
- Content: Search bar (left), User menu (right)

**Main Content:**
- Flex grow: 1
- Padding: 24px
- Min height: 0 (fills remaining space)

### B.3 Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|------------|-------|-----------------|
| `xs` | < 576px | Single column, bottom nav |
| `sm` | 576-768px | Single column, hamburger nav |
| `md` | 768-1024px | Two columns where appropriate |
| `lg` | 1024-1280px | Standard sidebar |
| `xl` | > 1280px | Full sidebar, multi-column |

---

---

## C. Component Implementation Examples

### C.1 Flutter Theme Setup

```dart
// lib/theme/safe_alert_theme.dart
import 'package:flutter/material.dart';

class SafeAlertTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: Colors.red,
        brightness: Brightness.light,
      ),
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.white,
        titleTextStyle: TextStyle(
          color: Colors.black,
          fontSize: 20,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardTheme(
        elevation: 2,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.grey[100],
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
        contentPadding: EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
      ),
    );
  }
}
```

### C.2 Emergency Button Component

```dart
// lib/components/emergency_button.dart
import 'package:flutter/material.dart';

enum EmergencyType {
  medical('Medical', Colors.red, Icons.medical_services),
  crime('Crime', Colors.purple, Icons.security),
  fire('Fire', Colors.orange, Icons.emergency),
  sos('General SOS', Colors.blue, Icons.call_sos);

  const EmergencyType(
    this.label,
    this.color,
    this.icon,
  );

  final String label;
  final Color color;
  final IconData icon;
}

class EmergencyButton extends StatelessWidget {
  final EmergencyType type;
  final VoidCallback onPressed;
  final bool isLoading;

  const EmergencyButton({
    super.key,
    required this.type,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _showConfirmationDialog,
      onLongPress: () {
        _startHoldTimer();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 32),
        decoration: BoxDecoration(
          color: type.color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: type.color.withValues(alpha: 0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              type.icon,
              size: 64,
              color: Colors.white,
            ),
            const SizedBox(height: 12),
            Text(
              type.label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  void _showConfirmationDialog() {
    showModalBottomSheet(
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Trigger $type Emergency?',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 16),
              Text(
                'Your location will be shared with the nearest responders.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      icon: const Icon(Icons.cancel, size: 20),
                      label: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        onPressed();
                      },
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 16),
                      ),
                      icon: const Icon(Icons.send, size: 20),
                      label: const Text('Send'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### C.3 Status Badge Widget

```dart
// lib/widgets/status_badge.dart
import 'package:flutter/material.dart';

enum EmergencyStatus {
  sent,
  awaitingResponder,
  responderAssigned,
  responderOnTheWay,
  responderNearby,
  responseSubmitted,
  resolved;

  Color get badgeColor {
    switch (this) {
      case sent:
      case awaitingResponder:
        return Colors.amber;
      case responderAssigned:
      case responderOnTheWay:
      case responderNearby:
        return Colors.green;
      case responseSubmitted:
        return Colors.grey;
      case resolved:
        return Colors.green;
    }
  }

  IconData get icon {
    switch (this) {
      case sent:
      case awaitingResponder:
        return Icons.hourglass_empty;
      case responderAssigned:
        return Icons.local_police;
      case responderOnTheWay:
      case responderNearby:
        return Icons.location_on;
      case responseSubmitted:
        return Icons.check;
      case resolved:
        return Icons.check_circle;
    }
  }

  String get label => '';
}

class StatusBadge extends StatelessWidget {
  final EmergencyStatus status;

  const StatusBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: status.badgeColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: status.badgeColor,
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            status.icon,
            size: 14,
            color: status.badgeColor,
          ),
          const SizedBox(width: 6),
          Text(
            status.label,
            style: TextStyle(
              color: status.badgeColor,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
```

---

---

## D. Design Do's and Don'ts

### Do:
- Use large, clearly labeled emergency buttons
- Show status with both color and text/icon
- Provide clear feedback on button presses
- Use bottom sheets for confirmations
- Keep emergency actions thumb-reachable
- Show loading states for all async operations

### Don't:
- Don't use color alone to convey status
- Don't hide critical information
- Don't use destructive colors for non-critical actions
- Don't make touch targets smaller than 44x44px
- Don't use animations that could confuse in emergencies
- Don't rely on text-only labels for icons

---

**Appendix End**
