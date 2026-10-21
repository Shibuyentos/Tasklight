import { createSignal } from 'solid-js';
import { ApiError, TaskCreationConfirmationError } from '../api/errors';
import type { TaskDetailApi } from '../api/task-detail';
import {
  type CustomField,
  type CustomFieldInput,
  customFieldBody,
  fieldAppliesTo,
  normalizeCustomField,
} from '../domain/custom-fields';
import { type CommentDraft, type CreatedComment, commentBody } from '../domain/rich-comment';
import type { Task } from '../domain/task';
import {
  array,
  type NewTaskInput,
  numeric,
  object,
  type TaskChanges,
  type TaskDetail,
} from '../domain/task-detail';
import type { TasksStore } from '../store/tasks';
import { RETENTION_MS, type TaskDetailsService } from './task-detail';

export interface TaskActionError {
  kind: 'offline' | 'pending' | 'uncertain' | 'failed' | 'disposed';
  taskId: string;
  keys: string[];
  cause?: unknown;
  createdTaskId?: string | null;
}
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: TaskActionError };
export interface TaskActions {
  /** `display` ajusta o que a tela mostra enquanto espera (ex.: cor e tipo do status escolhido). */
  update(
    taskId: string,
    changes: TaskChanges,
    display?: Partial<Task>,
  ): Promise<ActionResult<TaskDetail>>;
  setField(
    taskId: string,
    field: CustomField,
    value: CustomFieldInput,
  ): Promise<ActionResult<void>>;
  clearField(taskId: string, field: CustomField): Promise<ActionResult<void>>;
  addTag(taskId: string, name: string): Promise<ActionResult<void>>;
  removeTag(taskId: string, name: string): Promise<ActionResult<void>>;
  toggleChecklist(
    taskId: string,
    checklistId: string,
    itemId: string,
    resolved: boolean,
  ): Promise<ActionResult<void>>;
  comment(
    taskId: string,
    draft: CommentDraft,
    parentId?: string,
  ): Promise<ActionResult<CreatedComment | null>>;
  create(input: NewTaskInput): Promise<ActionResult<TaskDetail>>;
  pending(taskId: string, key?: string): boolean;
  error(): TaskActionError | null;
  clearError(): void;
  dispose(): void;
}
export interface TaskActionsDeps {
  api: TaskDetailApi;
  store: TasksStore;
  details: TaskDetailsService;
  isOnline?: () => boolean;
  now?: () => number;
  onChange?: () => void;
}
export function createTaskActionsService(deps: TaskActionsDeps): TaskActions {
  const { api, store, details } = deps;
  const online = deps.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
  const now = deps.now ?? Date.now;
  const [pendingKeys, setPendingKeys] = createSignal<Record<string, string[]>>({});
  const [error, setError] = createSignal<TaskActionError | null>(null);
  let disposed = false;
  let serial = 0;
  let lastStarted = 0;
  const operations = new Set<string>();
  function fail(
    kind: TaskActionError['kind'],
    id: string,
    keys: string[],
    cause?: unknown,
  ): ActionResult<never> {
    const problem = { kind, taskId: id, keys, cause };
    if (!disposed) {
      lastStarted = ++serial;
      setError(problem);
    }
    return { ok: false, error: problem };
  }
  async function run<T>(
    id: string,
    keys: string[],
    post: boolean,
    work: () => Promise<T>,
    options: {
      summary?: Partial<Task>;
      detail?: (value: TaskDetail) => TaskDetail;
      confirm?: (value: T) => void;
      refresh?: (value: T) => Promise<void>;
    } = {},
  ): Promise<ActionResult<T>> {
    if (disposed) return fail('disposed', id, keys);
    if (!online()) return fail('offline', id, keys);
    if (keys.some((key) => pendingKeys()[id]?.includes(key))) return fail('pending', id, keys);
    const sequence = ++serial;
    lastStarted = sequence;
    setError(null);
    const operation = `write:${sequence}`;
    operations.add(operation);
    setPendingKeys((previous) => ({ ...previous, [id]: [...(previous[id] ?? []), ...keys] }));
    details.invalidate(id);
    if (options.summary) store.beginOptimistic(operation, id, options.summary);
    if (options.detail) details.beginOptimistic(operation, id, options.detail);
    try {
      const value = await work();
      if (disposed) return { ok: false, error: { kind: 'disposed', taskId: id, keys } };
      options.confirm?.(value);
      if (options.confirm) deps.onChange?.();
      // A escrita já foi confirmada. Uma falha na leitura seguinte nunca vira falha de POST.
      details.invalidate(id);
      try {
        await options.refresh?.(value);
      } catch {
        /* O detalhe sinaliza os erros de leitura. */
      }
      if (disposed) return { ok: false, error: { kind: 'disposed', taskId: id, keys } };
      deps.onChange?.();
      return { ok: true, value };
    } catch (cause) {
      const uncertain =
        post &&
        (cause instanceof TaskCreationConfirmationError ||
          !(cause instanceof ApiError) ||
          ['network', 'timeout', 'server'].includes(cause.kind));
      const problem: TaskActionError = {
        kind: disposed ? 'disposed' : uncertain ? 'uncertain' : 'failed',
        taskId: id,
        keys,
        cause,
        ...(cause instanceof TaskCreationConfirmationError ? { createdTaskId: cause.taskId } : {}),
      };
      if (!disposed && sequence === lastStarted) setError(problem);
      return { ok: false, error: problem };
    } finally {
      store.endOptimistic(operation);
      details.endOptimistic(operation);
      operations.delete(operation);
      if (!disposed)
        setPendingKeys((previous) => ({
          ...previous,
          [id]: (previous[id] ?? []).filter((key) => !keys.includes(key)),
        }));
    }
  }
  function summaryPatch(changes: TaskChanges, previous: Task): Partial<Task> {
    const patch: Partial<Task> = {};
    for (const key of [
      'name',
      'priority',
      'assigneeIds',
      'dueDate',
      'startDate',
      'customItemId',
    ] as const) {
      if (changes[key] !== undefined) Object.assign(patch, { [key]: changes[key] });
    }
    if (changes.status !== undefined) patch.status = { ...previous.status, name: changes.status };
    if (changes.markdownDescription !== undefined)
      patch.hasDescription = changes.markdownDescription.trim().length > 0;
    return patch;
  }
  function detailPatch(value: TaskDetail, changes: TaskChanges): TaskDetail {
    return {
      ...value,
      ...(changes.markdownDescription !== undefined
        ? { markdownDescription: changes.markdownDescription }
        : {}),
      ...(changes.timeEstimate !== undefined ? { timeEstimate: changes.timeEstimate } : {}),
      ...(changes.dueDateTime !== undefined ? { dueDateTime: changes.dueDateTime } : {}),
      ...(changes.startDateTime !== undefined ? { startDateTime: changes.startDateTime } : {}),
    };
  }
  function requireField(id: string, field: CustomField) {
    const task = store.confirmedTask(id);
    if (!task || !field.editable || !fieldAppliesTo(field, task.customItemId))
      throw new ApiError('http', 'Campo não editável nesta tarefa', { status: 400 });
  }
  function optimisticField(field: CustomField, input: CustomFieldInput): CustomField {
    const body = customFieldBody(field, input);
    let value: unknown = body.value;
    if (field.type === 'users') {
      const delta = object(body.value);
      const removed = new Set(array(delta.rem));
      const current = array(field.value).filter((user) => !removed.has(numeric(object(user).id)));
      const existing = new Set(current.map((user) => numeric(object(user).id)));
      value = [
        ...current,
        ...array(delta.add)
          .filter((id) => !existing.has(numeric(id)))
          .map((id) => ({ id })),
      ];
    }
    const normalized = normalizeCustomField({
      id: field.id,
      name: field.name,
      type: field.type,
      type_config: field.typeConfig,
      value,
    });
    return { ...field, value: normalized.value, displayValue: normalized.displayValue };
  }
  return {
    update(id, changes, display) {
      const previous = store.confirmedTask(id);
      const keys = Object.keys(changes).filter(
        (key) => changes[key as keyof TaskChanges] !== undefined,
      );
      if (!previous)
        return Promise.resolve(fail('failed', id, keys, new Error('Tarefa indisponível')));
      const summary = { ...summaryPatch(changes, previous), ...display };
      return run(id, keys, false, () => api.updateTask(id, changes, previous), {
        summary,
        detail: (value) => detailPatch(value, changes),
        // A resposta é a tarefa inteira nessa versão: inclui mudanças de outras pessoas nos
        // demais campos, e uma resposta mais antiga que a guardada é ignorada pelo upsert.
        confirm: (value) => store.upsertTasks([value.task]),
        refresh: () => details.refreshTask(id),
      });
    },
    setField(id, field, value) {
      try {
        requireField(id, field);
        customFieldBody(field, value);
      } catch (cause) {
        return Promise.resolve(fail('failed', id, [`field:${field.id}`], cause));
      }
      return run(
        id,
        [`field:${field.id}`],
        true,
        async () => {
          requireField(id, field);
          customFieldBody(field, value);
          await api.setField(id, field, value);
        },
        {
          detail: (detail) => ({
            ...detail,
            customFields: detail.customFields.map((current) =>
              current.id === field.id ? optimisticField(current, value) : current,
            ),
          }),
          refresh: () => details.refreshTask(id),
        },
      );
    },
    clearField(id, field) {
      return run(
        id,
        [`field:${field.id}`],
        false,
        async () => {
          requireField(id, field);
          await api.removeField(id, field.id);
        },
        {
          detail: (detail) => ({
            ...detail,
            customFields: detail.customFields.map((current) =>
              current.id === field.id
                ? { ...current, value: undefined, displayValue: '' }
                : current,
            ),
          }),
          refresh: () => details.refreshTask(id),
        },
      );
    },
    addTag(id, name) {
      return run(id, [`tag:${name}`], true, () => api.addTag(id, name), {
        detail: (detail) => ({
          ...detail,
          tags: detail.tags.some((tag) => tag.name === name)
            ? detail.tags
            : [...detail.tags, { name, foreground: null, background: null }],
        }),
        refresh: () => details.refreshTask(id),
      });
    },
    removeTag(id, name) {
      return run(id, [`tag:${name}`], false, () => api.removeTag(id, name), {
        detail: (detail) => ({ ...detail, tags: detail.tags.filter((tag) => tag.name !== name) }),
        refresh: () => details.refreshTask(id),
      });
    },
    toggleChecklist(id, checklistId, itemId, resolved) {
      return run(
        id,
        [`checklist:${checklistId}:${itemId}`],
        false,
        () => api.setChecklistItem(checklistId, itemId, resolved),
        {
          detail: (detail) => ({
            ...detail,
            checklists: detail.checklists.map((list) =>
              list.id === checklistId
                ? {
                    ...list,
                    items: list.items.map((item) =>
                      item.id === itemId ? { ...item, resolved } : item,
                    ),
                  }
                : list,
            ),
          }),
          refresh: () => details.refreshTask(id),
        },
      );
    },
    comment(id, draft, parentId) {
      try {
        commentBody(draft);
      } catch (cause) {
        return Promise.resolve(fail('failed', id, [`comment:${parentId ?? 'root'}`], cause));
      }
      return run(
        id,
        [`comment:${parentId ?? 'root'}`],
        true,
        async () => {
          if (parentId) {
            await api.addReply(parentId, draft);
            return null;
          }
          return api.addComment(id, draft);
        },
        { refresh: () => details.refreshComments(id, parentId) },
      );
    },
    create(input) {
      try {
        if (!input.name.trim() || !input.listId) throw new Error('Nome e lista obrigatórios');
        for (const { field, value } of input.customFields ?? []) {
          if (!fieldAppliesTo(field, input.customItemId ?? 0))
            throw new Error('Campo indisponível para este tipo');
          customFieldBody(field, value);
        }
      } catch (cause) {
        return Promise.resolve(fail('failed', '@create', [`list:${input.listId}`], cause));
      }
      return run('@create', [`list:${input.listId}`], true, () => api.createTask(input), {
        confirm(value) {
          store.upsertTasks([value.task]);
          store.retainTask(value.task.id, now() + RETENTION_MS);
        },
        refresh: (value) => details.refreshTask(value.task.id),
      });
    },
    pending(id, key) {
      const keys = pendingKeys()[id] ?? [];
      return key === undefined ? keys.length > 0 : keys.includes(key);
    },
    error,
    clearError() {
      setError(null);
    },
    dispose() {
      disposed = true;
      for (const operation of operations) {
        store.endOptimistic(operation);
        details.endOptimistic(operation);
      }
      operations.clear();
      setPendingKeys({});
      setError(null);
    },
  };
}
