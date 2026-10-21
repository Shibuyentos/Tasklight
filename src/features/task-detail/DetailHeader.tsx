import { Dialog } from '@kobalte/core/dialog';
import { ChevronDown, ChevronUp, X } from 'lucide-solid';
import { For, Show } from 'solid-js';
import type { TaskBreadcrumb } from '../../domain/task-detail';
import { t } from '../../i18n';
import styles from './task-detail.module.css';

export interface DetailHeaderProps {
  breadcrumb: TaskBreadcrumb | null;
  /** "out 21", já no formato do ClickUp. */
  createdAt: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onStep: (direction: 1 | -1) => void;
}

/** Cabeçalho do modal: anterior/próxima, caminho espaço / pasta / lista, criação e fechar. */
export function DetailHeader(props: DetailHeaderProps) {
  const parts = () =>
    [props.breadcrumb?.space, props.breadcrumb?.folder, props.breadcrumb?.list].filter(
      (part): part is NonNullable<typeof part> => Boolean(part?.name),
    );

  return (
    <header class={styles.header}>
      <div class={styles.headerNav}>
        <button
          type="button"
          class={styles.headerButton}
          aria-label={t('detail.previous')}
          title={t('detail.previous')}
          disabled={!props.hasPrevious}
          onClick={() => props.onStep(-1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          class={styles.headerButton}
          aria-label={t('detail.next')}
          title={t('detail.next')}
          disabled={!props.hasNext}
          onClick={() => props.onStep(1)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <nav class={styles.breadcrumb} aria-label={t('detail.location')}>
        <For each={parts()}>
          {(part, index) => (
            <>
              <Show when={index() > 0}>
                <span class={styles.breadcrumbDivider} aria-hidden="true">
                  /
                </span>
              </Show>
              <span
                class={
                  index() === parts().length - 1 ? styles.breadcrumbCurrent : styles.breadcrumbPart
                }
              >
                {part.name}
              </span>
            </>
          )}
        </For>
      </nav>
      <div class={styles.headerSpacer} />
      <Show when={props.createdAt}>
        {(created) => (
          <span class={styles.createdAt}>{t('detail.createdAt', { date: created() })}</span>
        )}
      </Show>
      <Dialog.CloseButton
        class={styles.headerButton}
        aria-label={t('detail.close')}
        title={t('detail.close')}
      >
        <X size={16} />
      </Dialog.CloseButton>
    </header>
  );
}
