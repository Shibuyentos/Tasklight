import {
  ArrowRight,
  Calendar,
  CircleDot,
  Flag,
  Hourglass,
  Tag,
  Timer,
  UserRound,
} from 'lucide-solid';
import { createSignal, For, type JSX, Show } from 'solid-js';
import type { WorkspaceServices } from '../../app/ServicesContext';
import { formatShortNumericDate } from '../../domain/dates';
import { formatDuration, parseDuration } from '../../domain/duration';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../../domain/priority';
import { statusLabel } from '../../domain/status';
import type { Task, TaskStatus } from '../../domain/task';
import type { TaskChanges, TaskDetail } from '../../domain/task-detail';
import { taskTypeChoices } from '../../domain/task-types';
import { t } from '../../i18n';
import { Avatar } from '../../ui/components/Avatar';
import { StatusIcon } from '../../ui/components/StatusIcon';
import { TagChip } from '../../ui/components/TagChip';
import { AssigneesPicker } from '../task-editors/AssigneesPicker';
import { DatesPicker } from '../task-editors/DatesPicker';
import type { EditFeedback } from '../task-editors/edit-feedback';
import { PriorityPicker } from '../task-editors/PriorityPicker';
import { StatusPicker } from '../task-editors/StatusPicker';
import { TagsPicker } from '../task-editors/TagsPicker';
import styles from './task-detail.module.css';

export interface TaskPropertiesProps {
  workspace: WorkspaceServices;
  detail: TaskDetail;
  feedback: EditFeedback;
}

function Property(props: { icon: JSX.Element; label: string; children: JSX.Element }) {
  return (
    <div class={styles.property} data-ui="property">
      <div class={styles.propertyLabel} data-ui="property-label">
        <span class={styles.propertyIcon} aria-hidden="true">
          {props.icon}
        </span>
        <span>{props.label}</span>
      </div>
      <div class={styles.propertyValue}>{props.children}</div>
    </div>
  );
}

const Empty = () => <span class={styles.empty}>{t('detail.empty')}</span>;

/** Propriedades em duas colunas, como no ClickUp, com os mesmos editores da lista. */
export function TaskProperties(props: TaskPropertiesProps) {
  const task = (): Task => props.detail.task;
  const actions = () => props.workspace.actions;
  const details = () => props.workspace.details;
  const offline = () => props.workspace.sync.status() === 'offline';
  const locked = (key: string) =>
    !actions() || offline() || (actions()?.pending(task().id, key) ?? false);
  const title = () => (offline() ? t('editors.offline') : undefined);

  function update(changes: TaskChanges, display?: Partial<Task>) {
    const service = actions();
    if (!service) return;
    void props.feedback.run(() =>
      display ? service.update(task().id, changes, display) : service.update(task().id, changes),
    );
  }

  async function statuses(): Promise<TaskStatus[] | null> {
    return (await details()?.listMetadata(task().listId))?.statuses ?? null;
  }

  /** Próximo status na ordem da lista (botão ▸ do ClickUp). */
  async function advance() {
    const list = (await statuses())?.slice().sort((a, b) => a.orderindex - b.orderindex) ?? [];
    const index = list.findIndex(
      (status) => status.name.toLowerCase() === task().status.name.toLowerCase(),
    );
    const next = list[index + 1];
    if (next) update({ status: next.name }, { status: next });
  }

  /** Primeiro status fechado da lista (botão ✓ do ClickUp). */
  async function closeTask() {
    const list = (await statuses())?.slice().sort((a, b) => a.orderindex - b.orderindex) ?? [];
    const closed = list.find((status) => status.type === 'closed') ?? list.at(-1);
    if (closed && closed.name.toLowerCase() !== task().status.name.toLowerCase())
      update({ status: closed.name }, { status: closed });
  }

  return (
    <div class={styles.properties}>
      <div class={styles.propertyColumn}>
        <Property icon={<CircleDot size={16} />} label={t('detail.status')}>
          <div class={styles.statusControl}>
            <StatusPicker
              current={task().status}
              loadStatuses={statuses}
              onChange={(status) => update({ status: status.name }, { status })}
              types={{
                current: task().customItemId,
                choices: taskTypeChoices(Object.values(props.workspace.store.state.taskTypes)),
                onChange: (customItemId) => update({ customItemId }, { customItemId }),
              }}
              disabled={locked('status')}
              triggerLabel={t('editors.trigger.status', { name: task().name })}
              triggerTitle={title()}
              triggerClass={styles.statusPill}
            >
              <span
                class={styles.statusPillInner}
                style={{ 'background-color': task().status.color }}
              >
                {statusLabel(task().status.name)}
              </span>
            </StatusPicker>
            <button
              type="button"
              class={styles.statusStep}
              aria-label={t('detail.nextStatus')}
              title={t('detail.nextStatus')}
              disabled={locked('status')}
              onClick={() => void advance()}
            >
              <ArrowRight size={12} />
            </button>
            <button
              type="button"
              class={styles.statusDone}
              aria-label={t('detail.closeTask')}
              title={t('detail.closeTask')}
              disabled={locked('status')}
              onClick={() => void closeTask()}
            >
              <StatusIcon type="closed" size={14} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </Property>
        <Property icon={<Calendar size={16} />} label={t('detail.dates')}>
          <DatesPicker
            dueDate={task().dueDate}
            startDate={task().startDate}
            ctx={props.workspace.dateContext()}
            onChange={(change) => update(change)}
            disabled={locked('dueDate') || locked('startDate')}
            triggerLabel={t('editors.trigger.dates', { name: task().name })}
            triggerTitle={title()}
            triggerClass={styles.valueButton}
          >
            <span class={styles.dates}>
              <Calendar size={14} />
              <span classList={{ [styles.placeholder ?? '']: task().startDate === null }}>
                {task().startDate === null
                  ? t('editors.dates.startShort')
                  : formatShortNumericDate(task().startDate ?? 0, props.workspace.dateContext())}
              </span>
              <ArrowRight size={12} class={styles.datesArrow} />
              <Calendar size={14} />
              <span classList={{ [styles.placeholder ?? '']: task().dueDate === null }}>
                {task().dueDate === null
                  ? t('editors.dates.dueShort')
                  : formatShortNumericDate(task().dueDate ?? 0, props.workspace.dateContext())}
              </span>
            </span>
          </DatesPicker>
        </Property>
        <Property icon={<Hourglass size={16} />} label={t('detail.estimate')}>
          <EstimateField
            value={props.detail.timeEstimate}
            disabled={locked('timeEstimate')}
            onChange={(timeEstimate) => update({ timeEstimate })}
          />
        </Property>
        <Property icon={<Tag size={16} />} label={t('detail.tags')}>
          <TagsPicker
            tags={props.detail.tags}
            loadTags={async () => (await details()?.getSpaceTags(task().spaceId)) ?? null}
            onAdd={(name) => {
              const service = actions();
              if (service) void props.feedback.run(() => service.addTag(task().id, name));
            }}
            onRemove={(name) => {
              const service = actions();
              if (service) void props.feedback.run(() => service.removeTag(task().id, name));
            }}
            disabled={!actions() || offline()}
            triggerLabel={t('detail.editTags')}
            triggerTitle={title()}
            triggerClass={styles.valueButton}
          >
            <Show when={props.detail.tags.length > 0} fallback={<Empty />}>
              <span class={styles.tags}>
                <For each={props.detail.tags}>{(tag) => <TagChip tag={tag} />}</For>
              </span>
            </Show>
          </TagsPicker>
        </Property>
      </div>
      <div class={styles.propertyColumn}>
        <Property icon={<UserRound size={16} />} label={t('detail.assignees')}>
          <AssigneesPicker
            assigned={props.detail.assignees}
            currentUserId={props.workspace.userId}
            loadMembers={async () => {
              const metadata = await details()?.listMetadata(task().listId);
              if (!metadata || metadata.unavailable?.includes('members')) return null;
              return metadata.members;
            }}
            onChange={(assigneeIds) => update({ assigneeIds })}
            disabled={locked('assigneeIds')}
            triggerLabel={t('detail.editAssignees')}
            triggerTitle={title()}
            triggerClass={styles.valueButton}
          >
            <Show when={props.detail.assignees.length > 0} fallback={<Empty />}>
              <span class={styles.people}>
                <For each={props.detail.assignees}>
                  {(person) => (
                    <span class={styles.person}>
                      <Avatar
                        initials={person.initials}
                        color={person.color ?? 'var(--accent)'}
                        src={person.avatarUrl}
                        size={20}
                        title={person.name}
                      />
                      <Show when={props.detail.assignees.length === 1}>
                        <span>{person.name}</span>
                      </Show>
                    </span>
                  )}
                </For>
              </span>
            </Show>
          </AssigneesPicker>
        </Property>
        <Property icon={<Flag size={16} />} label={t('detail.priority')}>
          <PriorityPicker
            value={task().priority}
            onChange={(priority) => update({ priority })}
            disabled={locked('priority')}
            triggerLabel={t('editors.trigger.priority', { name: task().name })}
            triggerTitle={title()}
            triggerClass={styles.valueButton}
          >
            <Show when={task().priority} fallback={<Empty />}>
              {(priority) => (
                <span class={styles.priority}>
                  <Flag
                    size={16}
                    color={PRIORITY_COLOR[priority()]}
                    fill={PRIORITY_COLOR[priority()]}
                  />
                  {PRIORITY_LABEL[priority()]}
                </span>
              )}
            </Show>
          </PriorityPicker>
        </Property>
        <Property icon={<Timer size={16} />} label={t('detail.tracked')}>
          <span class={styles.readOnlyValue} title={t('detail.readOnly')}>
            <Show when={props.detail.timeSpent} fallback={<Empty />}>
              {(spent) => formatDuration(spent())}
            </Show>
          </span>
        </Property>
      </div>
    </div>
  );
}

/** Estimativa: mostra "11h"; clique abre um campo que aceita "1h 30m"; vazio limpa. */
function EstimateField(props: {
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [invalid, setInvalid] = createSignal(false);

  function commit(text: string) {
    if (!text.trim()) {
      setEditing(false);
      if (props.value !== null) props.onChange(null);
      return;
    }
    const value = parseDuration(text);
    if (value === null) {
      setInvalid(true);
      return;
    }
    setEditing(false);
    if (value !== props.value) props.onChange(value);
  }

  return (
    <Show
      when={editing()}
      fallback={
        <button
          type="button"
          class={styles.valueButton}
          aria-label={t('detail.editEstimate')}
          disabled={props.disabled}
          onClick={() => {
            setInvalid(false);
            setEditing(true);
          }}
        >
          <Show when={props.value !== null} fallback={<Empty />}>
            {formatDuration(props.value ?? 0)}
          </Show>
        </button>
      }
    >
      <input
        ref={(element) => queueMicrotask(() => element.focus())}
        class={styles.estimateInput}
        classList={{ [styles.estimateInvalid ?? '']: invalid() }}
        type="text"
        aria-label={t('detail.estimate')}
        aria-invalid={invalid()}
        placeholder={t('detail.estimatePlaceholder')}
        value={props.value === null ? '' : formatDuration(props.value)}
        on:keydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(event.currentTarget.value);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setEditing(false);
          }
        }}
        onBlur={(event) => editing() && commit(event.currentTarget.value)}
      />
    </Show>
  );
}
