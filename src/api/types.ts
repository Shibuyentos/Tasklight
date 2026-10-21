// Apenas os campos que o app usa; o resto da resposta da API é descartado na leitura.

export interface ApiUser {
  id: number;
  username: string;
  email: string;
  color: string | null;
  initials: string;
  profilePicture: string | null;
  timezone?: string;
  /** Primeiro dia da semana (0 = domingo), de `week_start_day`. */
  weekStartDay: number;
}

export interface ApiTeam {
  id: string;
  name: string;
  color: string | null;
  avatar: string | null;
}

/** Campos lidos de cada tarefa; números chegam como strings, como o ClickUp envia. */
export interface ApiTask {
  id: string;
  custom_id: string | null;
  custom_item_id: number | null;
  name: string;
  text_content: string | null;
  url: string;
  status: { status: string; color: string; type: string; orderindex: number };
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  date_done: string | null;
  archived: boolean;
  assignees: Array<{ id: number }>;
  parent: string | null;
  priority: { id: string; priority: string } | null;
  due_date: string | null;
  start_date: string | null;
  list: { id: string };
  space: { id: string };
}

/** Tipo de tarefa personalizado do workspace (Defeito, Marco…); o ícone vem do Font Awesome. */
export interface ApiCustomItem {
  id: number;
  name: string;
  avatar: { source: string | null; value: string | null } | null;
}
