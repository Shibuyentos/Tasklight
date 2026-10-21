// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PRIORITY_COLOR } from './priority';

describe('PRIORITY_COLOR', () => {
  it('usa as cores das bandeiras medidas no tema escuro do ClickUp', () => {
    expect(PRIORITY_COLOR).toEqual({
      urgent: 'rgb(255, 133, 137)',
      high: 'rgb(255, 197, 61)',
      normal: 'rgb(62, 99, 221)',
      low: 'rgb(96, 96, 96)',
    });
  });
});
