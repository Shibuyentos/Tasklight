import { createSignal, Show } from 'solid-js';
import { useServices } from '../../app/ServicesContext';
import { type MessageKey, t } from '../../i18n';
import type { SubmitResult } from '../../sync/session';
import styles from './TokenScreen.module.css';

const CLICKUP_APPS_URL = 'https://app.clickup.com/settings/apps';

const ERROR_MESSAGE: Record<Exclude<SubmitResult, 'ok'>, MessageKey> = {
  'invalid-format': 'token.error.format',
  'invalid-token': 'token.error.invalid',
  network: 'token.error.network',
};

export function TokenScreen() {
  const { session } = useServices();
  const [token, setToken] = createSignal('');
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<MessageKey | null>(
    session.state.notice === 'invalid-token' ? 'token.error.invalid' : null,
  );

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (pending()) return;
    setPending(true);
    setError(null);
    const result = await session.submitToken(token());
    setPending(false);
    if (result !== 'ok') setError(ERROR_MESSAGE[result]);
  }

  return (
    <main class={styles.screen}>
      <form class={styles.card} onSubmit={submit}>
        <h1 class={styles.title}>{t('token.title')}</h1>
        <p class={styles.description}>{t('token.description')}</p>
        <label class={styles.label} for="clickup-token">
          {t('token.label')}
        </label>
        <input
          id="clickup-token"
          class={styles.input}
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder={t('token.placeholder')}
          value={token()}
          onInput={(event) => setToken(event.currentTarget.value)}
        />
        <Show when={error()}>
          {(key) => (
            <p class={styles.error} role="alert">
              {t(key())}
            </p>
          )}
        </Show>
        <button class={styles.submit} type="submit" disabled={pending()}>
          {pending() ? t('token.submitting') : t('token.submit')}
        </button>
        <a class={styles.help} href={CLICKUP_APPS_URL} target="_blank" rel="noreferrer">
          {t('token.help')}
        </a>
      </form>
    </main>
  );
}
