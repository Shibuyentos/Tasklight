import type { QueryValue } from './http';
import type { Requester, RequestPriority } from './scheduler';
import type { ApiCustomItem, ApiTask } from './types';

export interface TeamTasksQuery {
  assignees?: number[];
  parent?: string;
  subtasks?: boolean;
  includeClosed?: boolean;
  dateUpdatedGt?: number;
  orderBy?: 'updated' | 'created' | 'due_date';
}

export interface FetchAllOptions {
  priority: RequestPriority;
  onPage?: (tasks: ApiTask[], page: number) => void;
  maxPages?: number;
}

/** O ClickUp devolve no máximo 100 tarefas por página. */
const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 50;

export function teamTasksParams(query: TeamTasksQuery, page: number): Record<string, QueryValue> {
  const params: Record<string, QueryValue> = { page };
  if (query.assignees !== undefined) params['assignees[]'] = query.assignees;
  if (query.parent !== undefined) params.parent = query.parent;
  if (query.subtasks !== undefined) params.subtasks = query.subtasks;
  if (query.includeClosed !== undefined) params.include_closed = query.includeClosed;
  if (query.dateUpdatedGt !== undefined) params.date_updated_gt = query.dateUpdatedGt;
  if (query.orderBy !== undefined) params.order_by = query.orderBy;
  return params;
}

/** Lê todas as páginas de `GET /team/{id}/task`; `maxPages` protege contra uma API que não termina. */
export async function fetchAllTeamTasks(
  requester: Requester,
  teamId: string,
  query: TeamTasksQuery,
  options: FetchAllOptions,
): Promise<ApiTask[]> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const all: ApiTask[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const body = await requester.get<{ tasks: ApiTask[]; last_page?: boolean }>(
      `/team/${teamId}/task`,
      { query: teamTasksParams(query, page), priority: options.priority },
    );
    all.push(...body.tasks);
    options.onPage?.(body.tasks, page);
    if (body.last_page !== false || body.tasks.length < PAGE_SIZE) break;
  }
  return all;
}

export async function fetchAttachmentsCount(
  requester: Requester,
  taskId: string,
  priority: RequestPriority,
): Promise<number> {
  const body = await requester.get<{ attachments?: unknown[] }>(`/task/${taskId}`, { priority });
  return body.attachments?.length ?? 0;
}

export async function fetchCustomTaskTypes(
  requester: Requester,
  teamId: string,
  priority?: RequestPriority,
): Promise<ApiCustomItem[]> {
  const { custom_items } = await requester.get<{ custom_items: ApiCustomItem[] }>(
    `/team/${teamId}/custom_item`,
    priority ? { priority } : undefined,
  );
  return custom_items.map(({ id, name, avatar }) => ({ id, name, avatar }));
}
