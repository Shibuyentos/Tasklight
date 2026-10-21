import { ErrorBoundary, type JSX } from 'solid-js';
import { t } from '../i18n';
import styles from './AppErrorBoundary.module.css';

/** Erro inesperado na interface: em vez de uma tela em branco, um aviso com "Recarregar". */
export function AppErrorBoundary(props: { children: JSX.Element; onReload?: () => void }) {
  const reload = () => (props.onReload ? props.onReload() : window.location.reload());

  return (
    <ErrorBoundary
      fallback={(error: unknown) => {
        console.error(error);
        return (
          <main class={styles.screen}>
            <h1 class={styles.title}>{t('app.crash.title')}</h1>
            <button class={styles.reload} type="button" onClick={reload}>
              {t('app.crash.reload')}
            </button>
          </main>
        );
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}
