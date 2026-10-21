import { ArrowDown } from 'lucide-solid';
import { Show } from 'solid-js';
import { statusLabel } from '../../domain/status';
import { t } from '../../i18n';
import { Caret } from '../../ui/components/Caret';
import { StatusPill } from '../../ui/components/StatusPill';
import { AddColumnIcon } from './icons';
import styles from './my-tasks.module.css';
import type { GroupItem } from './view-model';

export function GroupHeader(props: { item: GroupItem; onToggle: () => void }) {
  const label = () =>
    t(props.item.collapsed ? 'myTasks.group.expand' : 'myTasks.group.collapse', {
      name: statusLabel(props.item.status.name),
    });

  return (
    <div class={styles.groupHeader} data-ui="group-header">
      <div class={styles.groupTitle}>
        <button
          type="button"
          class={styles.groupCaret}
          aria-label={label()}
          aria-expanded={!props.item.collapsed}
          title={label()}
          data-ui="group-caret"
          onClick={() => props.onToggle()}
        >
          <Caret open={!props.item.collapsed} />
        </button>
        <StatusPill status={props.item.status} />
        <span class={styles.groupCount} data-testid="group-count" data-ui="group-count">
          {props.item.count}
        </span>
      </div>
      <Show when={!props.item.collapsed}>
        <div class={styles.columns} data-ui="column-header">
          <span class={styles.columnName}>{t('myTasks.column.name')}</span>
          <span class={styles.columnPriority}>{t('myTasks.column.priority')}</span>
          <span class={styles.columnDue}>
            {t('myTasks.column.dueDate')}
            <span
              class={styles.sortBadge}
              title={t('myTasks.column.sortedDesc')}
              data-ui="sort-badge"
            >
              <ArrowDown size={12} stroke-width={2.5} />
            </span>
          </span>
          <span class={styles.columnTrailing}>
            <span class={styles.addColumn} title={t('myTasks.column.add')} data-ui="add-column">
              <AddColumnIcon />
            </span>
          </span>
        </div>
      </Show>
    </div>
  );
}
