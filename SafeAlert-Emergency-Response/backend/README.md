# Emergency Response Backend

## Deployment to Render

1. Go to https://render.com and sign up/login
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: emergency-response-backend
   - **Region**: Oregon (US West)
   - **Branch**: main
   - **Root Directory**: backend
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

5. Add Environment Variables:
   - `MONGODB_URI`: your MongoDB Atlas connection string
   - `JWT_SECRET`: a random secure string
   - `NODE_ENV`: production

6. Click "Create Web Service"

Your backend will be available at: `https://emergency-response-backend.onrender.com`

## Local Development

```bash
cd backend
npm install
npm run dev
```

## API Endpoints

- POST /api/auth/register/user
- POST /api/auth/login/user
- POST /api/auth/register/responder
- POST /api/auth/login/responder
- GET /api/alerts
- POST /api/alerts
- PATCH /api/alerts/:id/status
- PATCH /api/alerts/:id/location
- GET /api/contacts/:userId
- POST /api/contacts/:userId
