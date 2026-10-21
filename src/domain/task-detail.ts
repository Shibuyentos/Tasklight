import type { CustomField } from './custom-fields';
import { normalizeCustomField } from './custom-fields';
import { normalizeTask } from './normalize';
import type { Priority, Task, TaskStatus } from './task';

export interface TaskUser {
  id: number;
  name: string;
  email: string | null;
  color: string | null;
  initials: string;
  avatarUrl: string | null;
}
export interface BreadcrumbPart {
  id: string;
  name: string;
}
export interface TaskBreadcrumb {
  space: BreadcrumbPart | null;
  folder: BreadcrumbPart | null;
  list: BreadcrumbPart | null;
}
export interface TaskTag {
  name: string;
  foreground: string | null;
  background: string | null;
}
export interface ChecklistItem {
  id: string;
  name: string;
  resolved: boolean;
  assignee: TaskUser | null;
  parentId: string | null;
}
export interface TaskChecklist {
  id: string;
  name: string;
  items: ChecklistItem[];
}
export interface TaskAttachment {
  id: string;
  title: string;
  url: string | null;
  mimeType: string | null;
}
export interface TaskDetail {
  task: Task;
  markdownDescription: string;
  description: string;
  creator: TaskUser | null;
  assignees: TaskUser[];
  tags: TaskTag[];
  timeEstimate: number | null;
  timeSpent: number | null;
  dueDateTime: boolean;
  startDateTime: boolean;
  checklists: TaskChecklist[];
  attachments: TaskAttachment[];
  subtasks: Task[];
  customFields: CustomField[];
  breadcrumb: TaskBreadcrumb;
}
export interface ListMetadata {
  id: string;
  name: string;
  statuses: TaskStatus[];
  customFields: CustomField[];
  members: TaskUser[];
  breadcrumb: TaskBreadcrumb;
  permissionLevel: string | null;
}
export interface ListChoice {
  id: string;
  name: string;
  spaceId: string;
  spaceName: string;
  folderId: string | null;
  folderName: string | null;
}
export interface StatusDuration {
  name: string;
  color: string;
  minutes: number;
  since: number | null;
  current: boolean;
}
/** Omitir mantém o valor; null limpa somente os campos que aceitam null. Datas/tempo em ms. */
export interface TaskChanges {
  name?: string;
  markdownDescription?: string;
  status?: string;
  priority?: Priority | null;
  assigneeIds?: number[];
  dueDate?: number | null;
  dueDateTime?: boolean;
  startDate?: number | null;
  startDateTime?: boolean;
  timeEstimate?: number | null;
  customItemId?: number;
}
export interface NewTaskInput extends TaskChanges {
  listId: string;
  name: string;
  customFields?: Array<{ field: CustomField; value: import('./custom-fields').CustomFieldInput }>;
}

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : fallback;
}
export function numeric(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '' || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeUser(value: unknown): TaskUser | null {
  const user = object(value);
  const id = numeric(user.id);
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return null;
  return {
    id,
    name: text(user.username ?? user.name),
    email: typeof user.email === 'string' ? user.email : null,
    color: typeof user.color === 'string' ? user.color : null,
    initials: text(user.initials),
    avatarUrl: safeUrl(user.profilePicture ?? user.profile_picture),
  };
}
export function normalizeUsers(value: unknown): TaskUser[] {
  return array(value)
    .map(normalizeUser)
    .filter((user): user is TaskUser => user !== null);
}
function part(value: unknown): BreadcrumbPart | null {
  const item = object(value);
  const id = text(item.id);
  return id ? { id, name: text(item.name) } : null;
}
export function normalizeBreadcrumb(value: unknown): TaskBreadcrumb {
  const dto = object(value);
  return {
    space: part(dto.space),
    folder: object(dto.folder).hidden === true ? null : part(dto.folder),
    list: part(dto.list),
  };
}
export function normalizeStatus(value: unknown): TaskStatus {
  const dto = object(value);
  const type = text(dto.type);
  return {
    name: text(dto.status),
    color: text(dto.color),
    type:
      type === 'open' || type === 'unstarted' || type === 'done' || type === 'closed'
        ? type
        : 'custom',
    orderindex: numeric(dto.orderindex) ?? 0,
  };
}
/** Todos os dados usados pelo resumo devem estar presentes; null explícito é distinto de ausência. */
export function isCompleteTask(value: unknown): boolean {
  const dto = object(value);
  const status = object(dto.status);
  const nullableText = (item: unknown) => item === null || typeof item === 'string';
  // normalizeDetail serializa estes números via text(); números fracionários não são representáveis.
  const summaryNumber = (item: unknown) =>
    typeof item === 'string'
      ? numeric(item) !== null
      : typeof item === 'number' && Number.isSafeInteger(item);
  const nullableNumber = (item: unknown) => item === null || summaryNumber(item);
  const typeId = numeric(dto.custom_item_id);
  const priorityId = numeric(object(dto.priority).id);
  return (
    typeof dto.id === 'string' &&
    dto.id !== '' &&
    typeof dto.name === 'string' &&
    nullableText(dto.custom_id) &&
    (dto.custom_item_id === null ||
      (typeId !== null && Number.isSafeInteger(typeId) && typeId >= 0)) &&
    nullableText(dto.text_content) &&
    safeUrl(dto.url) !== null &&
    typeof status.status === 'string' &&
    typeof status.color === 'string' &&
    typeof status.type === 'string' &&
    numeric(status.orderindex) !== null &&
    typeof object(dto.list).id === 'string' &&
    text(object(dto.list).id) !== '' &&
    typeof object(dto.space).id === 'string' &&
    text(object(dto.space).id) !== '' &&
    Array.isArray(dto.assignees) &&
    dto.assignees.every((user) => normalizeUser(user) !== null) &&
    (dto.priority === null ||
      (priorityId !== null &&
        Number.isInteger(priorityId) &&
        priorityId >= 1 &&
        priorityId <= 4)) &&
    nullableText(dto.parent) &&
    nullableNumber(dto.due_date) &&
    nullableNumber(dto.start_date) &&
    summaryNumber(dto.date_created) &&
    summaryNumber(dto.date_updated) &&
    nullableNumber(dto.date_closed) &&
    nullableNumber(dto.date_done) &&
    typeof dto.archived === 'boolean' &&
    summaryNumber(dto.orderindex)
  );
}
export function normalizeDetail(value: unknown): TaskDetail {
  const dto = object(value);
  const status = normalizeStatus(dto.status);
  const assignees = normalizeUsers(dto.assignees);
  const priority = object(dto.priority);
  const task = normalizeTask({
    id: text(dto.id),
    name: text(dto.name),
    custom_id: dto.custom_id == null ? null : text(dto.custom_id),
    custom_item_id: numeric(dto.custom_item_id),
    text_content: text(dto.text_content ?? dto.description ?? dto.markdown_description),
    url: safeUrl(dto.url) ?? '',
    status: {
      status: status.name,
      color: status.color,
      type: status.type,
      orderindex: status.orderindex,
    },
    orderindex: text(dto.orderindex),
    date_created: text(dto.date_created),
    date_updated: text(dto.date_updated),
    date_closed: dto.date_closed == null ? null : text(dto.date_closed),
    date_done: dto.date_done == null ? null : text(dto.date_done),
    archived: dto.archived === true,
    assignees,
    parent: dto.parent == null ? null : text(dto.parent),
    priority:
      dto.priority == null ? null : { id: text(priority.id), priority: text(priority.priority) },
    due_date: dto.due_date == null ? null : text(dto.due_date),
    start_date: dto.start_date == null ? null : text(dto.start_date),
    list: { id: text(object(dto.list).id) },
    space: { id: text(object(dto.space).id) },
  });
  return {
    task,
    markdownDescription: text(dto.markdown_description),
    description: text(dto.description ?? dto.text_content),
    creator: normalizeUser(dto.creator),
    assignees,
    tags: array(dto.tags).map((value) => {
      const tag = object(value);
      return {
        name: text(tag.name),
        foreground: typeof tag.tag_fg === 'string' ? tag.tag_fg : null,
        background: typeof tag.tag_bg === 'string' ? tag.tag_bg : null,
      };
    }),
    timeEstimate: numeric(dto.time_estimate),
    timeSpent: numeric(dto.time_spent),
    dueDateTime: dto.due_date_time === true,
    startDateTime: dto.start_date_time === true,
    checklists: array(dto.checklists).map((value) => {
      const checklist = object(value);
      return {
        id: text(checklist.id),
        name: text(checklist.name),
        items: array(checklist.items).map((value) => {
          const item = object(value);
          return {
            id: text(item.id),
            name: text(item.name),
            resolved: item.resolved === true,
            assignee: normalizeUser(item.assignee),
            parentId: item.parent == null ? null : text(item.parent),
          };
        }),
      };
    }),
    attachments: array(dto.attachments).map((value) => {
      const item = object(value);
      return {
        id: text(item.id),
        title: text(item.title ?? item.name),
        url: safeUrl(item.url),
        mimeType: typeof item.mimetype === 'string' ? item.mimetype : null,
      };
    }),
    subtasks: array(dto.subtasks).map((value) => normalizeDetail(value).task),
    customFields: array(dto.custom_fields).map(normalizeCustomField),
    breadcrumb: normalizeBreadcrumb(dto),
  };
}
