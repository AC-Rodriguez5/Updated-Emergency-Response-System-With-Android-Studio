# Emergency Response System - Status & Testing Guide

## System Architecture

```
┌──────────────────┐     HTTP/REST      ┌─────────────────────┐     MongoDB Atlas
│   Mobile App     │ ──────────────────▶│   Backend Server    │◀──────────────────▶
│   (Expo Go)      │                    │   (Express.js)      │   Cloud Database
│   Port: 8081     │ ◀─────────────────│   Port: 5000        │
└──────────────────┘    JSON Response   └─────────────────────┘
        │                                        ▲
        │                                        │
        ▼                                        │
   User sends                            ┌───────┴───────┐
   emergency alerts                      │               │
                               ┌─────────────────┐   WebSocket
                               │   Web Dashboard │   (Socket.io)
                               │   (React Vite)  │
                               │   Port: 5173    │
                               └─────────────────┘
                                  Responders view
                                  & manage alerts
```

## Current Status: ✅ FULLY CONNECTED

### Backend (Express.js + MongoDB)
- **Port:** 5000
- **Database:** MongoDB Atlas (cluster0.6owja5b.mongodb.net)
- **Status:** Connected and running

#### API Endpoints:
- `POST /api/auth/register/user` - Register new user
- `POST /api/auth/login/user` - User login
- `POST /api/auth/register/responder` - Register new responder
- `POST /api/auth/login/responder` - Responder login
- `GET /api/alerts` - Get all alerts
- `POST /api/alerts` - Create new alert
- `PATCH /api/alerts/:id/respond` - Responder claims alert
- `PATCH /api/alerts/:id/resolve` - Resolve alert
- `GET /api/alerts/stats` - Get alert statistics

### Web Dashboard (React + Vite)
- **Port:** 5173
- **Features:**
  - Responder login/signup with MongoDB auth
  - Real-time map with OpenStreetMap
  - Alert list with respond/resolve actions
  - Analytics dashboard with stats
  - 10-second polling for live updates

### Mobile App (Expo Go)
- **Port:** 8081
- **Features:**
  - User login/signup with MongoDB auth
  - Emergency button with categories
  - GPS location tracking
  - Send alerts to backend

---

## Testing Guide

### Step 1: Start Backend
```bash
cd backend
npm run dev
```
Expected output: `✅ Connected to MongoDB Atlas`

### Step 2: Start Web Dashboard
```bash
cd web
npm run dev
```
Open: http://localhost:5173

### Step 3: Start Mobile App
```bash
cd app
npx expo start
```
Scan QR code with Expo Go app

### Step 4: Configure Mobile App IP
**IMPORTANT:** Update the API_URL in these files with your computer's IP:

1. `app/src/screens/UserLogin.tsx` - Line 17
2. `app/src/screens/UserDashboard.tsx` - Line 25

Find your IP:
- **Windows:** `ipconfig` → Look for IPv4 Address
- **Mac/Linux:** `ifconfig` → Look for inet address

Replace `192.168.1.100` with your actual IP.

---

## Test Flow

### 1. Register a Responder (Web)
1. Open http://localhost:5173
2. Click "Sign Up"
3. Fill in:
   - Name: Test Responder
   - Email: responder@test.com
   - Password: test123
   - Badge ID: B001
   - Department: Police
4. Click "Create Account"

### 2. Register a User (Mobile)
1. Open Expo Go app
2. Click "Sign Up"
3. Fill in:
   - Name: Test User
   - Email: user@test.com
   - Phone: +1234567890
   - Password: test123
4. Click "Create Account"

### 3. Send Emergency Alert (Mobile)
1. Log in with user@test.com
2. Select emergency category (e.g., "Medical")
3. Tap "SEND ALERT"
4. Confirm the alert

### 4. View & Respond (Web)
1. Log in with responder@test.com
2. See alert appear on map (red marker)
3. Click alert in "Alert List" tab
4. Click "Respond" to claim alert
5. Click "Resolve" when done

---

## Database Collections (MongoDB Atlas)

### users
```json
{
  "name": "String",
  "email": "String (unique)",
  "phone": "String",
  "password": "String (hashed)",
  "contacts": ["String"],
  "createdAt": "Date"
}
```

### responders
```json
{
  "name": "String",
  "email": "String (unique)",
  "password": "String (hashed)",
  "badgeId": "String (unique)",
  "department": "String",
  "isOnDuty": "Boolean",
  "createdAt": "Date"
}
```

### alerts
```json
{
  "type": "String (medical/fire/crime/accident/natural/other)",
  "description": "String",
  "location": {
    "latitude": "Number",
    "longitude": "Number",
    "address": "String (optional)"
  },
  "userId": "ObjectId (ref: User)",
  "priority": "String (low/medium/high/critical)",
  "status": "String (pending/responding/resolved)",
  "responderId": "ObjectId (ref: Responder, optional)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

---

## Troubleshooting

### Mobile app can't connect to backend
- Ensure your phone and computer are on the same WiFi network
- Check the API_URL uses your computer's local IP (not localhost)
- Verify backend is running on port 5000

### Web dashboard not showing alerts
- Check browser console for errors
- Verify backend is running
- Check CORS is enabled (it is by default)

### Login/Signup not working
- Check MongoDB connection in backend terminal
- Verify the email isn't already registered
- Check for validation errors in response

### Map not loading
- Ensure internet connection (OpenStreetMap tiles)
- Try refreshing the page
- Check browser console for errors
