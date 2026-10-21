import { batch, createSignal, untrack } from 'solid-js';
import { ApiError } from '../api/errors';
import type { Task } from '../domain/task';
import type { RowDetail, TasksStore } from '../store/tasks';
import type { TasksApi } from './tasks-api';

export type SyncStatus = 'idle' | 'loading' | 'syncing' | 'offline' | 'error';

export interface TaskSync {
  readonly status: () => SyncStatus;
  start(): Promise<void>;
  stop(): void;
  /** Botão Atualizar: reconcilia as tarefas atribuídas agora. */
  refresh(): Promise<void>;
  pollOnce(): Promise<void>;
  /** Completa subtarefas e anexos das linhas em tela, quando faltam ou estão velhos. */
  requestRowDetails(taskIds: string[]): void;
}

export interface TaskSyncDeps {
  store: TasksStore;
  api: TasksApi;
  userId: number;
  now?: () => number;
  isOnline?: () => boolean;
  /** Chamado depois de cada mudança aplicada no store (o app agenda o snapshot). */
  onChange?: () => void;
}

export const POLL_INTERVAL_MS = 30_000;
export const FULL_SYNC_INTERVAL_MS = 7_200_000;
export const BACKLOG_LIMIT_MS = 21_600_000;
export const ROW_DETAIL_TTL_MS = 21_600_000;

/** Sobreposição do delta: pega mudanças do mesmo segundo que ainda não apareciam na consulta. */
const CURSOR_OVERLAP_MS = 1000;
/** Folga para o relógio local ao recomeçar o cursor depois de um backlog longo. */
const CLOCK_MARGIN_MS = 10 * 60_000;

function browserOnline(): boolean {
  try {
    return globalThis.navigator?.onLine ?? true;
  } catch {
    return true;
  }
}

function statusFor(error: unknown): SyncStatus {
  const offline =
    error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout');
  return offline ? 'offline' : 'error';
}

const newest = (tasks: Task[], start: number) =>
  tasks.reduce((max, task) => Math.max(max, task.dateUpdated), start);

export function createTaskSync(deps: TaskSyncDeps): TaskSync {
  const { store, api, userId } = deps;
  const now = deps.now ?? (() => Date.now());
  const isOnline = deps.isOnline ?? browserOnline;
  const [status, setStatus] = createSignal<SyncStatus>('idle');

  // Cada start/stop abre uma geração; respostas de uma geração anterior são descartadas.
  let generation = 0;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let current: { generation: number; promise: Promise<void> } | null = null;
  let overlapNext = true;
  let loadingTypes = false;
  const detailsInFlight = new Set<string>();

  const alive = (gen: number) => gen === generation;
  const changed = () => deps.onChange?.();
  const isEmpty = () => Object.keys(store.state.tasks).length === 0;

  function needsFullSync(): boolean {
    const { cursor, lastFullSync } = store.state.meta;
    return (
      isEmpty() || lastFullSync === null || cursor === null || now() - cursor > BACKLOG_LIMIT_MS
    );
  }

  function fullSyncDue(): boolean {
    const { lastFullSync } = store.state.meta;
    return lastFullSync === null || now() - lastFullSync >= FULL_SYNC_INTERVAL_MS;
  }

  /** Uma sincronização por vez; quem chama durante uma em andamento recebe a mesma. */
  function exclusive(work: (gen: number) => Promise<void>): Promise<void> {
    if (current?.generation === generation) return current.promise;
    const gen = generation;
    const promise = work(gen).finally(() => {
      if (current?.promise === promise) current = null;
    });
    current = { generation: gen, promise };
    return promise;
  }

  /** As raízes informadas e todos os descendentes guardados delas. */
  function withDescendants(roots: Set<string>): string[] {
    const removed = new Set(roots);
    const tasks = Object.values(store.state.tasks);
    let grew = true;
    while (grew) {
      grew = false;
      for (const task of tasks) {
        if (task.parentId !== null && removed.has(task.parentId) && !removed.has(task.id)) {
          removed.add(task.id);
          grew = true;
        }
      }
    }
    return [...removed];
  }

  /** Do delta só entra o que a tela usa: o que já está guardado, raízes do usuário e filhas delas. */
  function relevant(updates: Task[]): Task[] {
    const known = new Set(Object.keys(store.state.tasks));
    const accepted: Task[] = [];
    let pending = updates;
    let grew = true;
    while (grew) {
      grew = false;
      const rest: Task[] = [];
      for (const task of pending) {
        const wanted =
          known.has(task.id) ||
          (task.parentId === null ? task.assigneeIds.includes(userId) : known.has(task.parentId));
        if (wanted) {
          accepted.push(task);
          known.add(task.id);
          grew = true;
        } else {
          rest.push(task);
        }
      }
      pending = rest;
    }
    return accepted;
  }

  async function fullSync(gen: number): Promise<void> {
    const startedAt = now();
    setStatus(isEmpty() ? 'loading' : 'syncing');
    try {
      const roots = await api.fetchAssignedRoots((page) => {
        if (!alive(gen)) return;
        // Tarefas compartilhadas podem vir de espaços ausentes da lista do workspace.
        store.upsertTasks(page);
        changed();
      });
      if (!alive(gen)) return;
      const fresh = new Set(roots.map((task) => task.id));
      const stale = Object.values(store.state.tasks)
        .filter((task) => task.parentId === null && !fresh.has(task.id))
        .map((task) => task.id);
      const seen = newest(roots, store.state.meta.cursor ?? 0);
      // Depois de muito tempo fora, o cursor recomeça perto de agora em vez de percorrer o backlog.
      const cursor = startedAt - seen > BACKLOG_LIMIT_MS ? startedAt - CLOCK_MARGIN_MS : seen;
      batch(() => {
        store.upsertTasks(roots);
        store.removeTasks(withDescendants(new Set(stale)));
        store.setMeta({ lastFullSync: now(), cursor });
      });
      setStatus('idle');
      changed();
    } catch (error) {
      if (alive(gen)) setStatus(statusFor(error));
    }
  }

  async function poll(gen: number): Promise<void> {
    const cursor = store.state.meta.cursor;
    if (cursor === null) return fullSync(gen);
    try {
      // A sobreposição só se repete logo depois de um avanço: em silêncio, nada é baixado de novo.
      const updates = await api.fetchUpdatedSince(
        overlapNext ? cursor - CURSOR_OVERLAP_MS : cursor,
      );
      if (!alive(gen)) return;
      const accepted = relevant(updates);
      const seen = newest(updates, cursor);
      overlapNext = seen > cursor;
      batch(() => {
        if (accepted.length > 0) store.upsertTasks(accepted);
        if (seen > cursor) store.setMeta({ cursor: seen });
      });
      setStatus('idle');
      if (accepted.length > 0 || seen > cursor) changed();
    } catch (error) {
      if (alive(gen)) setStatus(statusFor(error));
    }
  }

  async function loadTaskTypes(gen: number): Promise<void> {
    if (loadingTypes || Object.keys(store.state.taskTypes).length > 0) return;
    loadingTypes = true;
    try {
      const types = await api.fetchTaskTypes();
      if (!alive(gen)) return;
      store.setTaskTypes(types);
      changed();
    } catch {
      // Sem os tipos, as linhas usam o ícone padrão; o próximo ciclo tenta de novo.
    } finally {
      loadingTypes = false;
    }
  }

  function tick() {
    if (!isOnline()) {
      setStatus('offline');
      return;
    }
    void exclusive(async (gen) => {
      void loadTaskTypes(gen);
      if (needsFullSync() || fullSyncDue()) await fullSync(gen);
      else await poll(gen);
    });
  }

  function detailIsFresh(task: Task, detail: RowDetail | undefined): boolean {
    if (!detail || detail.forUpdated !== task.dateUpdated) return false;
    const { subtasksCheckedAt, attachmentsCheckedAt } = detail;
    if (subtasksCheckedAt === null || attachmentsCheckedAt === null) return false;
    const oldest = Math.min(subtasksCheckedAt, attachmentsCheckedAt);
    return now() - oldest <= ROW_DETAIL_TTL_MS;
  }

  async function loadRowDetail(gen: number, taskId: string, forUpdated: number): Promise<void> {
    const [subtasks, attachments] = await Promise.allSettled([
      api.fetchOpenSubtasks(taskId),
      api.fetchAttachmentsCount(taskId),
    ]);
    if (!alive(gen)) return;
    const at = now();
    const patch: Partial<RowDetail> = {};
    batch(() => {
      if (subtasks.status === 'fulfilled') {
        // O que não veio deixou de estar aberto (fechada, excluída ou movida).
        const open = new Set(subtasks.value.map((task) => task.id));
        const gone = Object.values(store.state.tasks)
          .filter((task) => task.parentId === taskId && !open.has(task.id))
          .map((task) => task.id);
        if (gone.length > 0) store.removeTasks(gone);
        store.upsertTasks(subtasks.value);
        patch.subtasksCheckedAt = at;
      }
      if (attachments.status === 'fulfilled') {
        patch.attachments = attachments.value;
        patch.attachmentsCheckedAt = at;
      }
      // Só marca a versão quando os dois indicadores vieram; senão o próximo pedido tenta de novo.
      if (subtasks.status === 'fulfilled' && attachments.status === 'fulfilled') {
        patch.forUpdated = forUpdated;
      }
      if (Object.keys(patch).length > 0) store.setRowDetail(taskId, patch);
    });
    if (Object.keys(patch).length > 0) changed();
  }

  return {
    status,

    // Os métodos públicos leem o store sem rastrear: chamados de dentro de um efeito, não fazem o
    // efeito rodar de novo a cada mudança nas tarefas.
    start() {
      return untrack(() => {
        clearInterval(timer);
        generation += 1;
        stopped = false;
        overlapNext = true;
        timer = setInterval(tick, POLL_INTERVAL_MS);
        if (!isOnline()) {
          setStatus('offline');
          return Promise.resolve();
        }
        return exclusive(async (gen) => {
          void loadTaskTypes(gen);
          if (needsFullSync()) return fullSync(gen);
          await poll(gen);
          // O delta agiliza as mudanças recentes; a abertura também recupera omissões do snapshot.
          if (alive(gen)) await fullSync(gen);
        });
      });
    },

    stop() {
      generation += 1;
      stopped = true;
      clearInterval(timer);
      timer = undefined;
      current = null;
      detailsInFlight.clear();
    },

    async refresh() {
      if (!isOnline()) {
        setStatus('offline');
        return;
      }
      await current?.promise;
      await untrack(() => exclusive(fullSync));
    },

    pollOnce() {
      return untrack(() => exclusive(poll));
    },

    requestRowDetails(taskIds) {
      untrack(() => {
        if (stopped) return;
        const gen = generation;
        for (const id of taskIds) {
          const task = store.state.tasks[id];
          if (!task || task.parentId !== null || detailsInFlight.has(id)) continue;
          if (detailIsFresh(task, store.state.rowDetails[id])) continue;
          detailsInFlight.add(id);
          void loadRowDetail(gen, id, task.dateUpdated).finally(() => {
            detailsInFlight.delete(id);
          });
        }
      });
    },
  };
}
