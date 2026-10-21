import { Dialog } from '@kobalte/core/dialog';
import { createSignal, Show } from 'solid-js';
import { t } from '../../i18n';
import styles from './task-detail.module.css';

/** Título grande e editável: clique edita, Enter salva, Esc desiste sem fechar o modal. */
export function TaskTitle(props: {
  name: string;
  disabled: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = createSignal(false);
  let input: HTMLTextAreaElement | undefined;

  function finish(save: boolean) {
    const value = input?.value.replace(/\s+/g, ' ').trim() ?? '';
    setEditing(false);
    if (save && value && value !== props.name) props.onRename(value);
  }

  return (
    <Show
      when={editing()}
      fallback={
        <Dialog.Title
          as="h1"
          class={styles.title}
          classList={{ [styles.titleEditable ?? '']: !props.disabled }}
          onClick={() => {
            if (props.disabled) return;
            setEditing(true);
            input?.focus();
            input?.select();
          }}
        >
          {props.name || t('detail.loading')}
        </Dialog.Title>
      }
    >
      <textarea
        ref={(element) => {
          input = element;
          queueMicrotask(() => {
            element.focus();
            element.select();
          });
        }}
        class={`${styles.title} ${styles.titleInput}`}
        aria-label={t('detail.taskName')}
        rows={1}
        value={props.name}
        on:keydown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            finish(true);
          } else if (event.key === 'Escape') {
            // O Esc desfaz a edição; o modal só fecha num segundo Esc.
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          }
        }}
        onBlur={() => editing() && finish(true)}
      />
    </Show>
  );
}
