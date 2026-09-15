import bcrypt from 'bcryptjs';
import AdminUser from '../models/AdminUser.ts';
import { env } from './environment.ts';
export async function seedAdmin(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const email = env.ADMIN_EMAIL.toLowerCase().trim();
  if (await AdminUser.exists({ email })) return;
  await AdminUser.create({
    email, username: env.ADMIN_USERNAME?.toLowerCase(), name: env.ADMIN_NAME,
    passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 12), status: 'approved', role: 'admin',
  });
  console.info('Configured initial administrator created.');
}
export default seedAdmin;
