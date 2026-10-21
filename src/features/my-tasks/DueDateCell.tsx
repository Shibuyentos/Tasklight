import { CalendarPlus } from 'lucide-solid';
import { Show } from 'solid-js';
import { type DateContext, dueTone, formatDueDate } from '../../domain/dates';
import type { StatusType } from '../../domain/task';
import { t } from '../../i18n';
import styles from './my-tasks.module.css';

export function DueDateCell(props: {
  dueDate: number | null;
  statusType: StatusType;
  ctx: DateContext;
}) {
  return (
    <div class={styles.dueCell} data-ui="due-cell">
      <Show
        when={props.dueDate !== null}
        fallback={
          <span class={styles.emptyIcon} title={t('myTasks.row.noDueDate')}>
            <CalendarPlus size={16} />
          </span>
        }
      >
        <span
          class={`${styles.dueText} ${styles[dueTone(props.dueDate, props.statusType, props.ctx)]}`}
          data-ui="due-date"
        >
          {formatDueDate(props.dueDate ?? 0, props.ctx)}
        </span>
      </Show>
    </div>
  );
}
