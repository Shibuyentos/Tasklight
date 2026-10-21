import { batch } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { compareTasks } from '../domain/grouping';
import type { Task } from '../domain/task';

export interface TaskType {
  id: number;
  name: string;
  /** Nome do ícone no Font Awesome (ex.: 'code'); `null` usa o ícone padrão. */
  icon: string | null;
}

/** Indicadores carregados sob demanda para as linhas visíveis. */
export interface RowDetail {
  subtasksCheckedAt: number | null;
  attachments: number | null;
  attachmentsCheckedAt: number | null;
  /** `dateUpdated` da tarefa quando os indicadores foram lidos. */
  forUpdated: number;
}

export interface SyncMeta {
  /** Maior `dateUpdated` já recebido: base da próxima consulta de alterações. */
  cursor: number | null;
  lastFullSync: number | null;
}

export interface TasksState {
  tasks: Record<string, Task>;
  taskTypes: Record<number, TaskType>;
  rowDetails: Record<string, RowDetail>;
  meta: SyncMeta;
  /** Tarefas abertas no detalhe ficam guardadas até esse instante, mesmo sem atribuição. */
  retainedUntil?: Record<string, number>;
  /**
   * Raízes que a última reconciliação das atribuídas não trouxe, com a versão de então. Saem da
   * tela sem que os responsáveis guardados mudem; uma versão mais nova da tarefa as devolve.
   */
  assignedRootExclusions?: Record<string, number>;
}

export interface TasksStore {
  readonly state: TasksState;
  upsertTasks(tasks: Task[]): void;
  removeTasks(ids: string[]): void;
  retainTask(id: string, until: number): void;
  pruneRetention(now: number): void;
  reconcileAssignedRoots(ids: string[]): void;
  beginOptimistic(operation: string, id: string, patch: Partial<Task>): void;
  endOptimistic(operation: string): void;
  confirmedTask(id: string): Task | undefined;
  setTaskTypes(types: TaskType[]): void;
  setRowDetail(taskId: string, patch: Partial<RowDetail>): void;
  setMeta(patch: Partial<SyncMeta>): void;
  replace(state: TasksState): void;
  /** Cópia simples, sem proxies, pronta para ser persistida. */
  snapshot(): TasksState;
}

const EMPTY_ROW_DETAIL: RowDetail = {
  subtasksCheckedAt: null,
  attachments: null,
  attachmentsCheckedAt: null,
  forUpdated: 0,
};

export function emptyTasksState(): TasksState {
  return { tasks: {}, taskTypes: {}, rowDetails: {}, meta: { cursor: null, lastFullSync: null } };
}

export function createTasksStore(initial: TasksState = emptyTasksState()): TasksStore {
  // Versões vindas do servidor. A tela mostra cada uma com as edições ainda em andamento por cima;
  // o snapshot grava só as confirmadas.
  let confirmed: Record<string, Task> = structuredClone(unwrap(initial.tasks));
  const overlays = new Map<string, { id: string; patch: Partial<Task> }>();
  const [state, setState] = createStore<TasksState>(initial);
  function publish(id: string) {
    const base = confirmed[id];
    if (!base) return;
    const visible = { ...base };
    for (const overlay of overlays.values()) {
      if (overlay.id === id) Object.assign(visible, overlay.patch);
    }
    setState('tasks', id, reconcile(structuredClone(unwrap(visible))));
  }

  return {
    state,

    upsertTasks(tasks) {
      batch(() => {
        for (const task of tasks) {
          // Mesma versão (ou uma mais antiga que chegou atrasada): nada a re-renderizar.
          const current = confirmed[task.id];
          if (current && current.dateUpdated >= task.dateUpdated) continue;
          if (
            state.assignedRootExclusions?.[task.id] !== undefined &&
            task.dateUpdated > (state.assignedRootExclusions[task.id] ?? 0)
          )
            setState(
              produce((draft) => {
                if (draft.assignedRootExclusions) delete draft.assignedRootExclusions[task.id];
              }),
            );
          confirmed[task.id] = structuredClone(unwrap(task));
          publish(task.id);
        }
      });
    },

    confirmedTask(id) {
      return confirmed[id] && structuredClone(confirmed[id]);
    },
    beginOptimistic(operation, id, patch) {
      overlays.set(operation, { id, patch: structuredClone(unwrap(patch)) });
      publish(id);
    },
    endOptimistic(operation) {
      const overlay = overlays.get(operation);
      overlays.delete(operation);
      if (overlay) publish(overlay.id);
    },
    reconcileAssignedRoots(ids) {
      const assigned = new Set(ids);
      setState(
        'assignedRootExclusions',
        reconcile(
          Object.fromEntries(
            Object.values(confirmed)
              .filter((task) => task.parentId === null && !assigned.has(task.id))
              .map((task) => [task.id, task.dateUpdated]),
          ),
        ),
      );
    },
    retainTask(id, until) {
      setState('retainedUntil', {
        ...state.retainedUntil,
        [id]: Math.max(state.retainedUntil?.[id] ?? 0, until),
      });
    },
    pruneRetention(now) {
      setState(
        'retainedUntil',
        reconcile(
          Object.fromEntries(
            Object.entries(state.retainedUntil ?? {}).filter(([, until]) => until > now),
          ),
        ),
      );
    },

    removeTasks(ids) {
      setState(
        produce((draft) => {
          for (const id of ids) {
            delete confirmed[id];
            for (const [key, value] of overlays) if (value.id === id) overlays.delete(key);
            if (draft.retainedUntil) delete draft.retainedUntil[id];
            if (draft.assignedRootExclusions) delete draft.assignedRootExclusions[id];
            delete draft.tasks[id];
            delete draft.rowDetails[id];
          }
        }),
      );
    },

    setTaskTypes(types) {
      setState('taskTypes', reconcile(Object.fromEntries(types.map((type) => [type.id, type]))));
    },

    setRowDetail(taskId, patch) {
      setState('rowDetails', taskId, (current) => ({ ...EMPTY_ROW_DETAIL, ...current, ...patch }));
    },

    setMeta(patch) {
      setState('meta', patch);
    },

    replace(next) {
      confirmed = structuredClone(unwrap(next.tasks));
      overlays.clear();
      setState(reconcile(next));
    },

    snapshot() {
      return structuredClone({ ...unwrap(state), tasks: confirmed });
    },
  };
}

/** Linhas da aba Tarefas: tarefas raiz, não arquivadas, com o usuário entre os responsáveis. */
export function assignedRoots(state: TasksState, userId: number): Task[] {
  return Object.values(state.tasks).filter(
    (task) =>
      task.parentId === null &&
      !task.archived &&
      task.assigneeIds.includes(userId) &&
      state.assignedRootExclusions?.[task.id] === undefined,
  );
}

/** Subtarefas que contam no "⤷ N": de qualquer responsável, menos as fechadas e as arquivadas. */
export function openSubtasks(state: TasksState, parentId: string): Task[] {
  return Object.values(state.tasks)
    .filter((task) => task.parentId === parentId && task.status.type !== 'closed' && !task.archived)
    .sort(compareTasks);
}

/** `null` enquanto as subtarefas da tarefa ainda não foram conferidas na API. */
export function openSubtaskCount(state: TasksState, parentId: string): number | null {
  const checkedAt = state.rowDetails[parentId]?.subtasksCheckedAt ?? null;
  if (checkedAt === null) return null;
  return openSubtasks(state, parentId).length;
}
