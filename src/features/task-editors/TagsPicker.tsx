import { createSignal, type JSX } from 'solid-js';
import type { TaskTag } from '../../domain/task-detail';
import { t } from '../../i18n';
import { TagChip } from '../../ui/components/TagChip';
import styles from './editors.module.css';
import { OptionList, type PickerGroup } from './OptionList';
import { PickerPopover } from './PickerPopover';

export interface TagsPickerProps {
  tags: TaskTag[];
  /** Etiquetas do espaço; `null` quando não estão disponíveis. */
  loadTags: () => Promise<TaskTag[] | null>;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  disabled?: boolean;
  triggerLabel: string;
  triggerClass?: string;
  triggerTitle?: string;
  children: JSX.Element;
}

type Catalog = { state: 'loading' } | { state: 'ready'; tags: TaskTag[] } | { state: 'failed' };

/** Etiquetas do espaço: cada clique adiciona ou remove na hora, com o menu aberto. */
export function TagsPicker(props: TagsPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [catalog, setCatalog] = createSignal<Catalog>({ state: 'loading' });
  let search: HTMLInputElement | undefined;
  let request = 0;

  function load() {
    const current = ++request;
    setCatalog({ state: 'loading' });
    props
      .loadTags()
      .then((tags) => {
        if (current === request) setCatalog(tags ? { state: 'ready', tags } : { state: 'failed' });
      })
      .catch(() => {
        if (current === request) setCatalog({ state: 'failed' });
      });
  }

  const groups = (): PickerGroup[] => {
    const value = catalog();
    const byName = new Map(props.tags.map((tag) => [tag.name, tag]));
    if (value.state === 'ready')
      for (const tag of value.tags) if (!byName.has(tag.name)) byName.set(tag.name, tag);
    const assigned = new Set(props.tags.map((tag) => tag.name));
    return [
      {
        id: 'tags',
        label: t('editors.tags.heading'),
        options: [...byName.values()].map((tag) => ({
          id: tag.name,
          label: tag.name,
          content: <TagChip tag={tag} />,
          checked: assigned.has(tag.name),
        })),
      },
    ];
  };

  return (
    <PickerPopover
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
      trigger={{
        label: props.triggerLabel,
        class: props.triggerClass,
        title: props.triggerTitle,
        disabled: props.disabled,
      }}
      triggerContent={props.children}
      contentClass={styles.tagsMenu}
      initialFocus={() => search}
    >
      <OptionList
        ref={(input) => {
          search = input;
        }}
        label={t('editors.tags.title')}
        groups={groups()}
        note={catalog().state === 'failed' ? t('editors.tags.unavailable') : null}
        status={
          catalog().state === 'loading' && props.tags.length === 0
            ? t('editors.tags.loading')
            : null
        }
        placeholder={t('editors.tags.search')}
        emptyText={t('editors.noResults')}
        onSelect={(option) => {
          if (props.tags.some((tag) => tag.name === option.id)) props.onRemove(option.id);
          else props.onAdd(option.id);
        }}
      />
    </PickerPopover>
  );
}
