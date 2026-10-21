import { Navigate, type RouteSectionProps, useLocation, useParams } from '@solidjs/router';
import { createEffect, onCleanup, Show } from 'solid-js';
import { MyTasksPage } from '../features/my-tasks/MyTasksPage';
import { useServices } from './ServicesContext';
import { listPath, parseAppLocation, useTaskNavigation } from './task-navigation';

/**
 * Layout das rotas do workspace: a URL escolhe o workspace, a lista fica montada aqui (fora do
 * outlet) e o detalhe de tarefa entra por cima dela, sem recriar a lista ao abrir ou fechar.
 */
export function WorkspaceRoute(props: RouteSectionProps) {
  const services = useServices();
  const { session } = services;
  const params = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const navigation = useTaskNavigation();
  const authorized = () =>
    session.state.workspaces.some((workspace) => workspace.id === params.workspaceId);
  const fallbackId = () =>
    session.state.workspaces.find((workspace) => workspace.id === session.state.workspaceId)?.id ??
    session.state.workspaces[0]?.id;
  // Workspace sem acesso: volta para a lista equivalente do workspace válido, sem levar a tarefa.
  const fallbackPath = (id: string) => {
    const current = parseAppLocation(location.pathname);
    const view = current?.kind === 'list' ? current.view : 'tasks';
    const query = current?.kind === 'list' ? `${location.search}${location.hash}` : '';
    return `${listPath(id, view)}${query}`;
  };

  createEffect(() => {
    const id = params.workspaceId;
    if (!authorized() || session.state.workspaceId === id) return;
    let cancelled = false;
    // O seletor muda a sessão antes de navegar; concilia depois que ambos terminarem.
    queueMicrotask(() => {
      if (!cancelled && session.state.workspaceId !== id) session.selectWorkspace(id);
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const ready = () => {
    if (session.state.workspaceId !== params.workspaceId) return false;
    const current = services.workspace?.();
    return !current || current.workspaceId === params.workspaceId;
  };

  return (
    <Show
      when={authorized()}
      fallback={<Show when={fallbackId()}>{(id) => <Navigate href={fallbackPath(id())} />}</Show>}
    >
      <Show when={ready()}>
        <MyTasksPage filter={navigation?.background() === 'today' ? 'today' : 'all'} />
        {props.children}
      </Show>
    </Show>
  );
}
