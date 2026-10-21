import type { Requester } from '../api/scheduler';
import type { DateContext } from '../domain/dates';
import { createSaveScheduler, type SnapshotStore } from '../persistence/snapshot';
import { createTasksStore } from '../store/tasks';
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
  isOnline?: () => boolean;
}

/** Abre o workspace pelo snapshot local e liga a sincronização, que segue em segundo plano. */
export async function createWorkspaceServices(deps: WorkspaceDeps): Promise<OpenWorkspace> {
  const saved = await deps.snapshots.loadWorkspace(deps.workspaceId, deps.userId);
  const store = createTasksStore(saved ?? undefined);
  const saver = createSaveScheduler(() =>
    deps.snapshots.saveWorkspace(deps.workspaceId, deps.userId, store.snapshot()),
  );
  const sync = createTaskSync({
    store,
    api: deps.api ?? createTasksApi(deps.requester, deps.workspaceId, deps.userId),
    userId: deps.userId,
    isOnline: deps.isOnline,
    onChange: () => saver.schedule(),
  });
  void sync.start();

  return {
    workspaceId: deps.workspaceId,
    userId: deps.userId,
    store,
    sync,
    dateContext: deps.dateContext,
    flush: () => saver.flush(),
    async dispose() {
      sync.stop();
      await saver.flush();
    },
  };
}
