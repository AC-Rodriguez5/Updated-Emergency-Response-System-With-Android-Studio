import { randomInt, randomUUID } from 'node:crypto';

import {
  CHALLENGE_ALPHABET,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  INK_THRESHOLD,
  glyphCoverage,
} from './glyphs.js';
import { encodePng } from './png.js';

/**
 * The challenge this backend sets and marks itself.
 *
 * Turnstile and friends are still supported, but they need the device to reach
 * the internet and the backend's hostname to be registered with the provider —
 * neither of which holds for a municipal deployment answering on a LAN address.
 * This one works on an island: the server draws some leaning characters, keeps
 * the answer, and the app shows the picture.
 *
 * It is a speed bump, not a wall. Five characters out of 26 is one in roughly
 * twelve million per attempt, and the login and registration rate limiters cap
 * how many attempts anyone gets. A determined human still walks through it,
 * exactly as with any provider.
 */

const LENGTH = 5;
const TTL_MS = 3 * 60 * 1000;

/*
  Held in this process only. A multi-instance deployment behind a load balancer
  would need a shared store, since the app asks for a challenge and submits the
  answer seconds later but not necessarily to the same instance. Single-process
  is what this system runs; the cap keeps a flood of unanswered challenges from
  growing without bound.
*/
const MAX_PENDING = 2048;

const WIDTH = 240;
const HEIGHT = 80;
const PADDING = 14;

interface Pending {
  answer: string;
  expiresAt: number;
}

const pending = new Map<string, Pending>();

export interface IssuedChallenge {
  id: string;
  png: Buffer;
  expiresInSeconds: number;
}

export interface ChallengeOutcome {
  ok: boolean;
  reason?: string;
}

function pickText(): string {
  let text = '';
  for (let i = 0; i < LENGTH; i += 1) {
    text += CHALLENGE_ALPHABET[randomInt(CHALLENGE_ALPHABET.length)];
  }
  return text;
}

/** Drops what has expired, then the oldest entries if the map is still at cap. */
function prune(): void {
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(id);
  }
  // A Map iterates in insertion order, so the front of it is the oldest.
  while (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next();
    if (oldest.done) break;
    pending.delete(oldest.value);
  }
}

/** A random value in [min, max), to one part in a thousand. */
function between(min: number, max: number): number {
  return min + (randomInt(0, 1000) / 1000) * (max - min);
}

const SUBSAMPLES: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75],
];

function render(text: string): Buffer {
  const rgb = Buffer.alloc(WIDTH * HEIGHT * 3);

  const put = (x: number, y: number, r: number, g: number, b: number, alpha: number): void => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const at = (y * WIDTH + x) * 3;
    rgb[at] = Math.round(rgb[at] * (1 - alpha) + r * alpha);
    rgb[at + 1] = Math.round(rgb[at + 1] * (1 - alpha) + g * alpha);
    rgb[at + 2] = Math.round(rgb[at + 2] * (1 - alpha) + b * alpha);
  };

  // Background: the app's own pale blue with a faint vertical gradient, so the
  // picture does not read as a flat rectangle sitting inside the card.
  for (let y = 0; y < HEIGHT; y += 1) {
    const shade = Math.round((y / HEIGHT) * 6);
    for (let x = 0; x < WIDTH; x += 1) {
      put(x, y, 245 - shade, 248 - shade, 252 - shade, 1);
    }
  }

  const slot = (WIDTH - PADDING * 2) / text.length;
  const scaleX = 5;
  const scaleY = 5;
  const reach = Math.ceil(
    Math.hypot((GLYPH_WIDTH * scaleX) / 2, (GLYPH_HEIGHT * scaleY) / 2) + 6,
  );

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const centreX = PADDING + slot * i + slot / 2 + between(-3, 3);
    const centreY = HEIGHT / 2 + between(-5, 5);
    const angle = between(-0.3, 0.3);
    const waveAmplitude = between(1.5, 3.5);
    const wavePhase = between(0, 6.283);
    // Dark slate through to ink blue: enough variation that the characters do
    // not read as one connected word, all of it legible on a pale background.
    const r = randomInt(18, 70);
    const g = randomInt(28, 82);
    const b = randomInt(70, 150);

    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);

    for (let y = Math.floor(centreY - reach); y <= Math.ceil(centreY + reach); y += 1) {
      for (let x = Math.floor(centreX - reach); x <= Math.ceil(centreX + reach); x += 1) {
        /*
          Inverse mapping with 2x2 supersampling. Each source pixel is five
          screen pixels wide, so rotating by nearest neighbour alone leaves the
          edges in jagged blocks — which looks careless and, because the blocks
          are axis-aligned, tells a solver where the glyph grid sits.
        */
        let hits = 0;
        for (const [offsetX, offsetY] of SUBSAMPLES) {
          const deltaX = x + offsetX - centreX;
          const deltaY = y + offsetY - centreY;
          const localY = deltaX * sin + deltaY * cos;
          const localX =
            deltaX * cos - deltaY * sin + waveAmplitude * Math.sin(localY / 7 + wavePhase);
          const glyphX = localX / scaleX + GLYPH_WIDTH / 2;
          const glyphY = localY / scaleY + GLYPH_HEIGHT / 2;
          if (glyphCoverage(char, glyphX, glyphY) >= INK_THRESHOLD) hits += 1;
        }
        if (hits > 0) put(x, y, r, g, b, hits / SUBSAMPLES.length);
      }
    }
  }

  // Three curves drawn over the lot, mid-tone so they cross the characters
  // without burying them.
  for (let line = 0; line < 3; line += 1) {
    const amplitude = between(5, 14);
    const period = between(28, 70);
    const phase = between(0, 6.283);
    const offset = between(HEIGHT * 0.25, HEIGHT * 0.75);
    for (let x = 0; x < WIDTH; x += 1) {
      const y = Math.round(offset + Math.sin(x / period + phase) * amplitude);
      put(x, y, 120, 142, 170, 0.55);
      put(x, y + 1, 120, 142, 170, 0.3);
    }
  }

  // Speckle, kept light: it has to defeat a naive threshold-and-match, not the
  // person squinting at a phone in an emergency.
  for (let dot = 0; dot < 420; dot += 1) {
    put(
      randomInt(WIDTH),
      randomInt(HEIGHT),
      randomInt(130, 190),
      randomInt(145, 200),
      randomInt(165, 215),
      0.6,
    );
  }

  return encodePng(WIDTH, HEIGHT, rgb);
}

/** Draws a fresh challenge and remembers its answer for the next few minutes. */
export function issueChallenge(): IssuedChallenge {
  prune();
  const id = randomUUID();
  const answer = pickText();
  pending.set(id, { answer, expiresAt: Date.now() + TTL_MS });
  return { id, png: render(answer), expiresInSeconds: Math.floor(TTL_MS / 1000) };
}

/**
 * Marks an `id:answer` token.
 *
 * The id is spent either way. A wrong answer costs a new challenge rather than
 * another guess at the same picture, which is what stops one issued challenge
 * from being brute-forced offline.
 */
export function verifyChallengeAnswer(token: string): ChallengeOutcome {
  const separator = token.indexOf(':');
  if (separator < 1) return { ok: false, reason: 'malformed' };

  const id = token.slice(0, separator);
  const answer = token.slice(separator + 1).trim().toUpperCase();

  const entry = pending.get(id);
  pending.delete(id);

  if (!entry) return { ok: false, reason: 'unknown or already answered' };
  if (entry.expiresAt <= Date.now()) return { ok: false, reason: 'expired' };
  if (answer !== entry.answer) return { ok: false, reason: 'wrong' };
  return { ok: true };
}

/** Test seam: how many challenges are waiting on an answer. */
export function pendingChallengeCount(): number {
  return pending.size;
}

/** Test seam: forget every outstanding challenge. */
export function clearChallenges(): void {
  pending.clear();
}

/**
 * Test seam: the answer to an outstanding challenge.
 *
 * Nothing outside a test may call this, and nothing does — the route hands out
 * the picture and the id, never the text. It exists so the tests can take the
 * happy path, which is the one that matters: a check nobody can pass locks
 * residents out of an emergency system.
 */
export function peekChallengeAnswer(id: string): string | undefined {
  return pending.get(id)?.answer;
}
