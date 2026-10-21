import { useServices } from '../../app/ServicesContext';
import { t } from '../../i18n';
import styles from './OfflineScreen.module.css';

export function OfflineScreen() {
  const { session } = useServices();

  return (
    <main class={styles.screen}>
      <h1 class={styles.title}>{t('offline.title')}</h1>
      <button class={styles.retry} type="button" onClick={() => void session.boot()}>
        {t('offline.retry')}
      </button>
    </main>
  );
}
