import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'NODE_ENV',
  'PORT',
];

const missingEnvVars = requiredEnvVars.filter(
  (envVar) => !process.env[envVar]
);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
  console.error('\nPlease set these variables in your .env file.');
  process.exit(1);
}

// Validate JWT_SECRET length (should be at least 32 characters)
if (process.env.JWT_SECRET?.length < 32) {
  console.warn('⚠️ JWT_SECRET is too short (less than 32 characters). Please use a stronger secret.');
}

// Validate MongoDB connection string
if (!process.env.MONGODB_URI?.startsWith('mongodb')) {
  console.error('❌ MONGODB_URI must start with "mongodb://". Check your connection string.');
  process.exit(1);
}

// Set default values for optional environment variables
process.env.ALLOWED_ORIGINS =
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:3000,https://safealert-demo.firebaseapp.com';

process.env.MAX_FILE_SIZE_MB = process.env.MAX_FILE_SIZE_MB || '10';

process.env.MAX_ALERT_HISTORY_DAYS = process.env.MAX_ALERT_HISTORY_DAYS || '30';

process.env.ESP32_DEVICE_NAME = process.env.ESP32_DEVICE_NAME || 'SafeAlert-BLE';

// Log environment (in development only)
if (process.env.NODE_ENV === 'development') {
  console.log('Environment variables:');
  requiredEnvVars.forEach((envVar) => {
    console.log(`   ${envVar}: ${process.env[envVar]?.substring(0, 20)}...`);
  });
}

export const getConfig = () => ({
  port: parseInt(process.env.PORT) || 5000,
  env: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(','),
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB),
  maxAlertHistoryDays: parseInt(process.env.MAX_ALERT_HISTORY_DAYS),
  esp32DeviceName: process.env.ESP32_DEVICE_NAME,
});

export default {
  validate: () => !missingEnvVars.length,
  getConfig,
};