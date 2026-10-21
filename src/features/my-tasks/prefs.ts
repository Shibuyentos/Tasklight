import { createSignal } from 'solid-js';

export const SHOW_CLOSED_KEY = 'tasklight.myTasks.showClosed';
export const COLLAPSED_GROUPS_KEY = 'tasklight.myTasks.collapsedGroups';

type Prefs = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): Prefs | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Escolhas da tela que sobrevivem entre aberturas: fechadas visíveis e grupos recolhidos. */
export function createMyTasksPrefs(storage: Prefs | null = browserStorage()) {
  function read(key: string): string | null {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function write(key: string, value: string) {
    try {
      storage?.setItem(key, value);
    } catch {
      // Sem armazenamento local, a escolha vale só nesta sessão.
    }
  }

  function readCollapsed(): ReadonlySet<string> {
    try {
      const saved: unknown = JSON.parse(read(COLLAPSED_GROUPS_KEY) ?? '[]');
      return new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []);
    } catch {
      return new Set();
    }
  }

  // Como no ClickUp, as tarefas fechadas aparecem até o usuário escondê-las.
  const [showClosed, setShowClosed] = createSignal(read(SHOW_CLOSED_KEY) !== 'false');
  const [collapsedGroups, setCollapsedGroups] = createSignal(readCollapsed());

  return {
    showClosed,
    toggleClosed() {
      const next = !showClosed();
      setShowClosed(next);
      write(SHOW_CLOSED_KEY, String(next));
    },
    collapsedGroups,
    toggleGroup(key: string) {
      const next = new Set(collapsedGroups());
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setCollapsedGroups(next);
      write(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
    },
  };
}

export type MyTasksPrefs = ReturnType<typeof createMyTasksPrefs>;
