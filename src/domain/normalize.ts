import type { ApiTask } from '../api/types';
import type { Priority, StatusType, Task } from './task';

const STATUS_TYPES: ReadonlySet<string> = new Set([
  'open',
  'unstarted',
  'custom',
  'done',
  'closed',
]);

const PRIORITY_BY_ID: Readonly<Record<string, Priority>> = {
  '1': 'urgent',
  '2': 'high',
  '3': 'normal',
  '4': 'low',
};

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeTask(dto: ApiTask): Task {
  return {
    id: dto.id,
    customId: dto.custom_id ?? null,
    name: dto.name,
    url: dto.url,
    status: {
      name: dto.status.status,
      color: dto.status.color,
      type: STATUS_TYPES.has(dto.status.type) ? (dto.status.type as StatusType) : 'custom',
      orderindex: dto.status.orderindex,
    },
    priority: dto.priority ? (PRIORITY_BY_ID[dto.priority.id] ?? null) : null,
    customItemId: dto.custom_item_id ?? 0,
    parentId: dto.parent ?? null,
    listId: dto.list.id,
    spaceId: dto.space.id,
    assigneeIds: dto.assignees.map((assignee) => assignee.id),
    dueDate: toNumber(dto.due_date),
    startDate: toNumber(dto.start_date),
    orderindex: toNumber(dto.orderindex) ?? 0,
    hasDescription: (dto.text_content ?? '').trim() !== '',
    dateCreated: toNumber(dto.date_created) ?? 0,
    dateUpdated: toNumber(dto.date_updated) ?? 0,
    dateClosed: toNumber(dto.date_closed),
    dateDone: toNumber(dto.date_done),
    archived: dto.archived === true,
  };
}
