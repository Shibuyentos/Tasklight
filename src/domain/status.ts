import type { StatusType, TaskStatus } from './task';

export type StatusMenuKind = 'notStarted' | 'active' | 'done' | 'closed';

export interface StatusMenuGroup {
  kind: StatusMenuKind;
  statuses: TaskStatus[];
}

const KIND: Readonly<Record<StatusType, StatusMenuKind>> = {
  open: 'notStarted',
  unstarted: 'notStarted',
  custom: 'active',
  done: 'done',
  closed: 'closed',
};
const ORDER: readonly StatusMenuKind[] = ['notStarted', 'active', 'done', 'closed'];

/** Status da lista agrupados como no menu do ClickUp: não iniciado, ativo, concluído, fechado. */
export function statusMenuGroups(statuses: readonly TaskStatus[]): StatusMenuGroup[] {
  return ORDER.map((kind) => ({
    kind,
    statuses: statuses
      .filter((status) => KIND[status.type] === kind)
      .sort((a, b) => a.orderindex - b.orderindex),
  })).filter((group) => group.statuses.length > 0);
}

// O ClickUp em português mostra os status padrão traduzidos; nomes personalizados ficam como estão.
const DEFAULT_LABELS: Readonly<Record<string, string>> = {
  'to do': 'pendente',
  'in progress': 'em progresso',
  complete: 'concluído',
};

export function statusLabel(name: string): string {
  return DEFAULT_LABELS[name.toLowerCase()] ?? name;
}
