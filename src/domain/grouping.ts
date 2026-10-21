import type { StatusType, Task, TaskStatus } from './task';

export interface StatusGroup {
  /** Nome do status em minúsculas: listas diferentes com o mesmo nome caem no mesmo grupo. */
  key: string;
  status: TaskStatus;
  tasks: Task[];
}

/** Ordem dos tipos de status na aba Tarefas do ClickUp. */
export const STATUS_TYPE_RANK: Readonly<Record<StatusType, number>> = {
  open: 0,
  unstarted: 1,
  custom: 2,
  done: 3,
  closed: 4,
};

export function isComplete(type: StatusType): boolean {
  return type === 'done' || type === 'closed';
}

/** Vencimento decrescente, sem data por último; empate pela posição manual da tarefa. */
export function compareTasks(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return b.dueDate - a.dueDate;
  }
  if (a.orderindex !== b.orderindex) return a.orderindex - b.orderindex;
  return a.id.localeCompare(b.id);
}

function compareGroups(a: StatusGroup, b: StatusGroup): number {
  const byType = STATUS_TYPE_RANK[a.status.type] - STATUS_TYPE_RANK[b.status.type];
  if (byType !== 0) return byType;
  if (a.status.orderindex !== b.status.orderindex) return a.status.orderindex - b.status.orderindex;
  return a.key.localeCompare(b.key, 'pt-BR');
}

/** Agrupa as tarefas raiz por status, como a aba Tarefas com as subtarefas recolhidas. */
export function groupByStatus(tasks: Task[], options: { showClosed: boolean }): StatusGroup[] {
  const groups = new Map<string, StatusGroup>();
  for (const task of tasks) {
    if (task.parentId !== null || task.archived) continue;
    if (!options.showClosed && task.status.type === 'closed') continue;
    const key = task.status.name.toLowerCase();
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { key, status: task.status, tasks: [task] });
      continue;
    }
    // O status de menor posição representa o grupo quando listas diferentes divergem.
    if (task.status.orderindex < group.status.orderindex) group.status = task.status;
    group.tasks.push(task);
  }
  const result = [...groups.values()];
  for (const group of result) group.tasks.sort(compareTasks);
  return result.sort(compareGroups);
}
