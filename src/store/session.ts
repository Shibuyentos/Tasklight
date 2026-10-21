import { createStore, type SetStoreFunction } from 'solid-js/store';

export type SessionStatus = 'booting' | 'needs-token' | 'offline-error' | 'ready';
export type SessionNotice = 'invalid-token' | 'network' | 'storage' | null;

export interface SessionUser {
  id: number;
  username: string;
  initials: string;
  color: string;
  profilePicture: string | null;
  /** Fuso do usuário no ClickUp; as datas sem hora são lidas nele. */
  timezone: string;
  /** Primeiro dia da semana (0 = domingo). */
  weekStartDay: number;
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
}

export interface SessionState {
  status: SessionStatus;
  notice: SessionNotice;
  user: SessionUser | null;
  workspaces: Workspace[];
  workspaceId: string | null;
}

export function createSessionStore(): [get: SessionState, set: SetStoreFunction<SessionState>] {
  return createStore<SessionState>({
    status: 'booting',
    notice: null,
    user: null,
    workspaces: [],
    workspaceId: null,
  });
}
