import { X } from 'lucide-solid';
import { Show } from 'solid-js';
import { t } from '../../i18n';
import type { EditFeedback } from './edit-feedback';
import styles from './editors.module.css';

/** Aviso da última edição que não foi salva, com "tentar de novo" quando é seguro repetir. */
export function EditToast(props: { feedback: EditFeedback }) {
  return (
    <Show when={props.feedback.failure()}>
      {(failure) => (
        <div class={styles.toast} role="alert">
          <span class={styles.toastMessage}>{failure().message}</span>
          <Show when={failure().retry}>
            {(retry) => (
              <button type="button" class={styles.toastAction} onClick={() => void retry()()}>
                {t('editors.feedback.retry')}
              </button>
            )}
          </Show>
          <button
            type="button"
            class={styles.toastClose}
            aria-label={t('editors.feedback.dismiss')}
            onClick={() => props.feedback.dismiss()}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </Show>
  );
}
