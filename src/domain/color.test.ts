// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseColor, readableTextColor } from './color';

describe('parseColor', () => {
  it.each([
    ['#3397dd', { r: 51, g: 151, b: 221 }],
    ['#FFF', { r: 255, g: 255, b: 255 }],
    ['rgb(0, 145, 255)', { r: 0, g: 145, b: 255 }],
    ['rgba(1, 2, 3, 0.5)', { r: 1, g: 2, b: 3 }],
  ])('%s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each([['cor inválida'], ['#12'], ['rgb(1, 2)'], ['rgb(300, 0, 0)'], ['']])(
    '%j não é uma cor',
    (input) => {
      expect(parseColor(input)).toBeNull();
    },
  );
});

describe('readableTextColor', () => {
  // Casos observados na interface real do ClickUp.
  it.each([
    ['rgb(0, 145, 255)', 'light'], // avatar azure: iniciais brancas
    ['rgb(51, 151, 221)', 'light'], // pílula PROGRAMADO: texto branco
    ['rgb(96, 96, 96)', 'light'], // pílula FILA: texto branco
    ['rgb(255, 197, 61)', 'dark'], // amarelo de status (PAUSADO): texto escuro
    ['#ffffff', 'dark'],
    ['#000', 'light'],
    ['cor inválida', 'light'],
  ])('%s → %s', (background, expected) => {
    expect(readableTextColor(background)).toBe(expected);
  });
});
