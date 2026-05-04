# SafeAlert - Emergency Response System

A 3-layer emergency response system with separate applications for Users (mobile) and Responders (web).

## 🏗️ Architecture

```
EmergencyResponse/
├── web/        # React Vite - Responder Portal (Web)
├── app/        # Expo Go - User App (Mobile)
└── backend/    # Express.js - API Server
```

## 🎯 Overview

| Layer | Technology | Port | Target Users |
|-------|------------|------|--------------|
| Web | React + Vite + Tailwind | 3000 | Emergency Responders |
| App | Expo Go (React Native) | 19006 | Citizens/Users |
| Backend | Express.js + TypeScript | 5000 | API Server |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo Go app on your mobile device (for mobile app testing)

### Installation

```bash
# Install dependencies for all projects
cd web && npm install
cd ../app && npm install
cd ../backend && npm install
```

### Running the Applications

**1. Start Backend Server (Required first)**
```bash
cd backend
npm run dev
```
Server runs at `http://localhost:5000`

**2. Start Web (Responder Portal)**
```bash
cd web
npm run dev
```
Opens at `http://localhost:3000`

**3. Start Mobile App**
```bash
cd app
npm start
```
Scan QR code with Expo Go app

## 📱 Features

### User App (Mobile - Expo Go)
- 🔐 User registration & login
- 📍 Real-time location tracking
- 🚨 Emergency type selection (Medical, Fire, Police, Rescue)
- 🆘 SOS button for urgent alerts
- 📲 Push notifications

### Responder Portal (Web - React Vite)
- 🔐 Responder authentication
- 📊 Dashboard with alert statistics
- 📋 Real-time alert list
- 🗺️ Alert location details
- ✅ Respond and resolve alerts

### Backend API
- 🔑 JWT authentication
- 👤 User & Responder management
- 🚨 Alert CRUD operations
- 📡 RESTful API endpoints

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register/user` - Register new user
- `POST /api/auth/register/responder` - Register new responder
- `POST /api/auth/login/user` - User login
- `POST /api/auth/login/responder` - Responder login

### Alerts
- `POST /api/alerts` - Create new alert
- `GET /api/alerts` - Get all alerts
- `GET /api/alerts/:id` - Get alert by ID
- `PATCH /api/alerts/:id/status` - Update alert status

## 🎨 Design

### Web Login (Responders)
- Dark blue gradient theme
- Professional/official appearance
- Badge ID and Department fields
- Shield icon branding

### Mobile Login (Users)
- Red gradient theme (emergency focused)
- Clean, modern mobile UI
- Phone number field
- Safety-focused messaging

## 📂 Project Structure

```
web/
├── src/
│   ├── pages/
│   │   ├── ResponderLogin.tsx
│   │   └── ResponderDashboard.tsx
│   ├── App.tsx
│   └── main.tsx
└── package.json

app/
├── src/
│   └── screens/
│       ├── UserLogin.tsx
│       └── UserDashboard.tsx
├── App.tsx
└── package.json

backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   └── alerts.ts
│   └── index.ts
└── package.json
```

## 🔧 Environment Variables

### Backend (.env)
```
PORT=5000
JWT_SECRET=your-secret-key
```

## 📝 License

MIT License
