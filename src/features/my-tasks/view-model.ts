import type { StatusGroup } from '../../domain/grouping';
import type { Task, TaskStatus } from '../../domain/task';

export type ListItem =
  | { kind: 'group'; key: string; status: TaskStatus; count: number; collapsed: boolean }
  | { kind: 'row'; task: Task; depth: 0 | 1; expandable: boolean; expanded: boolean }
  | { kind: 'add'; groupKey: string }
  | { kind: 'gap'; groupKey: string };

export type RowItem = Extract<ListItem, { kind: 'row' }>;
export type GroupItem = Extract<ListItem, { kind: 'group' }>;

/** Alturas medidas na aba Tarefas do ClickUp (1919×910). */
export const ITEM_HEIGHT = { group: 72, groupCollapsed: 40, row: 35, add: 37, gap: 6 } as const;

export interface ListInput {
  groups: StatusGroup[];
  collapsedGroups: ReadonlySet<string>;
  expandedTasks: ReadonlySet<string>;
  subtasksOf: (taskId: string) => Task[];
  /** `null` enquanto as subtarefas não foram conferidas. */
  subtaskCount: (taskId: string) => number | null;
}

/** Achata os grupos na sequência de itens da lista virtual. */
export function buildListItems(input: ListInput): ListItem[] {
  const items: ListItem[] = [];
  for (const group of input.groups) {
    const collapsed = input.collapsedGroups.has(group.key);
    items.push({
      kind: 'group',
      key: group.key,
      status: group.status,
      count: group.tasks.length,
      collapsed,
    });
    if (!collapsed) {
      for (const task of group.tasks) {
        const expandable = (input.subtaskCount(task.id) ?? 0) > 0;
        const expanded = expandable && input.expandedTasks.has(task.id);
        items.push({ kind: 'row', task, depth: 0, expandable, expanded });
        if (!expanded) continue;
        for (const subtask of input.subtasksOf(task.id)) {
          items.push({ kind: 'row', task: subtask, depth: 1, expandable: false, expanded: false });
        }
      }
      items.push({ kind: 'add', groupKey: group.key });
    }
    items.push({ kind: 'gap', groupKey: group.key });
  }
  return items;
}

export function itemHeight(item: ListItem): number {
  switch (item.kind) {
    case 'group':
      return item.collapsed ? ITEM_HEIGHT.groupCollapsed : ITEM_HEIGHT.group;
    case 'row':
      return ITEM_HEIGHT.row;
    case 'add':
      return ITEM_HEIGHT.add;
    case 'gap':
      return ITEM_HEIGHT.gap;
  }
}

/** Chave estável do item, para a lista virtual reaproveitar o DOM. */
export function itemKey(item: ListItem): string {
  switch (item.kind) {
    case 'group':
      return `group:${item.key}:${item.collapsed ? 'closed' : 'open'}`;
    case 'row':
      return `row:${item.depth}:${item.task.id}`;
    case 'add':
      return `add:${item.groupKey}`;
    case 'gap':
      return `gap:${item.groupKey}`;
  }
}
