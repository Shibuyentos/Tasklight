import { A } from '@solidjs/router';
import { CalendarDays, ChevronsLeft, UserRoundCheck } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import { Avatar } from '../../ui/components/Avatar';
import { IconButton } from '../../ui/components/IconButton';
import styles from './shell.module.css';

export function Sidebar(props: { onCollapse: () => void }) {
  const { session } = useServices();
  const [myTasksExpanded, setMyTasksExpanded] = createSignal(true);
  const myWork = () => `/${session.state.workspaceId}/my-work`;
  const childRow = `${styles.row} ${styles.childRow}`;

  return (
    <aside class={styles.sidebar} data-ui="sidebar">
      <div class={styles.sidebarHeader} data-ui="sidebar-header">
        <h2 class={styles.sidebarTitle}>{t('shell.home')}</h2>
        <IconButton
          class={styles.headerButton}
          label={t('shell.collapseSidebar')}
          onClick={props.onCollapse}
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </IconButton>
      </div>

      <nav class={styles.tree} aria-label={t('shell.home')}>
        <button
          type="button"
          class={styles.row}
          data-ui="sidebar-row"
          aria-expanded={myTasksExpanded()}
          onClick={() => setMyTasksExpanded(!myTasksExpanded())}
        >
          <UserRoundCheck size={16} class={styles.rowIcon} aria-hidden="true" />
          <span>{t('shell.myTasks')}</span>
        </button>

        <Show when={myTasksExpanded()}>
          <A href={`${myWork()}/tasks`} end class={childRow} activeClass={styles.rowActive}>
            <span class={styles.childIcon} aria-hidden="true">
              <Show when={session.state.user}>
                {(user) => (
                  <Avatar
                    initials={user().initials}
                    color={user().color}
                    src={user().profilePicture}
                    size={18}
                  />
                )}
              </Show>
            </span>
            <span>{t('shell.assignedToMe')}</span>
          </A>
          <A href={`${myWork()}/today`} end class={childRow} activeClass={styles.rowActive}>
            <span class={styles.childIcon} aria-hidden="true">
              <CalendarDays size={16} />
            </span>
            <span>{t('shell.todayOverdue')}</span>
          </A>
        </Show>
      </nav>
    </aside>
  );
}
