import { A } from '@solidjs/router';
import { ChevronsRight, House } from 'lucide-solid';
import { Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import { IconButton } from '../../ui/components/IconButton';
import styles from './shell.module.css';

export function Rail(props: { sidebarCollapsed: boolean; onExpandSidebar: () => void }) {
  const { session } = useServices();

  return (
    <nav class={styles.rail} data-ui="rail" aria-label={t('shell.mainNav')}>
      <Show when={props.sidebarCollapsed}>
        <IconButton
          class={styles.railExpand}
          label={t('shell.expandSidebar')}
          onClick={props.onExpandSidebar}
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </IconButton>
        <span class={styles.railSeparator} />
      </Show>
      {/* No M1 todas as telas pertencem ao Início, então ele está sempre ativo. */}
      <A
        href={`/${session.state.workspaceId}/my-work/tasks`}
        class={`${styles.railItem} ${styles.railItemActive}`}
        data-ui="rail-item"
      >
        <span class={styles.railIcon}>
          <span class={styles.homeIcon}>
            <House size={18} aria-hidden="true" />
          </span>
        </span>
        <span class={styles.railLabel}>{t('shell.home')}</span>
      </A>
    </nav>
  );
}
