import { Dialog } from '@kobalte/core/dialog';
import { Copy } from 'lucide-solid';
import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import type { WorkspaceServices } from '../../app/ServicesContext';
import { formatMonthDay } from '../../domain/dates';
import type { BreadcrumbPart, ListMetadata, TaskBreadcrumb } from '../../domain/task-detail';
import { taskTypeChoices } from '../../domain/task-types';
import { t } from '../../i18n';
import { StatusIcon } from '../../ui/components/StatusIcon';
import { EditToast } from '../task-editors/EditToast';
import { createEditFeedback } from '../task-editors/edit-feedback';
import { DetailHeader } from './DetailHeader';
import { TaskProperties } from './TaskProperties';
import { TaskTitle } from './TaskTitle';
import styles from './task-detail.module.css';

export interface TaskDetailModalProps {
  workspace: WorkspaceServices;
  taskId: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}

/** Detalhe da tarefa por cima da lista, no tamanho e nas duas colunas do modal do ClickUp. */
export default function TaskDetailModal(props: TaskDetailModalProps) {
  const feedback = createEditFeedback();
  const details = () => props.workspace.details;
  const summary = () => props.workspace.store.state.tasks[props.taskId];
  const detail = () => {
    const value = details()?.state.detail ?? null;
    return value?.task.id === props.taskId ? value : null;
  };
  const name = () => detail()?.task.name ?? summary()?.name ?? '';
  const ctx = () => props.workspace.dateContext();
  const typeName = () => {
    const id = detail()?.task.customItemId ?? summary()?.customItemId ?? 0;
    return (
      taskTypeChoices(Object.values(props.workspace.store.state.taskTypes)).find(
        (choice) => choice.id === id,
      )?.name ?? t('detail.defaultType')
    );
  };
  const displayId = () => detail()?.task.customId ?? summary()?.customId ?? props.taskId;

  // O serviço de detalhe acompanha a tarefa da URL; anterior/próxima trocam só o id.
  createEffect(
    on(
      () => props.taskId,
      (id) => void details()?.open(id),
    ),
  );
  onCleanup(() => details()?.close());

  // Metadados da lista: nomes do caminho (o GET da tarefa traz o espaço só com o id) e, nos
  // editores, status e membros.
  const [metadata, setMetadata] = createSignal<ListMetadata | null>(null);
  createEffect(
    on(
      () => detail()?.task.listId ?? null,
      (listId) => {
        setMetadata(null);
        if (!listId) return;
        details()
          ?.listMetadata(listId)
          .then((value) => {
            if (detail()?.task.listId === listId) setMetadata(value);
          })
          .catch(() => {});
      },
    ),
  );
  const breadcrumb = (): TaskBreadcrumb | null => {
    const own = detail()?.breadcrumb;
    if (!own) return null;
    const list = metadata()?.breadcrumb;
    const named = (part: BreadcrumbPart | null, fallback: BreadcrumbPart | null | undefined) =>
      part && !part.name && fallback?.id === part.id ? fallback : part;
    return {
      space: named(own.space, list?.space),
      folder: named(own.folder, list?.folder),
      list: named(own.list, list?.list),
    };
  };

  const rename = (value: string) => {
    const actions = props.workspace.actions;
    if (actions) void feedback.run(() => actions.update(props.taskId, { name: value }));
  };

  return (
    <Dialog open modal preventScroll={false} onOpenChange={(open) => !open && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class={styles.overlay} />
        <div class={styles.positioner}>
          <Dialog.Content
            class={styles.modal}
            data-ui="task-detail"
            onOpenAutoFocus={(event) => {
              // Sem anel de foco num botão ao abrir: o foco começa no próprio modal.
              event.preventDefault();
              (event.currentTarget as HTMLElement | null)?.focus();
            }}
          >
            <DetailHeader
              breadcrumb={breadcrumb()}
              createdAt={
                detail()?.task.dateCreated
                  ? formatMonthDay(detail()?.task.dateCreated ?? 0, ctx())
                  : null
              }
              hasPrevious={props.hasPrevious}
              hasNext={props.hasNext}
              onStep={props.onStep}
            />
            <div class={styles.body}>
              <section class={styles.main}>
                <div class={styles.content}>
                  <div class={styles.typeRow}>
                    <span class={styles.typePill}>
                      <StatusIcon
                        type="custom"
                        size={12}
                        style={{ color: 'var(--text-secondary)' }}
                      />
                      {typeName()}
                    </span>
                    <button
                      type="button"
                      class={styles.idButton}
                      aria-label={t('detail.copyId', { id: displayId() })}
                      title={t('detail.copyId', { id: displayId() })}
                      onClick={() =>
                        void navigator.clipboard?.writeText(displayId()).catch(() => {})
                      }
                    >
                      <Copy size={14} />
                      <Show when={detail()?.task.customId ?? summary()?.customId}>
                        <span>{displayId()}</span>
                      </Show>
                    </button>
                  </div>
                  <TaskTitle
                    name={name()}
                    disabled={
                      !props.workspace.actions || props.workspace.sync.status() === 'offline'
                    }
                    onRename={rename}
                  />
                  <Show
                    when={detail()}
                    fallback={
                      <p class={styles.loading} role="status">
                        {details()?.state.errors.task
                          ? t('detail.unavailable')
                          : t('detail.loading')}
                      </p>
                    }
                  >
                    {(current) => (
                      <TaskProperties
                        workspace={props.workspace}
                        detail={current()}
                        feedback={feedback}
                      />
                    )}
                  </Show>
                </div>
              </section>
              <aside class={styles.activity} aria-label={t('detail.activity')}>
                <h2 class={styles.activityTitle}>{t('detail.activity')}</h2>
              </aside>
            </div>
            <EditToast feedback={feedback} />
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
