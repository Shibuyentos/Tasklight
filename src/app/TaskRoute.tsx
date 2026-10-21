import { useParams } from '@solidjs/router';
import { lazy, Show, Suspense } from 'solid-js';
import { useServices } from './ServicesContext';
import { useTaskNavigation } from './task-navigation';

const TaskDetailModal = lazy(() => import('../features/task-detail/TaskDetailModal'));

/** Folha da rota /t/:workspaceId/:taskId: só o detalhe, por cima da lista do layout. */
export function TaskRoute() {
  const params = useParams<{ workspaceId: string; taskId: string }>();
  const services = useServices();
  const navigation = useTaskNavigation();
  const workspace = () => services.workspace?.() ?? null;

  return (
    <Show when={workspace()}>
      {(current) => (
        <Suspense>
          <TaskDetailModal
            workspace={current()}
            taskId={params.taskId}
            hasPrevious={navigation?.neighbors().previous != null}
            hasNext={navigation?.neighbors().next != null}
            onStep={(direction) => navigation?.step(direction)}
            onClose={() => navigation?.close()}
          />
        </Suspense>
      )}
    </Show>
  );
}
