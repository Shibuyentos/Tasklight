import { createSignal } from 'solid-js';

export const SIDEBAR_PREF_KEY = 'tasklight.sidebarCollapsed';

type Prefs = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): Prefs | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createSidebarState(storage: Prefs | null | undefined = browserStorage()) {
  function readSaved(): boolean {
    try {
      return storage?.getItem(SIDEBAR_PREF_KEY) === 'true';
    } catch {
      return false;
    }
  }

  const [collapsed, setCollapsedSignal] = createSignal(readSaved());

  function setCollapsed(value: boolean) {
    setCollapsedSignal(value);
    try {
      storage?.setItem(SIDEBAR_PREF_KEY, String(value));
    } catch {
      // Sem armazenamento local, a escolha vale só nesta sessão.
    }
  }

  return {
    collapsed,
    setCollapsed,
    toggle: () => setCollapsed(!collapsed()),
  };
}

/**
 * `Ctrl+\` (ou `Cmd+\` no macOS), como no ClickUp. Compara `key`, não `code`: no teclado ABNT2 a
 * tecla da barra invertida fica em outra posição física (`IntlBackslash`).
 */
export function isSidebarShortcut(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>,
): boolean {
  return (
    event.key === '\\' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing
  );
}
