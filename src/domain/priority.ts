import type { Priority } from './task';

export const PRIORITY_LABEL: Readonly<Record<Priority, string>> = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

/** Cores das bandeiras medidas no tema escuro do ClickUp (a de "Baixa" ainda não foi observada). */
export const PRIORITY_COLOR: Readonly<Record<Priority, string>> = {
  urgent: 'rgb(255, 133, 137)',
  high: 'rgb(255, 197, 61)',
  normal: 'rgb(62, 99, 221)',
  low: 'rgb(123, 123, 123)',
};
