// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function tokenValue(name: string): string | undefined {
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`));
  return match?.[1]?.replace(/\s+/g, ' ').trim();
}

const expected: Array<[string, string]> = [
  ['--bg-main', 'rgb(17, 17, 17)'],
  ['--bg-main-dark', 'rgb(9, 9, 9)'],
  ['--bg-subtle', 'rgb(25, 25, 25)'],
  ['--bg-strong', 'rgb(34, 34, 34)'],
  ['--bg-hover', 'rgba(255, 255, 255, 0.0706)'],
  ['--bg-elevated', 'rgb(42, 42, 42)'],
  ['--bg-menu', 'rgb(25, 25, 25)'],
  ['--bg-tooltip', 'rgb(42, 42, 42)'],
  ['--bg-search', 'rgb(42, 42, 42)'],
  ['--bg-search-hover', 'rgb(49, 49, 49)'],
  ['--text-primary', 'rgb(238, 238, 238)'],
  ['--text-secondary', 'rgb(180, 180, 180)'],
  ['--text-tertiary', 'rgb(123, 123, 123)'],
  ['--text-placeholder', 'rgb(110, 110, 110)'],
  ['--text-disabled', 'rgb(96, 96, 96)'],
  ['--text-search', 'rgba(255, 255, 255, 0.4471)'],
  ['--border-default', 'rgb(42, 42, 42)'],
  ['--border-low', 'rgb(34, 34, 34)'],
  ['--border-high', 'rgb(72, 72, 72)'],
  ['--row-bg', 'rgb(17, 17, 17)'],
  ['--row-hover', 'rgb(25, 25, 25)'],
  ['--row-selected', 'rgb(34, 34, 34)'],
  ['--accent', 'rgb(99, 71, 234)'],
  ['--accent-text', 'rgb(168, 159, 255)'],
  ['--danger-text', 'rgb(255, 133, 137)'],
  ['--success-text', 'rgb(61, 214, 140)'],
  ['--warning-text', 'rgb(255, 204, 77)'],
  ['--overlay', 'rgba(0, 0, 0, 0.565)'],
  [
    '--elevation-menu',
    '0 0 1px 0 rgba(255, 255, 255, 0.3333), 0 4px 6px -1px rgba(0, 0, 0, 0.106), 0 2px 4px -2px rgba(0, 0, 0, 0.106)',
  ],
  ['--radius-1', '2px'],
  ['--radius-2', '4px'],
  ['--radius-2-5', '5px'],
  ['--radius-3', '6px'],
  ['--radius-3-5', '7px'],
  ['--radius-4', '8px'],
  ['--radius-round', '9999px'],
  ['--font-size-base', '13px'],
  ['--font-size-xs', '12px'],
  ['--font-size-sm', '14px'],
  ['--font-size-md', '16px'],
  ['--font-size-lg', '18px'],
  ['--font-size-xl', '20px'],
  ['--font-size-2xl', '28px'],
  ['--topbar-height', '40px'],
  ['--rail-width', '64px'],
  ['--sidebar-width', '256px'],
  ['--sidebar-header-height', '40px'],
  ['--sidebar-row-height', '28px'],
  ['--anim-duration', '0s'],
];

describe('tokens do tema escuro', () => {
  it.each(expected)('%s = %s', (name, value) => {
    expect(tokenValue(name)).toBe(value);
  });

  it('usa a pilha de fontes do ClickUp', () => {
    expect(tokenValue('--font-family')).toBe(
      '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", roboto, "Helvetica Neue", helvetica, arial, sans-serif',
    );
  });
});
