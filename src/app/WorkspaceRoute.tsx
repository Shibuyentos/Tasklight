import { Navigate, type RouteSectionProps, useLocation, useParams } from '@solidjs/router';
import { createEffect, onCleanup, Show } from 'solid-js';
import { useServices } from './ServicesContext';

/** A URL escolhe o workspace; dados de uma abertura anterior aguardam a troca. */
export function WorkspaceRoute(props: RouteSectionProps) {
  const services = useServices();
  const { session } = services;
  const params = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const authorized = () =>
    session.state.workspaces.some((workspace) => workspace.id === params.workspaceId);
  const fallbackId = () =>
    session.state.workspaces.find((workspace) => workspace.id === session.state.workspaceId)?.id ??
    session.state.workspaces[0]?.id;
  const fallbackPath = (id: string) => {
    const view = location.pathname.endsWith('/my-work/today') ? 'today' : 'tasks';
    return `/${id}/my-work/${view}${location.search}${location.hash}`;
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
      <Show when={ready()}>{props.children}</Show>
    </Show>
  );
}
