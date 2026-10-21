import { CalendarPlus } from 'lucide-solid';
import { type JSX, Show } from 'solid-js';
import { type DateContext, dueTone, formatDueDate } from '../../domain/dates';
import type { StatusType } from '../../domain/task';
import { t } from '../../i18n';
import { type DatesChange, DatesPicker } from '../task-editors/DatesPicker';
import editorStyles from '../task-editors/editors.module.css';
import styles from './my-tasks.module.css';
import type { CellEditor } from './PriorityCell';

function DueContent(props: {
  dueDate: number | null;
  statusType: StatusType;
  ctx: DateContext;
}): JSX.Element {
  return (
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
  );
}

export function DueDateCell(props: {
  dueDate: number | null;
  startDate?: number | null;
  statusType: StatusType;
  ctx: DateContext;
  editor?: CellEditor<DatesChange>;
}) {
  return (
    <Show
      when={props.editor}
      fallback={
        <div class={styles.dueCell} data-ui="due-cell">
          <DueContent dueDate={props.dueDate} statusType={props.statusType} ctx={props.ctx} />
        </div>
      }
    >
      {(editor) => (
        <DatesPicker
          dueDate={props.dueDate}
          startDate={props.startDate ?? null}
          ctx={props.ctx}
          onChange={editor().onChange}
          disabled={editor().disabled}
          triggerLabel={editor().label}
          triggerTitle={editor().title}
          triggerClass={`${styles.dueCell} ${editorStyles.cellTrigger}`}
        >
          <DueContent dueDate={props.dueDate} statusType={props.statusType} ctx={props.ctx} />
        </DatesPicker>
      )}
    </Show>
  );
}
