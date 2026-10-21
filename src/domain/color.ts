export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/;

/** Aceita `#rgb`, `#rrggbb`, `rgb(r, g, b)` e `rgba(r, g, b, a)`; devolve `null` para o resto. */
export function parseColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase();

  const hex = HEX.exec(value)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }

  const rgb = RGB.exec(value);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (r === undefined || g === undefined || b === undefined) return null;
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }

  return null;
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * Decide entre texto claro e escuro sobre um fundo colorido, como o ClickUp faz em avatares e
 * pílulas de status. Usa a luminância relativa com limiar fixo em 0,5: a regra de "maior contraste"
 * da WCAG escolheria texto preto no azul `rgb(0, 145, 255)`, mas o ClickUp usa branco ali.
 */
export function readableTextColor(background: string): 'light' | 'dark' {
  const color = parseColor(background);
  if (!color) return 'light';
  const luminance =
    0.2126 * linearChannel(color.r) +
    0.7152 * linearChannel(color.g) +
    0.0722 * linearChannel(color.b);
  return luminance > 0.5 ? 'dark' : 'light';
}
