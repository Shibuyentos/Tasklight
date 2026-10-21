import { Ban, Flag } from 'lucide-solid';
import { createSignal, type JSX } from 'solid-js';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '../../domain/priority';
import type { Priority } from '../../domain/task';
import { t } from '../../i18n';
import styles from './editors.module.css';
import { OptionList, type PickerOption } from './OptionList';
import { PickerPopover } from './PickerPopover';

const PRIORITIES: readonly Priority[] = ['urgent', 'high', 'normal', 'low'];
const CLEAR = 'clear';

export interface PriorityPickerProps {
  value: Priority | null;
  onChange: (priority: Priority | null) => void;
  disabled?: boolean;
  triggerLabel: string;
  triggerClass?: string;
  triggerTitle?: string;
  children: JSX.Element;
}

/** Menu de prioridade do ClickUp: quatro níveis, Limpar e os atalhos Ctrl+1…4 e Ctrl+0. */
export function PriorityPicker(props: PriorityPickerProps) {
  const [open, setOpen] = createSignal(false);
  let search: HTMLInputElement | undefined;

  function choose(priority: Priority | null) {
    setOpen(false);
    if (priority !== props.value) props.onChange(priority);
  }

  const options = (): PickerOption[] => [
    ...PRIORITIES.map((priority, index) => ({
      id: priority,
      label: PRIORITY_LABEL[priority],
      hint: `Ctrl ${index + 1}`,
      checked: props.value === priority,
      icon: <Flag size={16} color={PRIORITY_COLOR[priority]} fill={PRIORITY_COLOR[priority]} />,
    })),
    {
      id: CLEAR,
      label: t('editors.priority.clear'),
      hint: 'Ctrl 0',
      icon: <Ban size={16} color="var(--text-secondary)" />,
    },
  ];

  return (
    <PickerPopover
      open={open()}
      onOpenChange={setOpen}
      trigger={{
        label: props.triggerLabel,
        class: props.triggerClass,
        title: props.triggerTitle,
        disabled: props.disabled,
      }}
      triggerContent={props.children}
      contentClass={styles.priorityMenu}
      initialFocus={() => search}
    >
      <OptionList
        ref={(input) => {
          search = input;
        }}
        label={t('editors.priority.title')}
        groups={[{ id: 'priority', label: t('editors.priority.title'), options: options() }]}
        placeholder={t('editors.search')}
        emptyText={t('editors.noResults')}
        onSelect={(option) => choose(option.id === CLEAR ? null : (option.id as Priority))}
        onShortcut={(event) => {
          if (!event.ctrlKey || !/^[0-4]$/.test(event.key)) return false;
          choose(event.key === '0' ? null : (PRIORITIES[Number(event.key) - 1] ?? null));
          return true;
        }}
      />
    </PickerPopover>
  );
}
