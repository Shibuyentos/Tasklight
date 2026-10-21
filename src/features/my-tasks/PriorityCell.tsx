import { Flag } from 'lucide-solid';
import { Show } from 'solid-js';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../../domain/priority';
import type { Priority } from '../../domain/task';
import { t } from '../../i18n';
import styles from './my-tasks.module.css';

export function PriorityCell(props: { priority: Priority | null }) {
  return (
    <div class={styles.priorityCell} data-ui="priority-cell">
      <Show
        when={props.priority}
        fallback={
          <span class={styles.emptyIcon} title={t('myTasks.row.noPriority')}>
            <Flag size={16} />
          </span>
        }
      >
        {(priority) => (
          <>
            <Flag size={16} color={PRIORITY_COLOR[priority()]} fill={PRIORITY_COLOR[priority()]} />
            <span class={styles.priorityLabel}>{PRIORITY_LABEL[priority()]}</span>
          </>
        )}
      </Show>
    </div>
  );
}
