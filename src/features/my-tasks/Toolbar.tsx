import { CircleCheck, Layers, ListFilter, Search, Settings, X } from 'lucide-solid';
import { Show } from 'solid-js';
import { t } from '../../i18n';
import { SubtasksIcon } from './icons';
import styles from './my-tasks.module.css';

/** Barra da visualização. No M2 só o chip de fechadas funciona; o resto é a mesma moldura do ClickUp. */
export function Toolbar(props: {
  showClosed: boolean;
  onToggleClosed: () => void;
  /** Reconciliação em andamento com a lista já na tela (spec 6.1). */
  syncing?: boolean;
}) {
  return (
    <div class={styles.toolbar} data-ui="toolbar">
      <div class={styles.toolbarGroup}>
        <span class={styles.chip} data-ui="toolbar-status" title={t('myTasks.toolbar.groupedBy')}>
          <Layers size={16} />
          {t('myTasks.toolbar.status')}
        </span>
        <span class={styles.toolbarIcon} title={t('myTasks.toolbar.subtasks')}>
          <SubtasksIcon size={16} />
        </span>
        <Show when={props.syncing}>
          <span class={styles.syncing} role="status">
            {t('myTasks.syncing')}
          </span>
        </Show>
      </div>
      <div class={styles.toolbarGroup}>
        <span class={styles.toolbarIcon} title={t('myTasks.toolbar.filter')}>
          <ListFilter size={16} />
        </span>
        <button
          type="button"
          class={props.showClosed ? `${styles.chip} ${styles.closedChip}` : styles.toolbarIcon}
          aria-label={t('myTasks.toolbar.closed')}
          aria-pressed={props.showClosed}
          title={t('myTasks.toolbar.closed')}
          data-ui="toolbar-closed"
          onClick={() => props.onToggleClosed()}
        >
          <CircleCheck size={16} />
          <Show when={props.showClosed}>
            <span class={styles.clearMark}>
              <X size={16} />
            </span>
          </Show>
        </button>
        <span class={styles.squareButton} title={t('myTasks.toolbar.search')}>
          <Search size={16} />
        </span>
        <span class={styles.toolbarDivider} />
        <span
          class={`${styles.squareButton} ${styles.settingsButton}`}
          title={t('myTasks.toolbar.customize')}
        >
          <Settings size={16} />
        </span>
      </div>
    </div>
  );
}
