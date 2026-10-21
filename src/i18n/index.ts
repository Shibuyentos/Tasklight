import { ptBR } from './pt-BR';

export type MessageKey = keyof typeof ptBR;

export function t(key: MessageKey): string {
  return ptBR[key];
}
