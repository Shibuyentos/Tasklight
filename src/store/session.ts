import { createStore, type SetStoreFunction } from 'solid-js/store';

export type SessionStatus = 'booting' | 'needs-token' | 'offline-error' | 'ready';
export type SessionNotice = 'invalid-token' | 'network' | 'storage' | null;

export interface SessionUser {
  id: number;
  username: string;
  initials: string;
  color: string;
  profilePicture: string | null;
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
