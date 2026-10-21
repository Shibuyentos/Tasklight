import { Flag } from 'lucide-solid';
import { type JSX, Show } from 'solid-js';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../../domain/priority';
import type { Priority } from '../../domain/task';
import { t } from '../../i18n';
import editorStyles from '../task-editors/editors.module.css';
import { PriorityPicker } from '../task-editors/PriorityPicker';
import styles from './my-tasks.module.css';

export interface CellEditor<T> {
  label: string;
  disabled: boolean;
  title?: string;
  onChange: (value: T) => void;
}

function PriorityContent(props: { priority: Priority | null }): JSX.Element {
  return (
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
  );
}

export function PriorityCell(props: {
  priority: Priority | null;
  editor?: CellEditor<Priority | null>;
}) {
  return (
    <Show
      when={props.editor}
      fallback={
        <div class={styles.priorityCell} data-ui="priority-cell">
          <PriorityContent priority={props.priority} />
        </div>
      }
    >
      {(editor) => (
        <PriorityPicker
          value={props.priority}
          onChange={editor().onChange}
          disabled={editor().disabled}
          triggerLabel={editor().label}
          triggerTitle={editor().title}
          triggerClass={`${styles.priorityCell} ${editorStyles.cellTrigger}`}
        >
          <PriorityContent priority={props.priority} />
        </PriorityPicker>
      )}
    </Show>
  );
}
