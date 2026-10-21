import { useNavigate } from '@solidjs/router';
import { Check, ChevronDown, Search } from 'lucide-solid';
import { For, Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import type { Workspace } from '../../store/session';
import { Avatar } from '../../ui/components/Avatar';
import { Menu } from '../../ui/components/Menu';
import styles from './shell.module.css';

function WorkspaceAvatar(props: { workspace: Workspace }) {
  return (
    <span class={styles.decoration} aria-hidden="true">
      <Avatar
        initials={props.workspace.name.charAt(0).toUpperCase()}
        color={props.workspace.color}
        src={props.workspace.avatar}
        size={18}
      />
    </span>
  );
}

export function TopBar() {
  const { session } = useServices();
  const navigate = useNavigate();
  const current = () =>
    session.state.workspaces.find((workspace) => workspace.id === session.state.workspaceId);

  function chooseWorkspace(id: string) {
    session.selectWorkspace(id);
    navigate(`/${id}/my-work/tasks`);
  }

  return (
    <header class={styles.topbar} data-ui="topbar">
      <Menu.Root>
        <Menu.Trigger class={styles.workspaceSwitcher} data-ui="workspace-switcher">
          <Show when={current()}>
            {(workspace) => (
              <>
                <WorkspaceAvatar workspace={workspace()} />
                <span>{workspace().name}</span>
              </>
            )}
          </Show>
          <ChevronDown size={14} class={styles.chevron} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Content aria-label={t('shell.workspaces')}>
          <For each={session.state.workspaces}>
            {(workspace) => (
              <Menu.Item onSelect={() => chooseWorkspace(workspace.id)}>
                <WorkspaceAvatar workspace={workspace} />
                <span class={styles.menuLabel}>{workspace.name}</span>
                <Show when={workspace.id === session.state.workspaceId}>
                  <Check size={14} aria-hidden="true" />
                </Show>
              </Menu.Item>
            )}
          </For>
        </Menu.Content>
      </Menu.Root>

      {/* A busca chega no M4; até lá a caixa aparece, mas não age. */}
      <button
        type="button"
        class={styles.search}
        data-ui="search"
        aria-disabled="true"
        tabIndex={-1}
      >
        <Search size={16} aria-hidden="true" />
        <span>{t('shell.search')}</span>
        <span class={styles.searchShortcut}>{t('shell.searchShortcut')}</span>
      </button>

      <Menu.Root>
        <Menu.Trigger class={styles.userMenu} data-ui="user-menu">
          <Show when={session.state.user}>
            {(user) => (
              <Avatar
                initials={user().initials}
                color={user().color}
                src={user().profilePicture}
                title={user().username}
              />
            )}
          </Show>
          <ChevronDown size={12} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Content>
          <Menu.Item onSelect={() => void session.signOut()}>{t('shell.switchToken')}</Menu.Item>
        </Menu.Content>
      </Menu.Root>
    </header>
  );
}
