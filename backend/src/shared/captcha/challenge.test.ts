import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearChallenges,
  issueChallenge,
  peekChallengeAnswer,
  pendingChallengeCount,
  verifyChallengeAnswer,
} from './index.js';
import { CHALLENGE_ALPHABET } from './glyphs.js';

/**
 * The challenge this backend sets and marks itself.
 *
 * The happy path carries the most weight here: a check nobody can pass locks
 * residents out of an emergency system, which is worse than the bot it was
 * meant to stop.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => {
  clearChallenges();
  vi.useRealTimers();
});

describe('issueChallenge', () => {
  it('draws a real PNG at the size the app lays out for', () => {
    const { png } = issueChallenge();

    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    // IHDR width and height, straight after the signature and chunk header.
    expect(png.readUInt32BE(16)).toBe(240);
    expect(png.readUInt32BE(20)).toBe(80);
  });

  it('only ever uses characters the font can draw', () => {
    for (let i = 0; i < 50; i += 1) {
      const { id } = issueChallenge();
      const answer = peekChallengeAnswer(id);
      expect(answer).toBeDefined();
      for (const char of answer!) {
        expect(CHALLENGE_ALPHABET).toContain(char);
      }
    }
  });

  it('does not hand out the same challenge twice', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) ids.add(issueChallenge().id);

    expect(ids.size).toBe(20);
  });
});

describe('verifyChallengeAnswer', () => {
  it('accepts the answer it drew', () => {
    const { id } = issueChallenge();
    const answer = peekChallengeAnswer(id)!;

    expect(verifyChallengeAnswer(`${id}:${answer}`)).toEqual({ ok: true });
  });

  it('does not care about case or stray whitespace', () => {
    const { id } = issueChallenge();
    const answer = peekChallengeAnswer(id)!;

    // Phone keyboards fight people over both.
    expect(verifyChallengeAnswer(`${id}:  ${answer.toLowerCase()} `).ok).toBe(true);
  });

  it('refuses a wrong answer', () => {
    const { id } = issueChallenge();
    const answer = peekChallengeAnswer(id)!;
    const wrong = answer === 'AAAAA' ? 'CCCCC' : 'AAAAA';

    expect(verifyChallengeAnswer(`${id}:${wrong}`).ok).toBe(false);
  });

  it('spends the challenge even on a wrong answer', () => {
    const { id } = issueChallenge();
    const answer = peekChallengeAnswer(id)!;

    // Otherwise one issued picture could be guessed at until it gave way,
    // which is the whole of the protection gone.
    expect(verifyChallengeAnswer(`${id}:AAAAA`).ok).toBe(false);
    expect(verifyChallengeAnswer(`${id}:${answer}`)).toEqual({
      ok: false,
      reason: 'unknown or already answered',
    });
  });

  it('refuses a replay of a correct answer', () => {
    const { id } = issueChallenge();
    const answer = peekChallengeAnswer(id)!;

    expect(verifyChallengeAnswer(`${id}:${answer}`).ok).toBe(true);
    expect(verifyChallengeAnswer(`${id}:${answer}`).ok).toBe(false);
  });

  it('refuses one that has expired', () => {
    vi.useFakeTimers();
    const { id } = issueChallenge();
    const answer = peekChallengeAnswer(id)!;

    vi.advanceTimersByTime(3 * 60 * 1000 + 1);

    expect(verifyChallengeAnswer(`${id}:${answer}`)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it.each([
    ['empty', ''],
    ['no separator', 'justsometext'],
    ['nothing before the separator', ':ABCDE'],
    ['an id that was never issued', 'not-an-id:ABCDE'],
  ])('refuses %s', (_label, token) => {
    expect(verifyChallengeAnswer(token).ok).toBe(false);
  });
});

describe('the pending store', () => {
  it('forgets a challenge once it has been marked', () => {
    const before = pendingChallengeCount();
    const { id } = issueChallenge();
    expect(pendingChallengeCount()).toBe(before + 1);

    verifyChallengeAnswer(`${id}:whatever`);

    expect(pendingChallengeCount()).toBe(before);
  });

  it('sweeps expired challenges nobody ever answered', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i += 1) issueChallenge();
    expect(pendingChallengeCount()).toBe(5);

    vi.advanceTimersByTime(3 * 60 * 1000 + 1);
    // The sweep runs when the next challenge is issued, so an app nobody is
    // using does not keep a timer alive for nothing.
    issueChallenge();

    expect(pendingChallengeCount()).toBe(1);
  });
});
