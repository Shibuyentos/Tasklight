import {
  type CustomField,
  type CustomFieldInput,
  customFieldBody,
  fieldAppliesTo,
} from '../domain/custom-fields';
import { type CommentDraft, type CreatedComment, commentBody } from '../domain/rich-comment';
import type { Task } from '../domain/task';
import {
  isCompleteTask,
  type NewTaskInput,
  normalizeDetail,
  numeric,
  object,
  type TaskChanges,
  type TaskDetail,
  text,
} from '../domain/task-detail';
import type { HttpMethod } from './http';
import type { Requester } from './scheduler';

const PRIORITIES = { urgent: 1, high: 2, normal: 3, low: 4 } as const;
/** Remapeia apenas as propriedades presentes. assigneeIds representa o conjunto desejado. */
export function taskChangesBody(changes: TaskChanges, previous: Task): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const mapping = {
    name: 'name',
    markdownDescription: 'markdown_content',
    status: 'status',
    dueDate: 'due_date',
    dueDateTime: 'due_date_time',
    startDate: 'start_date',
    startDateTime: 'start_date_time',
    timeEstimate: 'time_estimate',
    customItemId: 'custom_item_id',
  } as const;
  for (const key of Object.keys(mapping) as Array<keyof typeof mapping>)
    if (changes[key] !== undefined) body[mapping[key]] = changes[key];
  if (changes.priority !== undefined)
    body.priority = changes.priority === null ? null : PRIORITIES[changes.priority];
  if (changes.assigneeIds !== undefined)
    body.assignees = {
      add: [...new Set(changes.assigneeIds)].filter((id) => !previous.assigneeIds.includes(id)),
      rem: previous.assigneeIds.filter((id) => !changes.assigneeIds?.includes(id)),
    };
  return body;
}
export function createTaskActions(
  requester: Requester,
  getTask: (id: string) => Promise<TaskDetail>,
) {
  async function write(method: HttpMethod, path: string, body?: unknown): Promise<unknown> {
    if (!requester.request) throw new Error('Transporte de escrita indisponível');
    return requester.request<unknown>(method, path, {
      priority: 'interactive',
      invalidateSessionOnUnauthorized: false,
      ...(body === undefined ? {} : { body }),
    });
  }
  const taskPath = (id: string) => `/task/${encodeURIComponent(id)}`;
  return {
    async updateTask(id: string, changes: TaskChanges, previous: Task): Promise<TaskDetail> {
      const result = await write('PUT', taskPath(id), taskChangesBody(changes, previous));
      return isCompleteTask(result) ? normalizeDetail(result) : getTask(id);
    },
    async setField(id: string, field: CustomField, value: CustomFieldInput): Promise<void> {
      await write(
        'POST',
        `${taskPath(id)}/field/${encodeURIComponent(field.id)}`,
        customFieldBody(field, value),
      );
    },
    async removeField(id: string, fieldId: string): Promise<void> {
      await write('DELETE', `${taskPath(id)}/field/${encodeURIComponent(fieldId)}`);
    },
    async addTag(id: string, tag: string): Promise<void> {
      await write('POST', `${taskPath(id)}/tag/${encodeURIComponent(tag)}`);
    },
    async removeTag(id: string, tag: string): Promise<void> {
      await write('DELETE', `${taskPath(id)}/tag/${encodeURIComponent(tag)}`);
    },
    async setChecklistItem(checklistId: string, itemId: string, resolved: boolean): Promise<void> {
      await write(
        'PUT',
        `/checklist/${encodeURIComponent(checklistId)}/checklist_item/${encodeURIComponent(itemId)}`,
        { resolved },
      );
    },
    async addComment(id: string, draft: CommentDraft): Promise<CreatedComment> {
      const dto = object(await write('POST', `${taskPath(id)}/comment`, commentBody(draft)));
      return {
        id: text(dto.id),
        histId: dto.hist_id == null ? null : text(dto.hist_id),
        date: numeric(dto.date),
      };
    },
    async addReply(commentId: string, draft: CommentDraft): Promise<void> {
      await write('POST', `/comment/${encodeURIComponent(commentId)}/reply`, commentBody(draft));
    },
    async createTask(input: NewTaskInput): Promise<TaskDetail> {
      if (!input.name.trim() || !input.listId) throw new Error('Nome e lista obrigatórios');
      const empty = normalizeDetail({}).task;
      const body = taskChangesBody(input, empty);
      if (input.assigneeIds !== undefined) body.assignees = [...new Set(input.assigneeIds)];
      body.check_required_custom_fields = true;
      if (input.customFields)
        body.custom_fields = input.customFields.map(({ field, value }) => {
          if (!fieldAppliesTo(field, input.customItemId ?? 0))
            throw new Error('Campo incompatível com o tipo da tarefa');
          return { id: field.id, ...customFieldBody(field, value) };
        });
      const result = await write('POST', `/list/${encodeURIComponent(input.listId)}/task`, body);
      if (isCompleteTask(result)) return normalizeDetail(result);
      const id = text(object(result).id);
      if (!id) throw new Error('Resposta de criação sem identificador de tarefa');
      return getTask(id);
    },
  };
}
