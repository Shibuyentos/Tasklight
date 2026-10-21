export type StatusType = 'open' | 'unstarted' | 'custom' | 'done' | 'closed';

export interface TaskStatus {
  name: string;
  color: string;
  type: StatusType;
  orderindex: number;
}

export type Priority = 'urgent' | 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  customId: string | null;
  name: string;
  url: string;
  status: TaskStatus;
  priority: Priority | null;
  /** Tipo de tarefa do ClickUp (`custom_item_id`); 0 é a "Tarefa" padrão. */
  customItemId: number;
  parentId: string | null;
  listId: string;
  spaceId: string;
  assigneeIds: number[];
  dueDate: number | null;
  startDate: number | null;
  /** Posição manual da tarefa na lista; desempata a ordenação. */
  orderindex: number;
  hasDescription: boolean;
  dateCreated: number;
  dateUpdated: number;
  dateClosed: number | null;
  dateDone: number | null;
  archived: boolean;
}
