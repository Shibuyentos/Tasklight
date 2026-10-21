import { describe, expect, it } from 'vitest';
import { createSidebarState, isSidebarShortcut, SIDEBAR_PREF_KEY } from './sidebar-state';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function key(init: Partial<KeyboardEventInit> & { key: string }) {
  return new KeyboardEvent('keydown', init);
}

describe('isSidebarShortcut', () => {
  it('Ctrl+\\ alterna a barra lateral', () => {
    expect(isSidebarShortcut(key({ key: '\\', ctrlKey: true }))).toBe(true);
  });

  it('funciona no teclado ABNT2, em que a tecla \\ tem code IntlBackslash', () => {
    expect(isSidebarShortcut(key({ key: '\\', code: 'IntlBackslash', ctrlKey: true }))).toBe(true);
  });

  it('aceita Cmd+\\ no macOS', () => {
    expect(isSidebarShortcut(key({ key: '\\', metaKey: true }))).toBe(true);
  });

  it.each([
    ['sem Ctrl', { key: '\\' }],
    ['com Alt', { key: '\\', ctrlKey: true, altKey: true }],
    ['outra tecla', { key: '/', ctrlKey: true }],
  ])('ignora %s', (_label, init) => {
    expect(isSidebarShortcut(key(init))).toBe(false);
  });

  it('ignora durante composição de texto (IME)', () => {
    const composing = {
      key: '\\',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      isComposing: true,
    };
    expect(isSidebarShortcut(composing)).toBe(false);
  });
});

describe('createSidebarState', () => {
  it('começa expandida e lembra quando é recolhida', () => {
    const storage = memoryStorage();
    const state = createSidebarState(storage);

    expect(state.collapsed()).toBe(false);
    state.toggle();

    expect(state.collapsed()).toBe(true);
    expect(storage.getItem(SIDEBAR_PREF_KEY)).toBe('true');
    state.toggle();
    expect(storage.getItem(SIDEBAR_PREF_KEY)).toBe('false');
  });

  it('restaura o estado salvo', () => {
    const state = createSidebarState(memoryStorage({ [SIDEBAR_PREF_KEY]: 'true' }));

    expect(state.collapsed()).toBe(true);
  });

  it('armazenamento inacessível não quebra e mantém a barra expandida', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const state = createSidebarState(broken);

    expect(state.collapsed()).toBe(false);
    state.setCollapsed(true);
    expect(state.collapsed()).toBe(true);
  });
});
