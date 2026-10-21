import { ptBR } from './pt-BR';

export type MessageKey = keyof typeof ptBR;

/** Traduz pela chave; `{nome}` no texto é trocado pelo parâmetro de mesmo nome. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message: string = ptBR[key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}
