import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { useServices, type WorkspaceServices } from '../../app/ServicesContext';
import { isDueByToday } from '../../domain/dates';
import { groupByStatus } from '../../domain/grouping';
import { t } from '../../i18n';
import { assignedRoots, openSubtaskCount, openSubtasks } from '../../store/tasks';
import { EditToast } from '../task-editors/EditToast';
import { createEditFeedback } from '../task-editors/edit-feedback';
import styles from './my-tasks.module.css';
import { createMyTasksPrefs, type MyTasksPrefs } from './prefs';
import { TaskList } from './TaskList';
import { Toolbar } from './Toolbar';
import { buildListItems } from './view-model';

/** `today` é a visão "Hoje e atrasadas": o mesmo layout com um filtro local. */
export type MyTasksFilter = 'all' | 'today';

const SKELETON_ROWS = Array.from({ length: 8 }, (_, index) => index);

function SkeletonRows() {
  return (
    <div class={styles.skeleton} role="status" aria-label={t('myTasks.loading')}>
      <For each={SKELETON_ROWS}>
        {() => (
          <div class={styles.skeletonRow} data-testid="skeleton-row">
            <span class={styles.skeletonIcon} />
            <span class={styles.skeletonBar} />
          </div>
        )}
      </For>
    </div>
  );
}

function MyTasksContent(props: {
  workspace: WorkspaceServices;
  filter: MyTasksFilter;
  prefs: MyTasksPrefs;
}) {
  const { store, sync, userId } = props.workspace;
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set());
  const feedback = createEditFeedback();

  const roots = createMemo(() => {
    const tasks = assignedRoots(store.state, userId);
    if (props.filter !== 'today') return tasks;
    const ctx = props.workspace.dateContext();
    return tasks.filter((task) => isDueByToday(task.dueDate, task.status.type, ctx));
  });
  const groups = createMemo(() => groupByStatus(roots(), { showClosed: props.prefs.showClosed() }));
  const items = createMemo(() =>
    buildListItems({
      groups: groups(),
      collapsedGroups: props.prefs.collapsedGroups(),
      expandedTasks: expanded(),
      subtasksOf: (taskId) => openSubtasks(store.state, taskId),
      subtaskCount: (taskId) => openSubtaskCount(store.state, taskId),
    }),
  );

  function toggleTask(taskId: string) {
    const next = new Set(expanded());
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    setExpanded(next);
  }

  return (
    <>
      <Switch
        fallback={
          <TaskList
            items={items()}
            workspace={props.workspace}
            feedback={feedback}
            onToggleGroup={(key) => props.prefs.toggleGroup(key)}
            onToggleTask={toggleTask}
          />
        }
      >
        <Match when={groups().length === 0 && sync.status() === 'loading'}>
          <SkeletonRows />
        </Match>
        <Match when={groups().length === 0}>
          <p class={styles.empty}>
            {props.filter === 'today' ? t('myTasks.emptyToday') : t('myTasks.empty')}
          </p>
        </Match>
      </Switch>
      <EditToast feedback={feedback} />
    </>
  );
}

export function MyTasksPage(props: { filter?: MyTasksFilter }) {
  const services = useServices();
  const prefs = createMyTasksPrefs();
  const workspace = () => services.workspace?.() ?? null;

  return (
    <div class={styles.page} data-ui="my-tasks">
      <Toolbar
        showClosed={prefs.showClosed()}
        onToggleClosed={() => prefs.toggleClosed()}
        syncing={workspace()?.sync.status() === 'syncing'}
      />
      <Show when={workspace()} keyed fallback={<SkeletonRows />}>
        {(current) => (
          <MyTasksContent workspace={current} filter={props.filter ?? 'all'} prefs={prefs} />
        )}
      </Show>
    </div>
  );
}
