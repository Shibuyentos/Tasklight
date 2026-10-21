import { useHref, useLocation, useNavigate } from '@solidjs/router';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  on,
  splitProps,
  useContext,
} from 'solid-js';

export type ListView = 'tasks' | 'today';

export type AppLocation =
  | { kind: 'list'; workspaceId: string; view: ListView }
  | { kind: 'task'; workspaceId: string; taskId: string };

const LIST_PATH = /^\/([^/]+)\/my-work\/(tasks|today)\/?$/;
const TASK_PATH = /^\/t\/([^/]+)\/([^/]+)\/?$/;

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseAppLocation(pathname: string): AppLocation | null {
  const list = LIST_PATH.exec(pathname);
  if (list) {
    const workspaceId = decode(list[1] ?? '');
    return workspaceId ? { kind: 'list', workspaceId, view: list[2] as ListView } : null;
  }
  const detail = TASK_PATH.exec(pathname);
  if (detail) {
    const workspaceId = decode(detail[1] ?? '');
    const taskId = decode(detail[2] ?? '');
    return workspaceId && taskId ? { kind: 'task', workspaceId, taskId } : null;
  }
  return null;
}

export function listPath(workspaceId: string, view: ListView): string {
  return `/${encodeURIComponent(workspaceId)}/my-work/${view}`;
}

export function taskPath(workspaceId: string, taskId: string): string {
  return `/t/${encodeURIComponent(workspaceId)}/${encodeURIComponent(taskId)}`;
}

/** De onde o detalhe foi aberto: a visão de fundo e a ordem das linhas naquele momento. */
interface Origin {
  workspaceId: string;
  view: ListView;
  /** Ordem congelada para anterior/próxima; vazia quando aberto sem uma lista por trás. */
  sequence: readonly string[];
  /** Caminho da entrada do histórico criada ao abrir (atualizado por anterior/próxima). */
  path: string;
}

export interface TaskNavigation {
  /** Visão de lista que fica atrás do detalhe (ou a atual, sem detalhe aberto). */
  background(): ListView;
  open(taskId: string, options?: { sequence?: readonly string[] }): void;
  close(): void;
  step(direction: 1 | -1): void;
  neighbors(): { previous: string | null; next: string | null };
}

const Context = createContext<TaskNavigation | null>(null);

/**
 * Abrir pela lista empilha uma entrada no histórico; anterior/próxima trocam essa entrada; fechar
 * volta a ela quando a origem é desta sessão (senão, substitui pelo fundo, como num link direto).
 */
export function createTaskNavigation(): TaskNavigation {
  const location = useLocation();
  const navigate = useNavigate();
  const current = createMemo(() => parseAppLocation(location.pathname));
  const [lastView, setLastView] = createSignal<ListView>('tasks');
  const [origin, setOrigin] = createSignal<Origin | null>(null);
  let closing = false;

  createEffect(
    on(current, (value) => {
      closing = false;
      if (value?.kind === 'list') setLastView(value.view);
      const live = origin();
      if (live && value && value.workspaceId !== live.workspaceId) setOrigin(null);
    }),
  );

  /** A origem só vale para a entrada que ela mesma criou. */
  const liveOrigin = () => {
    const value = current();
    const live = origin();
    return value?.kind === 'task' && live && live.path === location.pathname ? live : null;
  };

  const background = (): ListView => {
    const value = current();
    if (value?.kind === 'list') return value.view;
    return liveOrigin()?.view ?? (value?.kind === 'task' ? 'tasks' : lastView());
  };

  const neighbors = () => {
    const value = current();
    const live = liveOrigin();
    if (value?.kind !== 'task' || !live) return { previous: null, next: null };
    const index = live.sequence.indexOf(value.taskId);
    if (index < 0) return { previous: null, next: null };
    return {
      previous: live.sequence[index - 1] ?? null,
      next: live.sequence[index + 1] ?? null,
    };
  };

  return {
    background,
    neighbors,
    open(taskId, options) {
      const value = current();
      if (!value) return;
      const path = taskPath(value.workspaceId, taskId);
      setOrigin({
        workspaceId: value.workspaceId,
        view: background(),
        sequence: [...new Set(options?.sequence ?? [])],
        path,
      });
      navigate(path, { scroll: false, resolve: false });
    },
    close() {
      const value = current();
      if (value?.kind !== 'task' || closing) return;
      closing = true;
      const live = liveOrigin();
      if (live) {
        navigate(-1);
        return;
      }
      navigate(listPath(value.workspaceId, 'tasks'), {
        replace: true,
        scroll: false,
        resolve: false,
      });
    },
    step(direction) {
      const value = current();
      const live = liveOrigin();
      const target = direction === 1 ? neighbors().next : neighbors().previous;
      if (value?.kind !== 'task' || !live || !target) return;
      const path = taskPath(value.workspaceId, target);
      setOrigin({ ...live, path });
      navigate(path, { replace: true, scroll: false, resolve: false });
    },
  };
}

export function TaskNavigationProvider(props: { children: JSX.Element }) {
  const navigation = createTaskNavigation();
  return <Context.Provider value={navigation}>{props.children}</Context.Provider>;
}

/** `null` fora do roteador (telas de teste da lista, por exemplo). */
export function useTaskNavigation(): TaskNavigation | null {
  return useContext(Context);
}

export interface TaskLinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  workspaceId: string;
  taskId: string;
  /** Abertura local; recebe a navegação para registrar a origem (ordem da lista). */
  onOpen: () => void;
}

/** Âncora real para o detalhe: clique comum abre por cima da lista; Ctrl, meio e nova aba seguem o href. */
export function TaskLink(props: TaskLinkProps) {
  const [local, others] = splitProps(props, ['workspaceId', 'taskId', 'onOpen', 'onClick']);
  const href = useHref(() => taskPath(local.workspaceId, local.taskId));
  return (
    <a
      {...others}
      href={href()}
      onClick={(event) => {
        if (typeof local.onClick === 'function') local.onClick(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        local.onOpen();
      }}
    />
  );
}
