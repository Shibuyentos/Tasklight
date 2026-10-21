// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { statusLabel, statusMenuGroups } from './status';
import type { TaskStatus } from './task';

const status = (name: string, type: TaskStatus['type'], orderindex: number): TaskStatus => ({
  name,
  type,
  orderindex,
  color: '#87909e',
});

describe('statusMenuGroups', () => {
  it('agrupa por tipo na ordem do menu do ClickUp e ordena pela posição na lista', () => {
    const groups = statusMenuGroups([
      status('fechado', 'closed', 9),
      status('em revisão', 'custom', 3),
      status('backlog', 'open', 0),
      status('aceite', 'done', 7),
      status('fazendo', 'custom', 2),
      status('aguardando', 'unstarted', 1),
    ]);

    expect(groups.map((group) => [group.kind, group.statuses.map((item) => item.name)])).toEqual([
      ['notStarted', ['backlog', 'aguardando']],
      ['active', ['fazendo', 'em revisão']],
      ['done', ['aceite']],
      ['closed', ['fechado']],
    ]);
  });

  it('omite grupos vazios', () => {
    expect(statusMenuGroups([status('to do', 'open', 0)]).map((group) => group.kind)).toEqual([
      'notStarted',
    ]);
  });
});

describe('statusLabel', () => {
  it('traduz os status padrão do ClickUp como a interface em português', () => {
    expect(statusLabel('to do')).toBe('pendente');
    expect(statusLabel('In Progress')).toBe('em progresso');
    expect(statusLabel('complete')).toBe('concluído');
  });

  it('mantém nomes personalizados', () => {
    expect(statusLabel('aceite usuário')).toBe('aceite usuário');
    expect(statusLabel('NOT STARTED')).toBe('NOT STARTED');
  });
});
