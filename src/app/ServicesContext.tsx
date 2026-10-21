import { createContext, type JSX, useContext } from 'solid-js';
import type { DateContext } from '../domain/dates';
import type { TasksStore } from '../store/tasks';
import type { SessionService } from '../sync/session';
import type { TaskSync } from '../sync/tasks';

/** Dados e sincronização do workspace aberto. */
export interface WorkspaceServices {
  workspaceId: string;
  userId: number;
  store: TasksStore;
  sync: TaskSync;
  dateContext: () => DateContext;
}

export interface Services {
  session: SessionService;
  /** `null` enquanto o workspace ainda não abriu. */
  workspace?: () => WorkspaceServices | null;
}

const ServicesContext = createContext<Services>();

export function ServicesProvider(props: { services: Services; children: JSX.Element }) {
  return (
    <ServicesContext.Provider value={props.services}>{props.children}</ServicesContext.Provider>
  );
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('useServices precisa estar dentro de <ServicesProvider>');
  return services;
}
