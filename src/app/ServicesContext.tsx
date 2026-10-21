import { createContext, type JSX, useContext } from 'solid-js';
import type { SessionService } from '../sync/session';

export interface Services {
  session: SessionService;
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
