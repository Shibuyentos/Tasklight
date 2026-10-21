// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StatusGroup } from '../../domain/grouping';
import type { Task, TaskStatus } from '../../domain/task';
import { task } from '../../test/fixtures';
import { buildListItems, ITEM_HEIGHT, itemHeight, type ListItem } from './view-model';

const OPEN: TaskStatus = { name: 'programado', color: '#3397dd', type: 'open', orderindex: 0 };
const PAUSED: TaskStatus = { name: 'pausado', color: '#f5b724', type: 'custom', orderindex: 4 };

function group(status: TaskStatus, tasks: Task[]): StatusGroup {
  return { key: status.name, status, tasks };
}

function describeItems(items: ListItem[]): string[] {
  return items.map((item) => {
    if (item.kind === 'group')
      return `grupo ${item.key} (${item.count})${item.collapsed ? ' recolhido' : ''}`;
    if (item.kind === 'row') {
      const flags = [item.expandable ? 'expansível' : '', item.expanded ? 'aberta' : '']
        .filter(Boolean)
        .join(' ');
      return `${'  '.repeat(item.depth)}linha ${item.task.name}${flags ? ` [${flags}]` : ''}`;
    }
    return `${item.kind} ${item.groupKey}`;
  });
}

describe('buildListItems', () => {
  it('monta grupos com linhas, "Adicionar" e espaço; o recolhido só mostra o cabeçalho', () => {
    const items = buildListItems({
      groups: [
        group(OPEN, [task({ name: 'A' }), task({ name: 'B' })]),
        group(PAUSED, [task({ name: 'C' })]),
      ],
      collapsedGroups: new Set(['pausado']),
      expandedTasks: new Set(),
      subtasksOf: () => [],
      subtaskCount: () => null,
    });

    expect(describeItems(items)).toEqual([
      'grupo programado (2)',
      'linha A',
      'linha B',
      'add programado',
      'gap programado',
      'grupo pausado (1) recolhido',
      'gap pausado',
    ]);
  });

  it('a mãe aberta mostra as subtarefas logo abaixo, um nível para dentro', () => {
    const parent = task({ name: 'Mãe' });
    const items = buildListItems({
      groups: [group(OPEN, [parent, task({ name: 'Outra' })])],
      collapsedGroups: new Set(),
      expandedTasks: new Set([parent.id]),
      subtasksOf: (id) =>
        id === parent.id ? [task({ name: 'Filha 1' }), task({ name: 'Filha 2' })] : [],
      subtaskCount: (id) => (id === parent.id ? 2 : 0),
    });

    expect(describeItems(items)).toEqual([
      'grupo programado (2)',
      'linha Mãe [expansível aberta]',
      '  linha Filha 1',
      '  linha Filha 2',
      'linha Outra',
      'add programado',
      'gap programado',
    ]);
  });

  it('só é expansível quem tem subtarefas abertas conferidas', () => {
    const counted = task({ name: 'Com' });
    const zero = task({ name: 'Zero' });
    const unknown = task({ name: 'Sem conferir' });
    const items = buildListItems({
      groups: [group(OPEN, [counted, zero, unknown])],
      collapsedGroups: new Set(),
      expandedTasks: new Set([zero.id, unknown.id]),
      subtasksOf: () => [],
      subtaskCount: (id) => (id === counted.id ? 3 : id === zero.id ? 0 : null),
    });

    expect(describeItems(items).slice(1, 4)).toEqual([
      'linha Com [expansível]',
      'linha Zero',
      'linha Sem conferir',
    ]);
  });
});

describe('itemHeight', () => {
  it('usa as alturas medidas no ClickUp', () => {
    const row = task();
    expect(ITEM_HEIGHT).toEqual({ group: 72, groupCollapsed: 40, row: 35, add: 37, gap: 6 });
    expect(
      [
        { kind: 'group', key: 'a', status: OPEN, count: 1, collapsed: false },
        { kind: 'group', key: 'a', status: OPEN, count: 1, collapsed: true },
        { kind: 'row', task: row, depth: 0, expandable: false, expanded: false },
        { kind: 'add', groupKey: 'a' },
        { kind: 'gap', groupKey: 'a' },
      ].map((item) => itemHeight(item as ListItem)),
    ).toEqual([72, 40, 35, 37, 6]);
  });
});
