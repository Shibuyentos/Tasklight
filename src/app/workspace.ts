import type { Requester } from '../api/scheduler';
import { createTaskDetailApi, type TaskDetailApi } from '../api/task-detail';
import type { DateContext } from '../domain/dates';
import { createSaveScheduler, type SnapshotStore } from '../persistence/snapshot';
import { createTaskDetailsCache, type TaskDetailsCache } from '../persistence/task-details';
import { createTasksStore } from '../store/tasks';
import { createTaskActionsService } from '../sync/task-actions';
import { createTaskDetailsService } from '../sync/task-detail';
import { createTaskSync } from '../sync/tasks';
import { createTasksApi, type TasksApi } from '../sync/tasks-api';
import type { WorkspaceServices } from './ServicesContext';

export interface OpenWorkspace extends WorkspaceServices {
  /** Grava agora o que esperava para ser salvo (ao esconder ou fechar a aba). */
  flush(): Promise<void>;
  /** Para a sincronização e grava o estado. */
  dispose(): Promise<void>;
}

export interface WorkspaceDeps {
  workspaceId: string;
  userId: number;
  requester: Requester;
  snapshots: SnapshotStore;
  dateContext: () => DateContext;
  /** Substitui as consultas de tarefas (testes). */
  api?: TasksApi;
  detailApi?: TaskDetailApi;
  detailCache?: TaskDetailsCache;
  isOnline?: () => boolean;
}

/** Abre o workspace pelo snapshot local e liga a sincronização, que segue em segundo plano. */
export async function createWorkspaceServices(deps: WorkspaceDeps): Promise<OpenWorkspace> {
  const saved = await deps.snapshots.loadWorkspace(deps.workspaceId, deps.userId);
  const store = createTasksStore(saved ?? undefined);
  const saver = createSaveScheduler(() =>
    deps.snapshots.saveWorkspace(deps.workspaceId, deps.userId, store.snapshot()),
  );
  const detailApi = deps.detailApi ?? createTaskDetailApi(deps.requester, deps.workspaceId);
  const details = createTaskDetailsService({
    api: detailApi,
    store,
    workspaceId: deps.workspaceId,
    userId: deps.userId,
    cache: deps.detailCache ?? createTaskDetailsCache(),
    isOnline: deps.isOnline,
    onChange: () => saver.schedule(),
  });
  const actions = createTaskActionsService({
    api: detailApi,
    store,
    details,
    isOnline: deps.isOnline,
    onChange: () => saver.schedule(),
  });
  const sync = createTaskSync({
    store,
    api: deps.api ?? createTasksApi(deps.requester, deps.workspaceId, deps.userId),
    userId: deps.userId,
    isOnline: deps.isOnline,
    onChange: () => {
      saver.schedule();
      details.notifySummaryChanges();
    },
  });
  void sync.start();

  return {
    workspaceId: deps.workspaceId,
    userId: deps.userId,
    store,
    sync,
    details,
    actions,
    dateContext: deps.dateContext,
    async flush() {
      await Promise.all([saver.flush(), details.flush()]);
    },
    async dispose() {
      sync.stop();
      actions.dispose();
      const detailSaves = details.flush();
      details.dispose();
      await Promise.all([saver.flush(), detailSaves]);
    },
  };
}
