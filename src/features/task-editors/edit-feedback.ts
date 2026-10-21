import { createSignal } from 'solid-js';
import { type MessageKey, t } from '../../i18n';
import type { ActionResult, TaskActionError } from '../../sync/task-actions';

export interface EditFailure {
  message: string;
  /** Repete o mesmo comando; `null` quando repetir pode duplicar algo já salvo. */
  retry: (() => Promise<void>) | null;
}

export interface EditFeedback {
  run(command: () => Promise<ActionResult<unknown>>): Promise<void>;
  failure(): EditFailure | null;
  dismiss(): void;
}

const MESSAGE: Readonly<Record<Exclude<TaskActionError['kind'], 'disposed'>, MessageKey>> = {
  failed: 'editors.feedback.failed',
  offline: 'editors.feedback.offline',
  pending: 'editors.feedback.pending',
  uncertain: 'editors.feedback.uncertain',
};
const RETRYABLE = new Set<TaskActionError['kind']>(['failed', 'offline']);

/** Executa as edições da tela e guarda a última falha para o aviso com "tentar de novo". */
export function createEditFeedback(): EditFeedback {
  const [failure, setFailure] = createSignal<EditFailure | null>(null);

  async function run(command: () => Promise<ActionResult<unknown>>): Promise<void> {
    const result = await command();
    if (result.ok) {
      setFailure(null);
      return;
    }
    const { kind } = result.error;
    if (kind === 'disposed') return;
    setFailure({
      message: t(MESSAGE[kind]),
      retry: RETRYABLE.has(kind) ? () => run(command) : null,
    });
  }

  return { run, failure, dismiss: () => setFailure(null) };
}
