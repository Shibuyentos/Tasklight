import type { RouteSectionProps } from '@solidjs/router';
import { onCleanup, Show } from 'solid-js';
import { StorageNotice } from '../onboarding/StorageNotice';
import { MainHeader } from './MainHeader';
import { OfflineNotice } from './OfflineNotice';
import { Rail } from './Rail';
import { Sidebar } from './Sidebar';
import styles from './shell.module.css';
import { createSidebarState, isSidebarShortcut } from './sidebar-state';
import { TopBar } from './TopBar';

export function AppShell(props: RouteSectionProps) {
  const sidebar = createSidebarState();

  const onKeyDown = (event: KeyboardEvent) => {
    if (!isSidebarShortcut(event)) return;
    event.preventDefault();
    sidebar.toggle();
  };
  window.addEventListener('keydown', onKeyDown);
  onCleanup(() => window.removeEventListener('keydown', onKeyDown));

  return (
    <div class={styles.shell}>
      <TopBar />
      <div class={styles.body}>
        <Rail
          sidebarCollapsed={sidebar.collapsed()}
          onExpandSidebar={() => sidebar.setCollapsed(false)}
        />
        <div class={styles.card} data-ui="card">
          <Show when={!sidebar.collapsed()}>
            <Sidebar onCollapse={() => sidebar.setCollapsed(true)} />
          </Show>
          <main class={styles.main}>
            <StorageNotice />
            <OfflineNotice />
            <MainHeader />
            <div class={styles.content}>{props.children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
