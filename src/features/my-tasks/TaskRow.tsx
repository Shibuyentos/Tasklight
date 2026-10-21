import { createMemo, type JSX, Show } from 'solid-js';
import type { WorkspaceServices } from '../../app/ServicesContext';
import type { Task } from '../../domain/task';
import type { TaskChanges } from '../../domain/task-detail';
import { taskTypeChoices } from '../../domain/task-types';
import { t } from '../../i18n';
import { openSubtaskCount } from '../../store/tasks';
import { Caret } from '../../ui/components/Caret';
import { StatusIcon } from '../../ui/components/StatusIcon';
import { hasTaskTypeIcon, TaskTypeIcon } from '../../ui/components/TaskTypeIcon';
import type { EditFeedback } from '../task-editors/edit-feedback';
import editorStyles from '../task-editors/editors.module.css';
import { StatusPicker } from '../task-editors/StatusPicker';
import { DueDateCell } from './DueDateCell';
import { AttachmentIcon, DescriptionIcon, SubtasksIcon } from './icons';
import styles from './my-tasks.module.css';
import { PriorityCell } from './PriorityCell';
import type { RowItem } from './view-model';

/** Ícone do tipo da tarefa na cor do status; a "Tarefa" padrão e tipos sem ícone usam o do status. */
function RowTypeIcon(props: { task: Task; workspace: WorkspaceServices }) {
  const icon = () => props.workspace.store.state.taskTypes[props.task.customItemId]?.icon ?? null;

  return (
    <span class={styles.typeBox}>
      <Show
        when={hasTaskTypeIcon(icon()) ? icon() : null}
        fallback={
          <StatusIcon
            type={props.task.status.type}
            appearance="row"
            style={{ color: props.task.status.color }}
            testId="type-icon"
          />
        }
      >
        {(name) => <TaskTypeIcon name={name()} color={props.task.status.color} />}
      </Show>
    </span>
  );
}

/** Edição pela linha, quando o workspace oferece os serviços de detalhe e de ações. */
function rowEditing(workspace: WorkspaceServices, feedback: EditFeedback | undefined) {
  const { actions, details } = workspace;
  if (!actions || !details || !feedback) return null;
  const offline = () => workspace.sync.status() === 'offline';
  return {
    details,
    disabled: (taskId: string, key: string) => offline() || actions.pending(taskId, key),
    title: () => (offline() ? t('editors.offline') : undefined),
    update: (taskId: string, changes: TaskChanges, display?: Partial<Task>) =>
      void feedback.run(() =>
        display ? actions.update(taskId, changes, display) : actions.update(taskId, changes),
      ),
  };
}

export function TaskRow(props: {
  item: RowItem;
  workspace: WorkspaceServices;
  feedback?: EditFeedback;
  onToggle: () => void;
}) {
  const task = () => props.item.task;
  const editing = createMemo(() => rowEditing(props.workspace, props.feedback));
  const subtasks = () =>
    props.item.depth === 0 ? openSubtaskCount(props.workspace.store.state, task().id) : null;
  const attachments = () => props.workspace.store.state.rowDetails[task().id]?.attachments ?? 0;
  const toggleLabel = () =>
    t(props.item.expanded ? 'myTasks.row.hideSubtasks' : 'myTasks.row.showSubtasks', {
      name: task().name,
    });

  const typeIcon = (): JSX.Element => <RowTypeIcon task={task()} workspace={props.workspace} />;

  return (
    <div
      class={props.item.depth === 1 ? `${styles.row} ${styles.subtaskRow}` : styles.row}
      data-ui="task-row"
    >
      <div class={styles.nameCell} data-ui="name-cell">
        <Show when={props.item.expandable}>
          <button
            type="button"
            class={styles.rowCaret}
            aria-label={toggleLabel()}
            aria-expanded={props.item.expanded}
            title={toggleLabel()}
            onClick={() => props.onToggle()}
          >
            <Caret open={props.item.expanded} />
          </button>
        </Show>
        <Show when={editing()} fallback={typeIcon()}>
          {(edit) => (
            <StatusPicker
              current={task().status}
              loadStatuses={async () =>
                (await edit().details.listMetadata(task().listId))?.statuses ?? null
              }
              onChange={(status) => edit().update(task().id, { status: status.name }, { status })}
              types={{
                current: task().customItemId,
                choices: taskTypeChoices(Object.values(props.workspace.store.state.taskTypes)),
                onChange: (customItemId) =>
                  edit().update(task().id, { customItemId }, { customItemId }),
              }}
              disabled={edit().disabled(task().id, 'status')}
              triggerLabel={t('editors.trigger.status', { name: task().name })}
              triggerTitle={edit().title()}
              triggerClass={editorStyles.iconTrigger}
            >
              {typeIcon()}
            </StatusPicker>
          )}
        </Show>
        <a
          class={styles.name}
          href={task().url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="task-name"
          data-ui="task-name"
        >
          {task().name}
        </a>
        <span class={styles.indicators}>
          <Show when={(subtasks() ?? 0) > 0}>
            <button
              type="button"
              class={styles.subtaskButton}
              aria-label={
                subtasks() === 1
                  ? t('myTasks.row.subtasksOne')
                  : t('myTasks.row.subtasksMany', { count: subtasks() ?? 0 })
              }
              onClick={() => props.onToggle()}
            >
              <SubtasksIcon size={14} />
              {subtasks()}
            </button>
          </Show>
          <Show when={task().hasDescription}>
            <span class={styles.indicator} title={t('myTasks.row.description')}>
              <DescriptionIcon size={14} />
            </span>
          </Show>
          <Show when={attachments() > 0}>
            <span class={styles.indicator} title={t('myTasks.row.attachments')}>
              <AttachmentIcon size={14} />
            </span>
          </Show>
        </span>
      </div>
      <PriorityCell
        priority={task().priority}
        editor={
          editing()
            ? {
                label: t('editors.trigger.priority', { name: task().name }),
                disabled: editing()?.disabled(task().id, 'priority') ?? true,
                title: editing()?.title(),
                onChange: (priority) => editing()?.update(task().id, { priority }),
              }
            : undefined
        }
      />
      <DueDateCell
        dueDate={task().dueDate}
        startDate={task().startDate}
        statusType={task().status.type}
        ctx={props.workspace.dateContext()}
        editor={
          editing()
            ? {
                label: t('editors.trigger.dates', { name: task().name }),
                disabled:
                  (editing()?.disabled(task().id, 'dueDate') ||
                    editing()?.disabled(task().id, 'startDate')) ??
                  true,
                title: editing()?.title(),
                onChange: (change) => editing()?.update(task().id, change),
              }
            : undefined
        }
      />
      <div class={styles.trailingCell} />
    </div>
  );
}
