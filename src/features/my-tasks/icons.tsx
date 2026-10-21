// Ícones próprios da lista, desenhados para o mesmo tamanho e traço dos ícones do ClickUp.
import type { JSX } from 'solid-js';

interface IconProps {
  size?: number;
}

function Glyph(props: IconProps & { children: JSX.Element }) {
  const size = () => props.size ?? 16;
  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

/** Ramo de subtarefa: da tarefa (círculo de cima) até a filha (círculo de baixo). */
export function SubtasksIcon(props: IconProps) {
  return (
    <Glyph size={props.size}>
      <circle cx="4" cy="3.75" r="1.75" />
      <path d="M4 5.5V9a3 3 0 0 0 3 3h3.25" />
      <circle cx="12" cy="12" r="1.75" />
    </Glyph>
  );
}

export function DescriptionIcon(props: IconProps) {
  return (
    <Glyph size={props.size}>
      <path d="M2.75 4h10.5M2.75 8h10.5M2.75 12h6.5" />
    </Glyph>
  );
}

export function AttachmentIcon(props: IconProps) {
  return (
    <Glyph size={props.size}>
      <path d="M10.75 6v5a2.75 2.75 0 0 1-5.5 0V4.25a1.75 1.75 0 0 1 3.5 0v6.25a.75.75 0 0 1-1.5 0V6" />
    </Glyph>
  );
}

/** Círculo cheio com o "+" vazado na cor do fundo. */
export function AddColumnIcon(props: IconProps) {
  const size = () => props.size ?? 16;
  return (
    <svg width={size()} height={size()} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M8 4.75v6.5M4.75 8h6.5"
        stroke="var(--bg-main)"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
  );
}
