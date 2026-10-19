import { beforeAll, describe, expect, it } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

import {
  issueChallenge,
  peekChallengeAnswer,
} from '../../shared/captcha/index.js';

/**
 * The order of the gates on sign-in and registration.
 *
 * This is not a detail of wiring. The login limiter allows five failed attempts
 * per fifteen minutes, and a rejected security code is a failed attempt — so
 * with the limiter in front, five mistyped codes locked a resident out of an
 * emergency app without them ever reaching a password field. The challenge has
 * to be marked first, and nothing about that is visible by reading the route.
 *
 * Registration has the same shape with a twist: its token arrives in a header
 * so it can be read before multer buffers two photos, and the guard further
 * down has to stand aside rather than spend the same single-use challenge a
 * second time.
 */

/*
  Built once. Re-importing the router per test would recompile the Mongoose
  models it pulls in, which Mongoose refuses; the provider is pinned in
  vitest.config.ts instead.
*/
let app: Express;

async function buildApp(): Promise<Express> {
  const { default: authRoutes } = await import('./auth.routes.js');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(
    (
      err: { statusCode?: number; code?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(err.statusCode ?? 500)
        .json({ error: { code: err.code, message: err.message } });
    },
  );
  return app;
}

const credentials = {
  email: 'resident@tanzalert.test',
  password: 'whatever-it-is',
  role: 'user' as const,
};

beforeAll(async () => {
  app = await buildApp();
});

describe('signing in', () => {
  it('does not spend a login attempt on a mistyped security code', async () => {
    // Comfortably past the five the limiter allows.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ ...credentials, captchaToken: 'no-such-challenge:WRONG' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CAPTCHA_INVALID');
    }
  });

  it('refuses a sign-in that skips the check entirely', async () => {
    const response = await request(app).post('/api/auth/login').send(credentials);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CAPTCHA_REQUIRED');
  });

  it('never challenges a responder, who has no way to raise one', async () => {
    // A deliberately malformed address, so this is turned back by validation
    // further down the chain instead of reaching a database that is not here.
    // Whatever stops it, it is not the captcha.
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-address', password: 'x', role: 'responder' });

    expect(response.body.error?.code).not.toBe('CAPTCHA_REQUIRED');
    expect(response.body.error?.code).not.toBe('CAPTCHA_INVALID');
  });
});

describe('registering', () => {
  /** A real challenge, as the app would have just fetched and read. */
  function solved(): string {
    const { id } = issueChallenge();
    return `${id}:${peekChallengeAnswer(id)}`;
  }

  it('turns back a wrong code before the photos are read', async () => {
    const response = await request(app)
      .post('/api/auth/register/user')
      .set('x-captcha-token', 'no-such-challenge:WRONG');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CAPTCHA_INVALID');
  });

  it('does not spend a registration attempt on a mistyped code', async () => {
    // Past the ten an hour the limiter allows.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/register/user')
        .set('x-captcha-token', 'no-such-challenge:WRONG');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CAPTCHA_INVALID');
    }
  });

  it('does not spend a correct code twice on the way through', async () => {
    const response = await request(app)
      .post('/api/auth/register/user')
      .set('x-captcha-token', solved());

    /*
      A challenge is spent the moment it is checked. If the guard after the
      upload checked it again it would find it already answered and fail a
      registration that had done nothing wrong, so whatever turns this back
      must be the missing details, never the security check.
    */
    expect(response.body.error?.code).not.toBe('CAPTCHA_INVALID');
    expect(response.body.error?.code).not.toBe('CAPTCHA_REQUIRED');
  });

  it('still reads the code from the body, for a client that predates the header',
    async () => {
      const response = await request(app)
        .post('/api/auth/register/user')
        .field('captchaToken', 'no-such-challenge:WRONG');

      // Reached the guard after the upload, which is where an older app's
      // token lives.
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('CAPTCHA_INVALID');
    });

  it('refuses a registration carrying no code at all', async () => {
    const response = await request(app).post('/api/auth/register/user');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CAPTCHA_REQUIRED');
  });
});
