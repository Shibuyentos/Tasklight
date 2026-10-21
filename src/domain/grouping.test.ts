// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareTasks, groupByStatus, isComplete } from './grouping';
import type { Task, TaskStatus } from './task';

const STATUS = {
  programado: { name: 'programado', color: '#3397dd', type: 'open', orderindex: 0 },
  pausado: { name: 'pausado', color: '#f5b724', type: 'custom', orderindex: 4 },
  analisePr: { name: 'pendente analise pr', color: '#0c9395', type: 'custom', orderindex: 8 },
  aceite: { name: 'aceite usuário', color: '#27b569', type: 'done', orderindex: 18 },
  concluido: { name: 'concluído', color: '#008844', type: 'closed', orderindex: 21 },
} satisfies Record<string, TaskStatus>;

let sequence = 0;
function task(overrides: Partial<Task> & { status: TaskStatus }): Task {
  sequence += 1;
  return {
    id: `t${sequence}`,
    customId: null,
    name: `Tarefa ${sequence}`,
    url: `https://exemplo.com/t${sequence}`,
    priority: null,
    customItemId: 0,
    parentId: null,
    listId: 'lista',
    spaceId: 'espaco',
    assigneeIds: [1],
    dueDate: null,
    startDate: null,
    orderindex: sequence,
    hasDescription: false,
    dateCreated: 0,
    dateUpdated: 0,
    dateClosed: null,
    dateDone: null,
    archived: false,
    ...overrides,
  };
}

const day = (iso: string) => new Date(`${iso}T04:00:00-03:00`).getTime();

describe('groupByStatus', () => {
  it('ordena os grupos por tipo de status e depois pela posição do status', () => {
    const tasks = [
      task({ status: STATUS.concluido }),
      task({ status: STATUS.aceite }),
      task({ status: STATUS.analisePr }),
      task({ status: STATUS.programado }),
      task({ status: STATUS.pausado }),
    ];

    const keys = groupByStatus(tasks, { showClosed: true }).map((group) => group.key);

    expect(keys).toEqual([
      'programado',
      'pausado',
      'pendente analise pr',
      'aceite usuário',
      'concluído',
    ]);
  });

  it('só tarefas raiz e não arquivadas viram linhas', () => {
    const root = task({ status: STATUS.pausado });
    const groups = groupByStatus(
      [
        root,
        task({ status: STATUS.pausado, parentId: root.id }),
        task({ status: STATUS.pausado, archived: true }),
      ],
      { showClosed: true },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual([root.id]);
  });

  it('pode ocultar os grupos de tarefas fechadas', () => {
    const groups = groupByStatus(
      [task({ status: STATUS.aceite }), task({ status: STATUS.concluido })],
      { showClosed: false },
    );

    expect(groups.map((group) => group.key)).toEqual(['aceite usuário']);
  });

  it('agrupa pelo nome do status sem diferenciar maiúsculas', () => {
    const upper = { ...STATUS.pausado, name: 'Pausado' };
    const groups = groupByStatus([task({ status: STATUS.pausado }), task({ status: upper })], {
      showClosed: true,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.tasks).toHaveLength(2);
  });

  it('desempata grupos de mesmo tipo e posição pelo nome', () => {
    const fila = {
      name: 'fila',
      color: '#656f7d',
      type: 'open',
      orderindex: 0,
    } satisfies TaskStatus;
    const groups = groupByStatus([task({ status: STATUS.programado }), task({ status: fila })], {
      showClosed: true,
    });

    expect(groups.map((group) => group.key)).toEqual(['fila', 'programado']);
  });

  it('ordena as linhas por vencimento decrescente, com as sem data por último', () => {
    const tasks = [
      task({ status: STATUS.analisePr, dueDate: null, orderindex: 2 }),
      task({ status: STATUS.analisePr, dueDate: day('2026-08-28') }),
      task({ status: STATUS.analisePr, dueDate: day('2026-11-10') }),
      task({ status: STATUS.analisePr, dueDate: null, orderindex: 1 }),
      task({ status: STATUS.analisePr, dueDate: day('2026-11-03') }),
    ];

    const [group] = groupByStatus(tasks, { showClosed: true });

    expect(group?.tasks.map((t) => t.dueDate)).toEqual([
      day('2026-11-10'),
      day('2026-11-03'),
      day('2026-08-28'),
      null,
      null,
    ]);
    expect(group?.tasks.slice(3).map((t) => t.orderindex)).toEqual([1, 2]);
  });
});

describe('compareTasks', () => {
  it('desempata vencimentos iguais pela posição da tarefa', () => {
    const later = task({ status: STATUS.aceite, dueDate: day('2026-08-14'), orderindex: 5 });
    const earlier = task({ status: STATUS.aceite, dueDate: day('2026-08-14'), orderindex: 3 });

    expect([later, earlier].sort(compareTasks).map((t) => t.orderindex)).toEqual([3, 5]);
  });
});

describe('isComplete', () => {
  it.each([
    ['done', true],
    ['closed', true],
    ['custom', false],
    ['open', false],
  ] as const)('%s → %s', (type, expected) => {
    expect(isComplete(type)).toBe(expected);
  });
});
