import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, RequestHandler, Response } from 'express';

/**
 * The human check on the resident app's sign-in and registration.
 *
 * Three of these matter more than the rest: that the built-in challenge works
 * with nothing configured at all, that `none` leaves both routes exactly as
 * they were, and that an unreachable hosted verifier does not lock people out
 * of an emergency system by default.
 */

interface LoadedGuard {
  requireCaptcha: () => RequestHandler;
  captchaEnabled: () => boolean;
  captchaMode: () => 'none' | 'builtin' | 'webview';
}

/**
 * Loads the guard against a named environment.
 *
 * `undefined` unsets a variable, which is how a test asks for the schema's own
 * default rather than whatever the developer happens to have in their .env.
 */
async function loadGuard(
  overrides: Record<string, string | undefined>,
): Promise<LoadedGuard> {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }
  return (await import('./captchaGuard.js')) as unknown as LoadedGuard;
}

/** Runs the middleware and resolves with whatever it passed to `next`. */
function run(
  middleware: RequestHandler,
  req: Partial<Request>,
): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(
      { body: {}, header: () => undefined, ip: '127.0.0.1', method: 'POST', path: '/auth/login', ...req } as Request,
      {} as Response,
      resolve as () => void,
    );
  });
}

function answerWith(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('requireCaptcha', () => {
  it('does nothing at all when the check is switched off', async () => {
    const { requireCaptcha, captchaEnabled, captchaMode } = await loadGuard({
      CAPTCHA_PROVIDER: 'none',
    });

    expect(captchaEnabled()).toBe(false);
    expect(captchaMode()).toBe('none');
    await expect(run(requireCaptcha(), { body: {} })).resolves.toBeUndefined();
  });

  it('stays off when a provider is named but the secret is missing', async () => {
    const { captchaEnabled } = await loadGuard({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: '',
    });

    expect(captchaEnabled()).toBe(false);
  });

  it('refuses a request with no token once it is switched on', async () => {
    const { requireCaptcha } = await loadGuard({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: 'secret',
    });

    const passed = await run(requireCaptcha(), { body: {} });
    expect((passed as { code?: string }).code).toBe('CAPTCHA_REQUIRED');
  });

  it('lets a solved challenge through', async () => {
    const { requireCaptcha } = await loadGuard({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: 'secret',
    });
    answerWith({ success: true });

    await expect(
      run(requireCaptcha(), { body: { captchaToken: 'a-solved-token' } }),
    ).resolves.toBeUndefined();
  });

  it('refuses one the provider rejects', async () => {
    const { requireCaptcha } = await loadGuard({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: 'secret',
    });
    answerWith({ success: false, 'error-codes': ['timeout-or-duplicate'] });

    const passed = await run(requireCaptcha(), { body: { captchaToken: 'stale-token' } });
    expect((passed as { code?: string }).code).toBe('CAPTCHA_INVALID');
  });

  it('accepts the token from a header, for a client that cannot add a field', async () => {
    const { requireCaptcha } = await loadGuard({
      CAPTCHA_PROVIDER: 'hcaptcha',
      CAPTCHA_SECRET: 'secret',
    });
    answerWith({ success: true });

    await expect(
      run(requireCaptcha(), {
        body: {},
        header: (name: string) => (name === 'x-captcha-token' ? 'a-solved-token' : undefined),
      } as Partial<Request>),
    ).resolves.toBeUndefined();
  });

  it('lets people in when the verifier itself is unreachable', async () => {
    const { requireCaptcha } = await loadGuard({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: 'secret',
      CAPTCHA_FAIL_OPEN: 'true',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    // Locking every responder and resident out of an emergency system to stop
    // a hypothetical bot is the worse failure. Rate limits still apply.
    await expect(
      run(requireCaptcha(), { body: { captchaToken: 'a-solved-token' } }),
    ).resolves.toBeUndefined();
  });

  it('refuses instead when the deployment asks it to', async () => {
    const { requireCaptcha } = await loadGuard({
      CAPTCHA_PROVIDER: 'turnstile',
      CAPTCHA_SECRET: 'secret',
      CAPTCHA_FAIL_OPEN: 'false',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const passed = await run(requireCaptcha(), { body: { captchaToken: 'a-solved-token' } });
    expect((passed as { code?: string }).code).toBe('CAPTCHA_UNAVAILABLE');
  });
});

describe('the built-in challenge', () => {
  /** The guard and the challenge store, sharing one module registry. */
  async function loadBuiltin(): Promise<{
    guard: LoadedGuard;
    captcha: typeof import('../captcha/index.js');
  }> {
    const guard = await loadGuard({ CAPTCHA_PROVIDER: 'builtin' });
    // Imported after the reset inside loadGuard, so this is the same instance
    // the guard holds rather than a second, empty store.
    const captcha = await import('../captcha/index.js');
    return { guard, captcha };
  }

  it('stands up with no key pair of any kind', async () => {
    /*
      The point of it, and the reason it is the schema's default: a LAN
      deployment has no provider account to set up and no registrable domain,
      so somebody has to be able to install this without either. (The default
      itself is asserted in env.ts rather than here — dotenv reloads the
      developer's own .env on every module reset, so this file cannot see an
      unset variable.)
    */
    const { captchaEnabled, captchaMode } = await loadGuard({
      CAPTCHA_PROVIDER: 'builtin',
      CAPTCHA_SECRET: '',
      CAPTCHA_SITE_KEY: '',
    });

    expect(captchaEnabled()).toBe(true);
    expect(captchaMode()).toBe('builtin');
  });

  it('lets a correct answer through', async () => {
    const { guard, captcha } = await loadBuiltin();
    const { id } = captcha.issueChallenge();
    const answer = captcha.peekChallengeAnswer(id);

    await expect(
      run(guard.requireCaptcha(), { body: { captchaToken: `${id}:${answer}` } }),
    ).resolves.toBeUndefined();
  });

  it('refuses a wrong answer', async () => {
    const { guard, captcha } = await loadBuiltin();
    const { id } = captcha.issueChallenge();

    const passed = await run(guard.requireCaptcha(), {
      body: { captchaToken: `${id}:NOTIT` },
    });

    expect((passed as { code?: string }).code).toBe('CAPTCHA_INVALID');
  });

  it('refuses a request with no answer at all', async () => {
    const { guard } = await loadBuiltin();

    const passed = await run(guard.requireCaptcha(), { body: {} });

    expect((passed as { code?: string }).code).toBe('CAPTCHA_REQUIRED');
  });

  it('never reaches for the network', async () => {
    const { guard, captcha } = await loadBuiltin();
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    const { id } = captcha.issueChallenge();
    const answer = captcha.peekChallengeAnswer(id);

    await run(guard.requireCaptcha(), { body: { captchaToken: `${id}:${answer}` } });

    // There is nothing to call, so there is no unreachable-verifier case and
    // no fail-open decision to get wrong.
    expect(fetched).not.toHaveBeenCalled();
  });
});
