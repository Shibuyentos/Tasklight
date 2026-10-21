import { createSignal, type JSX } from 'solid-js';
import type { TaskUser } from '../../domain/task-detail';
import { t } from '../../i18n';
import { Avatar } from '../../ui/components/Avatar';
import styles from './editors.module.css';
import { OptionList, type PickerGroup } from './OptionList';
import { PickerPopover } from './PickerPopover';

export interface AssigneesPickerProps {
  /** Responsáveis atuais, com nome e foto (do detalhe da tarefa). */
  assigned: TaskUser[];
  currentUserId: number;
  /** Membros da lista; `null` quando não estão disponíveis. */
  loadMembers: () => Promise<TaskUser[] | null>;
  /** Conjunto final de responsáveis, gravado uma vez ao fechar o menu. */
  onChange: (ids: number[]) => void;
  disabled?: boolean;
  triggerLabel: string;
  triggerClass?: string;
  triggerTitle?: string;
  children: JSX.Element;
}

type Members = { state: 'loading' } | { state: 'ready'; members: TaskUser[] } | { state: 'failed' };

/** Responsáveis como no ClickUp: atribuídos em cima, demais pessoas da lista embaixo. */
export function AssigneesPicker(props: AssigneesPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [members, setMembers] = createSignal<Members>({ state: 'loading' });
  const [selected, setSelected] = createSignal<number[]>([]);
  let search: HTMLInputElement | undefined;
  let request = 0;

  const initial = () => props.assigned.map((user) => user.id);

  function begin() {
    setSelected(initial());
    const current = ++request;
    setMembers({ state: 'loading' });
    props
      .loadMembers()
      .then((list) => {
        if (current === request)
          setMembers(list ? { state: 'ready', members: list } : { state: 'failed' });
      })
      .catch(() => {
        if (current === request) setMembers({ state: 'failed' });
      });
  }

  function finish() {
    const before = initial();
    const after = selected();
    const changed = before.length !== after.length || after.some((id) => !before.includes(id));
    if (changed) props.onChange(after);
  }

  function toggle(id: number) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  }

  /** Atribuídos e membros, sem repetir quem aparece nas duas fontes. */
  const people = () => {
    const value = members();
    const known = new Map(props.assigned.map((user) => [user.id, user]));
    if (value.state === 'ready')
      for (const user of value.members) if (!known.has(user.id)) known.set(user.id, user);
    return [...known.values()];
  };

  const groups = (): PickerGroup[] => {
    const chosen = selected();
    const option = (user: TaskUser) => ({
      id: String(user.id),
      label: user.id === props.currentUserId ? t('editors.assignees.me') : user.name,
      searchText: `${user.name} ${user.email ?? ''}`,
      checked: chosen.includes(user.id),
      icon: (
        <Avatar
          initials={user.initials}
          color={user.color ?? 'var(--accent)'}
          src={user.avatarUrl}
          size={24}
          title={user.name}
        />
      ),
      class: styles.personOption,
    });
    const everyone = people();
    const assigned = chosen
      .map((id) => everyone.find((user) => user.id === id))
      .filter((user): user is TaskUser => user !== undefined);
    const others = everyone
      .filter((user) => !chosen.includes(user.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return [
      { id: 'assigned', label: t('editors.assignees.assigned'), options: assigned.map(option) },
      { id: 'people', label: t('editors.assignees.people'), options: others.map(option) },
    ];
  };

  return (
    <PickerPopover
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) begin();
        else finish();
      }}
      trigger={{
        label: props.triggerLabel,
        class: props.triggerClass,
        title: props.triggerTitle,
        disabled: props.disabled,
      }}
      triggerContent={props.children}
      contentClass={styles.peopleMenu}
      initialFocus={() => search}
    >
      <OptionList
        ref={(input) => {
          search = input;
        }}
        label={t('editors.assignees.title')}
        groups={groups()}
        note={members().state === 'failed' ? t('editors.assignees.unavailable') : null}
        status={
          members().state === 'loading' && props.assigned.length === 0
            ? t('editors.assignees.loading')
            : null
        }
        placeholder={t('editors.assignees.search')}
        emptyText={t('editors.noResults')}
        onSelect={(option) => toggle(Number(option.id))}
      />
    </PickerPopover>
  );
}
