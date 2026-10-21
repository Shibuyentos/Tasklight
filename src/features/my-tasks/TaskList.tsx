import { createVirtualizer } from '@tanstack/solid-virtual';
import { Plus } from 'lucide-solid';
import { createEffect, For, Match, onCleanup, Show, Switch } from 'solid-js';
import type { WorkspaceServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import { GroupHeader } from './GroupHeader';
import styles from './my-tasks.module.css';
import { TaskRow } from './TaskRow';
import { type GroupItem, itemHeight, itemKey, type ListItem, type RowItem } from './view-model';

/** Espaço entre a barra de ferramentas e o primeiro grupo, como no ClickUp. */
const LIST_PADDING_TOP = 16;
const LIST_PADDING_BOTTOM = 24;
const OVERSCAN = 8;
const DETAILS_THROTTLE_MS = 500;

export interface TaskListProps {
  items: ListItem[];
  workspace: WorkspaceServices;
  onToggleGroup: (key: string) => void;
  onToggleTask: (taskId: string) => void;
}

function asGroup(item: ListItem | undefined): GroupItem | undefined {
  return item?.kind === 'group' ? item : undefined;
}

function asRow(item: ListItem | undefined): RowItem | undefined {
  return item?.kind === 'row' ? item : undefined;
}

/** "+ Adicionar Tarefa" aparece como no ClickUp, mas só passa a criar tarefas no M4. */
function AddTaskRow() {
  return (
    <div class={styles.addRow} data-ui="add-task">
      <span class={styles.addIcon}>
        <Plus size={16} />
      </span>
      <button type="button" class={styles.addButton} aria-disabled="true">
        {t('myTasks.addTask')}
      </button>
    </div>
  );
}

export function TaskList(props: TaskListProps) {
  let scroller: HTMLDivElement | undefined;

  const virtualizer = createVirtualizer({
    get count() {
      return props.items.length;
    },
    getScrollElement: () => scroller ?? null,
    estimateSize: (index) => {
      const item = props.items[index];
      return item ? itemHeight(item) : 0;
    },
    // Uma função nova a cada lista faz o virtualizador recalcular posições e alturas.
    get getItemKey() {
      const items = props.items;
      return (index: number) => {
        const item = items[index];
        return item ? itemKey(item) : index;
      };
    },
    overscan: OVERSCAN,
    paddingStart: LIST_PADDING_TOP,
    paddingEnd: LIST_PADDING_BOTTOM,
  });

  // Indicadores (subtarefas e anexos) só das linhas perto da tela, no máximo a cada 500 ms.
  let throttle: ReturnType<typeof setTimeout> | undefined;
  let pending: string[] | null = null;
  function requestDetails(ids: string[]) {
    if (throttle !== undefined) {
      pending = ids;
      return;
    }
    props.workspace.sync.requestRowDetails(ids);
    throttle = setTimeout(() => {
      throttle = undefined;
      const next = pending;
      pending = null;
      if (next) requestDetails(next);
    }, DETAILS_THROTTLE_MS);
  }
  onCleanup(() => clearTimeout(throttle));

  createEffect(() => {
    const ids: string[] = [];
    for (const virtual of virtualizer.getVirtualItems()) {
      const row = asRow(props.items[virtual.index]);
      if (row && row.depth === 0) ids.push(row.task.id);
    }
    if (ids.length > 0) requestDetails(ids);
  });

  return (
    <div ref={scroller} class={styles.scroller} data-ui="task-list">
      <div class={styles.virtualSpace} style={{ height: `${virtualizer.getTotalSize()}px` }}>
        <For each={virtualizer.getVirtualItems()}>
          {(virtual) => {
            const item = () => props.items[virtual.index];
            const key = () => {
              const current = item();
              return current ? itemKey(current) : undefined;
            };
            return (
              <div
                class={styles.virtualItem}
                style={{ height: `${virtual.size}px`, transform: `translateY(${virtual.start}px)` }}
              >
                {/* Recria o conteúdo só quando o item nesta posição é outro. */}
                <Show when={key()} keyed>
                  <Switch>
                    <Match when={asGroup(item())}>
                      {(group) => (
                        <GroupHeader
                          item={group()}
                          onToggle={() => props.onToggleGroup(group().key)}
                        />
                      )}
                    </Match>
                    <Match when={asRow(item())}>
                      {(row) => (
                        <TaskRow
                          item={row()}
                          workspace={props.workspace}
                          onToggle={() => props.onToggleTask(row().task.id)}
                        />
                      )}
                    </Match>
                    <Match when={item()?.kind === 'add'}>
                      <AddTaskRow />
                    </Match>
                  </Switch>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
