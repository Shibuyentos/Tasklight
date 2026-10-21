import { WifiOff } from 'lucide-solid';
import { Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import styles from './shell.module.css';

/** Sem conexão, a tela segue com o que está salvo e a sincronização espera a rede voltar. */
export function OfflineNotice() {
  const services = useServices();
  const offline = () => services.workspace?.()?.sync.status() === 'offline';

  return (
    <Show when={offline()}>
      <div
        class={styles.offlineNotice}
        role="status"
        aria-label={t('shell.offline')}
        data-ui="offline-notice"
      >
        <WifiOff size={14} />
        <span>{t('shell.offline')}</span>
      </div>
    </Show>
  );
}
