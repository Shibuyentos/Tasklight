// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration } from './duration';

const H = 3_600_000;
const M = 60_000;

describe('formatDuration', () => {
  it.each([
    [11 * H, '11h'],
    [H + 30 * M, '1h 30m'],
    [45 * M, '45m'],
    [19 * H + 26 * M + 59_000, '19h 26m'],
    [0, '0m'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('parseDuration', () => {
  it.each([
    ['11h', 11 * H],
    ['1h 30m', H + 30 * M],
    ['1h30', H + 30 * M],
    ['90m', 90 * M],
    ['1,5h', 1.5 * H],
    ['2', 2 * H],
    [' 3H 5M ', 3 * H + 5 * M],
  ])('"%s" → %i ms', (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(['', 'abc', '-1h', '1x'])('"%s" é inválido', (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});
