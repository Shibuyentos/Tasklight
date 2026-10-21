import { ClipboardList, Diamond, NotebookPen } from 'lucide-solid';
import { createSignal, For, type JSX, Show } from 'solid-js';
import { type StatusMenuKind, statusLabel, statusMenuGroups } from '../../domain/status';
import type { TaskStatus } from '../../domain/task';
import type { TaskTypeChoice } from '../../domain/task-types';
import { type MessageKey, t } from '../../i18n';
import { StatusIcon } from '../../ui/components/StatusIcon';
import { hasTaskTypeIcon, TaskTypeIcon } from '../../ui/components/TaskTypeIcon';
import styles from './editors.module.css';
import { OptionList, type PickerGroup } from './OptionList';
import { PickerPopover } from './PickerPopover';

const GROUP_LABEL: Readonly<Record<StatusMenuKind, MessageKey>> = {
  notStarted: 'editors.status.notStarted',
  active: 'editors.status.active',
  done: 'editors.status.done',
  closed: 'editors.status.closed',
};

export interface TaskTypeTab {
  current: number;
  choices: TaskTypeChoice[];
  onChange: (id: number) => void;
}

export interface StatusPickerProps {
  current: TaskStatus;
  /** Status da lista da tarefa; `null` quando não estão disponíveis (sem acesso ou sem rede). */
  loadStatuses: () => Promise<TaskStatus[] | null>;
  onChange: (status: TaskStatus) => void;
  /** Aba "Tipo de tarefa", como no menu de status do ClickUp. */
  types?: TaskTypeTab | undefined;
  disabled?: boolean | undefined;
  triggerLabel: string;
  triggerClass?: string | undefined;
  triggerTitle?: string | undefined;
  children: JSX.Element;
}

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; statuses: TaskStatus[] }
  | { state: 'failed' };
type Tab = 'status' | 'type';

const SECONDARY = 'var(--text-secondary)';

function TypeIcon(props: { choice: TaskTypeChoice }) {
  switch (props.choice.kind) {
    case 'default':
      return <StatusIcon type="custom" style={{ color: SECONDARY }} />;
    case 'milestone':
      return <Diamond size={14} color={SECONDARY} />;
    case 'meeting_note':
      return <NotebookPen size={14} color={SECONDARY} />;
    case 'form_response':
      return <ClipboardList size={14} color={SECONDARY} />;
    default:
      return hasTaskTypeIcon(props.choice.icon) ? (
        <TaskTypeIcon name={props.choice.icon} color={SECONDARY} />
      ) : (
        <StatusIcon type="custom" appearance="row" style={{ color: SECONDARY }} />
      );
  }
}

/** Menu de status com os status reais da lista da tarefa, agrupados como no ClickUp. */
export function StatusPicker(props: StatusPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [tab, setTab] = createSignal<Tab>('status');
  const [loaded, setLoaded] = createSignal<Loaded>({ state: 'loading' });
  let search: HTMLInputElement | undefined;
  let request = 0;

  function load() {
    const current = ++request;
    setLoaded({ state: 'loading' });
    props
      .loadStatuses()
      .then((statuses) => {
        if (current !== request) return;
        setLoaded(statuses?.length ? { state: 'ready', statuses } : { state: 'failed' });
      })
      .catch(() => {
        if (current === request) setLoaded({ state: 'failed' });
      });
  }

  const statusGroups = (): PickerGroup[] => {
    const value = loaded();
    if (value.state !== 'ready') return [];
    const current = props.current.name.toLowerCase();
    return statusMenuGroups(value.statuses).map((group) => ({
      id: group.kind,
      label: t(GROUP_LABEL[group.kind]),
      options: group.statuses.map((status) => ({
        id: status.name,
        label: statusLabel(status.name),
        searchText: status.name,
        checked: status.name.toLowerCase() === current,
        class: styles.statusOption,
        icon: <StatusIcon type={status.type} style={{ color: status.color }} />,
      })),
    }));
  };

  const typeGroups = (types: TaskTypeTab): PickerGroup[] => [
    {
      id: 'types',
      label: t('editors.type.heading'),
      options: types.choices.map((choice) => ({
        id: String(choice.id),
        label: choice.name,
        checked: choice.id === types.current,
        icon: <TypeIcon choice={choice} />,
        content:
          choice.kind === 'default' ? (
            <>
              {choice.name}
              <span class={styles.optionMuted}>{t('editors.type.default')}</span>
            </>
          ) : undefined,
      })),
    },
  ];

  const message = () => {
    if (tab() === 'type') return null;
    const value = loaded();
    if (value.state === 'loading') return t('editors.status.loading');
    if (value.state === 'failed') return t('editors.status.unavailable');
    return null;
  };

  function select(id: string) {
    setOpen(false);
    const types = props.types;
    if (tab() === 'type' && types) {
      const chosen = Number(id);
      if (chosen !== types.current) types.onChange(chosen);
      return;
    }
    const value = loaded();
    if (value.state !== 'ready') return;
    const chosen = value.statuses.find((status) => status.name === id);
    if (chosen && chosen.name.toLowerCase() !== props.current.name.toLowerCase()) {
      props.onChange(chosen);
    }
  }

  return (
    <PickerPopover
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTab('status');
          load();
        }
      }}
      trigger={{
        label: props.triggerLabel,
        class: props.triggerClass,
        title: props.triggerTitle,
        disabled: props.disabled,
      }}
      triggerContent={props.children}
      contentClass={styles.statusMenu}
      initialFocus={() => search}
    >
      <Show when={props.types}>
        <div class={styles.switcher} role="tablist" aria-label={t('editors.status.title')}>
          <For each={['status', 'type'] as const}>
            {(value) => (
              <button
                type="button"
                role="tab"
                class={styles.switcherTab}
                aria-selected={tab() === value}
                onClick={() => {
                  setTab(value);
                  search?.focus();
                }}
              >
                {t(value === 'status' ? 'editors.status.title' : 'editors.type.title')}
              </button>
            )}
          </For>
        </div>
      </Show>
      <OptionList
        ref={(input) => {
          search = input;
        }}
        label={t(tab() === 'type' ? 'editors.type.title' : 'editors.status.title')}
        groups={tab() === 'type' && props.types ? typeGroups(props.types) : statusGroups()}
        status={message()}
        placeholder={t('editors.search')}
        emptyText={t('editors.noResults')}
        onSelect={(option) => select(option.id)}
      />
    </PickerPopover>
  );
}
