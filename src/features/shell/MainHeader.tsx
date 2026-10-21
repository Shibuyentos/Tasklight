import { Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import { Avatar } from '../../ui/components/Avatar';
import styles from './shell.module.css';

export function MainHeader() {
  const { session } = useServices();

  return (
    <div data-ui="main-header">
      <div class={styles.mainHeader}>
        <Show when={session.state.user}>
          {(user) => (
            <>
              <span class={styles.decoration} aria-hidden="true">
                <Avatar
                  initials={user().initials}
                  color={user().color}
                  src={user().profilePicture}
                  size={20}
                />
              </span>
              <h1 class={styles.mainTitle}>{user().username}</h1>
            </>
          )}
        </Show>
      </div>
      <nav class={styles.tabs} aria-label={t('shell.views')}>
        <span class={`${styles.tab} ${styles.tabActive}`} aria-current="page">
          {t('shell.tasksTab')}
        </span>
      </nav>
    </div>
  );
}
