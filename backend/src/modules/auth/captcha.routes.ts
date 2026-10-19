import { Router, type Request, type Response } from 'express';

import { env } from '../../config/env.js';
import { issueChallenge } from '../../shared/captcha/index.js';
import {
  captchaChallengeLimiter,
  captchaEnabled,
  captchaMode,
} from '../../shared/middleware/index.js';

/**
 * Two ways to put a human check in front of the resident app.
 *
 * `GET /challenge` is the built-in one: this backend draws a picture, keeps the
 * answer, and the app shows it inline on the sign-in and registration forms.
 * No provider account, no internet, and no domain to register — which is what
 * a municipal deployment answering on a LAN address actually has.
 *
 * The rest of this file is the hosted-provider path, for a deployment with a
 * real domain.
 *
 * A Flutter app has no DOM, so the widget lives in a WebView — and every
 * provider checks the page's origin against the domains registered for the
 * site key. Serving it from here means that origin is this backend's own
 * hostname, which is a real domain somebody can register, rather than the
 * `about:blank` an inline HTML string would give.
 *
 * The site key is public by design; the secret never leaves the server.
 */
const router = Router();

const PROVIDER_SCRIPT: Record<string, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onCaptchaReady',
  hcaptcha: 'https://js.hcaptcha.com/1/api.js?onload=onCaptchaReady&render=explicit',
  recaptcha: 'https://www.google.com/recaptcha/api.js?onload=onCaptchaReady&render=explicit',
};

const PROVIDER_GLOBAL: Record<string, string> = {
  turnstile: 'turnstile',
  hcaptcha: 'hcaptcha',
  recaptcha: 'grecaptcha',
};

/**
 * Whether a client needs to raise a challenge before signing in or registering,
 * and which of the two it has to render.
 */
router.get('/status', (_req: Request, res: Response): void => {
  res.json({
    data: {
      enabled: captchaEnabled(),
      provider: captchaEnabled() ? env.CAPTCHA_PROVIDER : 'none',
      mode: captchaMode(),
    },
  });
});

/**
 * A fresh built-in challenge: an id, and the picture of the answer.
 *
 * The image rides along as a data URI so one round trip gives the app
 * everything it needs — a second request for the picture would mean the id
 * could outlive the image it belongs to. The app answers by sending
 * `captchaToken: "<id>:<what the person typed>"`.
 */
router.get('/challenge', captchaChallengeLimiter, (_req: Request, res: Response): void => {
  if (captchaMode() !== 'builtin') {
    // Not an error the app should surface: it reads the mode from /status and
    // renders the provider's widget instead.
    res.status(404).json({
      error: {
        code: 'CAPTCHA_NOT_BUILTIN',
        message: 'This deployment does not serve its own challenge.',
      },
    });
    return;
  }

  const { id, png, expiresInSeconds } = issueChallenge();
  res.json({
    data: {
      id,
      image: `data:image/png;base64,${png.toString('base64')}`,
      expiresIn: expiresInSeconds,
    },
  });
});

router.get('/', (_req: Request, res: Response): void => {
  const provider = env.CAPTCHA_PROVIDER;
  const script = PROVIDER_SCRIPT[provider];
  const widget = PROVIDER_GLOBAL[provider];

  res.type('html');

  if (!captchaEnabled() || !script || !widget || !env.CAPTCHA_SITE_KEY) {
    // Nothing to solve. The app treats this as "no challenge needed" rather
    // than as an error, so a half-configured deployment cannot lock anyone out.
    res.send(`<!doctype html><meta charset="utf-8"><title>No challenge</title>
<script>
  if (window.TanzAlertCaptcha) window.TanzAlertCaptcha.postMessage('disabled');
</script>`);
    return;
  }

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Security check</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      display: grid;
      place-items: center;
      background: #f3f7fb;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #0b172a;
    }
    p { margin: 0 0 18px; font-size: 14px; color: #62748a; text-align: center; }
    #box { padding: 20px; }
  </style>
  <script src="${script}" async defer></script>
</head>
<body>
  <div id="box">
    <p>Confirming you are not a robot</p>
    <div id="widget"></div>
  </div>
  <script>
    function send(message) {
      if (window.TanzAlertCaptcha) window.TanzAlertCaptcha.postMessage(message);
    }
    function onCaptchaReady() {
      try {
        window.${widget}.render('#widget', {
          sitekey: ${JSON.stringify(env.CAPTCHA_SITE_KEY)},
          callback: function (token) { send(token); },
          'error-callback': function () { send('error'); },
          'expired-callback': function () { send('expired'); }
        });
      } catch (err) {
        send('error');
      }
    }
    // A provider that never loads must not leave the app waiting on a blank
    // screen; the app closes the sheet and says the check is unavailable.
    setTimeout(function () {
      if (!document.querySelector('#widget iframe')) send('unavailable');
    }, 15000);
  </script>
</body>
</html>`);
});

export default router;
