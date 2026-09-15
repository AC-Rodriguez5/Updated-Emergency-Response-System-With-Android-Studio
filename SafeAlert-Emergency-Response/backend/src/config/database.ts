import mongoose from 'mongoose';
import { env } from './environment.ts';
export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoIndex: env.NODE_ENV !== 'production' });
  mongoose.connection.on('error', () => console.error('MongoDB connection error; inspect database health.'));
  console.info('MongoDB connected.');
}
