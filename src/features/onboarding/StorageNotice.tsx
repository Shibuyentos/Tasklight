import { X } from 'lucide-solid';
import { createSignal, Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import { IconButton } from '../../ui/components/IconButton';
import styles from './StorageNotice.module.css';

/** Faixa exibida quando o token foi aceito mas não pôde ser salvo neste navegador. */
export function StorageNotice() {
  const { session } = useServices();
  const [dismissed, setDismissed] = createSignal(false);

  return (
    <Show when={session.state.notice === 'storage' && !dismissed()}>
      <div class={styles.notice} role="status">
        <span class={styles.message}>{t('token.notice.storage')}</span>
        <IconButton label={t('notice.dismiss')} onClick={() => setDismissed(true)}>
          <X size={16} />
        </IconButton>
      </div>
    </Show>
  );
}
