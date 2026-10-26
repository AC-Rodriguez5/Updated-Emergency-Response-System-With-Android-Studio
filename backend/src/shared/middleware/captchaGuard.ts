import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { env } from '../../config/env.js';
import { verifyChallengeAnswer } from '../captcha/index.js';
import { AppError } from './errorHandler.js';

/**
 * Proof that a human asked, on the two routes a script would hammer.
 *
 * Rate limiting already caps how fast anyone can try; this caps who can try at
 * all. The two are complementary — a distributed attempt slips past per-IP
 * limits, and a single determined human sails past a challenge.
 *
 * Two kinds of check sit behind one guard. `builtin` is the challenge this
 * backend draws and marks itself, answered in-process with nothing to call.
 * The hosted providers post the token to their own verifier. `none` switches
 * the whole thing off.
 */

const VERIFY_URLS: Record<string, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
};

const VERIFY_TIMEOUT_MS = 5000;

export function captchaEnabled(): boolean {
  if (env.CAPTCHA_PROVIDER === 'none') return false;
  // The builtin challenge has no key pair to be missing.
  if (env.CAPTCHA_PROVIDER === 'builtin') return true;
  return !!env.CAPTCHA_SECRET;
}

/** What a client has to render: nothing, this backend's own picture, or a provider's widget. */
export type CaptchaMode = 'none' | 'builtin' | 'webview';

export function captchaMode(): CaptchaMode {
  if (!captchaEnabled()) return 'none';
  return env.CAPTCHA_PROVIDER === 'builtin' ? 'builtin' : 'webview';
}

/** What the provider said, flattened to the two things a caller acts on. */
export interface CaptchaOutcome {
  ok: boolean;
  reason?: string;
}

export async function verifyCaptchaToken(
  token: string,
  remoteIp?: string,
): Promise<CaptchaOutcome> {
  const url = VERIFY_URLS[env.CAPTCHA_PROVIDER];
  if (!url) return { ok: true };

  const body = new URLSearchParams({
    secret: env.CAPTCHA_SECRET ?? '',
    response: token,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `verifier answered ${response.status}` };
    }
    const result = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };
    if (result.success) return { ok: true };
    return { ok: false, reason: result['error-codes']?.join(',') ?? 'rejected' };
  } catch (err) {
    // Unreachable verifier — distinct from a rejected token, and treated
    // differently by the middleware.
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
  }
}

/*
  A request whose challenge has already been marked, so a second guard further
  down the chain does not ask again. It could not pass twice if it tried: a
  challenge is spent the moment it is checked, so re-checking a good one would
  fail it.
*/
const VERIFIED = Symbol('captchaVerified');

function markVerified(req: Request): void {
  (req as Request & { [VERIFIED]?: boolean })[VERIFIED] = true;
}

function alreadyVerified(req: Request): boolean {
  return (req as Request & { [VERIFIED]?: boolean })[VERIFIED] === true;
}

function tokenFrom(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const fromBody = body?.captchaToken;
  if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
  // Multipart registrations send it as a field, but a header keeps the door
  // open for a client that cannot add one.
  const fromHeader = req.header('x-captcha-token');
  return fromHeader && fromHeader.length > 0 ? fromHeader : undefined;
}

/**
 * Requires a solved challenge on this route.
 *
 * Place it after any body parser — multer included — so the token is readable.
 */
export function requireCaptcha(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!captchaEnabled() || alreadyVerified(req)) {
      next();
      return;
    }

    const token = tokenFrom(req);
    if (!token) {
      next(
        new AppError(
          'This action needs the security check completed.',
          400,
          'CAPTCHA_REQUIRED',
        ),
      );
      return;
    }

    if (env.CAPTCHA_PROVIDER === 'builtin') {
      // Marked here, against this process's own records. Nothing to time out,
      // so there is no fail-open case to consider.
      const outcome = verifyChallengeAnswer(token);
      if (outcome.ok) {
        markVerified(req);
        next();
        return;
      }
      next(
        new AppError(
          'That security code was not right. Try the new one below.',
          400,
          'CAPTCHA_INVALID',
        ),
      );
      return;
    }

    verifyCaptchaToken(token, req.ip)
      .then((outcome) => {
        if (outcome.ok) {
          markVerified(req);
          next();
          return;
        }
        next(
          new AppError(
            'The security check did not pass. Please try again.',
            400,
            'CAPTCHA_INVALID',
          ),
        );
      })
      .catch((err: Error) => {
        /*
          The verifier itself is unreachable — Cloudflare is down, or this
          deployment has lost its way to the internet while still serving a
          local network.

          Default is to let the request through and say so in the log. Locking
          every responder out of an emergency system to stop a hypothetical bot
          is the worse failure: rate limits and the admin approval gate are
          still standing. Set CAPTCHA_FAIL_OPEN=false where that trade is not
          the right one.
        */
        if (env.CAPTCHA_FAIL_OPEN) {
          console.warn(
            `[captcha] verifier unreachable (${err.message}); allowing ${req.method} ${req.path}`,
          );
          next();
          return;
        }
        next(
          new AppError(
            'The security check is unavailable. Try again shortly.',
            503,
            'CAPTCHA_UNAVAILABLE',
          ),
        );
      });
  };
}

/**
 * Marks a challenge carried in the `x-captcha-token` header, before anything
 * has read the body.
 *
 * It exists for registration, where the request is a multipart upload: the
 * token can only be read out of the body after multer has buffered two photos,
 * which is far too late to sit in front of the rate limiter. With the limiter
 * first, a mistyped security code spent one of ten registration attempts an
 * hour — and a header can be read before either runs.
 *
 * A request with no header is passed straight through for a later
 * [requireCaptcha] to deal with out of the body, so a client that predates this
 * still registers. One that does carry a header has it marked here, and the
 * later guard stands aside rather than spending the same challenge twice.
 */
export function requireCaptchaHeader(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!captchaEnabled()) {
      next();
      return;
    }

    const token = req.header('x-captcha-token');
    if (!token) {
      // Nothing to judge yet. The guard after the body parser decides.
      next();
      return;
    }

    if (env.CAPTCHA_PROVIDER === 'builtin') {
      const outcome = verifyChallengeAnswer(token);
      if (outcome.ok) {
        markVerified(req);
        next();
        return;
      }
      next(
        new AppError(
          'That security code was not right. Try the new one below.',
          400,
          'CAPTCHA_INVALID',
        ),
      );
      return;
    }

    verifyCaptchaToken(token, req.ip)
      .then((outcome) => {
        if (outcome.ok) {
          markVerified(req);
          next();
          return;
        }
        next(
          new AppError(
            'The security check did not pass. Please try again.',
            400,
            'CAPTCHA_INVALID',
          ),
        );
      })
      .catch((err: Error) => {
        if (env.CAPTCHA_FAIL_OPEN) {
          console.warn(
            `[captcha] verifier unreachable (${err.message}); allowing ${req.method} ${req.path}`,
          );
          markVerified(req);
          next();
          return;
        }
        next(
          new AppError(
            'The security check is unavailable. Try again shortly.',
            503,
            'CAPTCHA_UNAVAILABLE',
          ),
        );
      });
  };
}
