import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, TaskActionError } from '../../sync/task-actions';
import { createEditFeedback } from './edit-feedback';

const failure = (kind: TaskActionError['kind']): ActionResult<unknown> => ({
  ok: false,
  error: { kind, taskId: 'a', keys: ['priority'] },
});
const success: ActionResult<unknown> = { ok: true, value: null };

function setup() {
  return createRoot((dispose) => ({ feedback: createEditFeedback(), dispose }));
}

describe('createEditFeedback', () => {
  it('guarda a última falha com um "tentar de novo" que repete o mesmo comando', async () => {
    const { feedback, dispose } = setup();
    const command = vi.fn().mockResolvedValueOnce(failure('failed')).mockResolvedValueOnce(success);

    await feedback.run(command);
    expect(feedback.failure()).toMatchObject({ message: 'Não foi possível salvar a alteração.' });

    await feedback.failure()?.retry?.();
    expect(command).toHaveBeenCalledTimes(2);
    expect(feedback.failure()).toBeNull();
    dispose();
  });

  it('sem conexão explica e permite tentar de novo depois', async () => {
    const { feedback, dispose } = setup();

    await feedback.run(async () => failure('offline'));

    expect(feedback.failure()?.message).toBe('Sem conexão: a alteração não foi enviada.');
    expect(feedback.failure()?.retry).toBeTypeOf('function');
    dispose();
  });

  it('resultado incerto pede conferência e não oferece repetir', async () => {
    const { feedback, dispose } = setup();

    await feedback.run(async () => failure('uncertain'));

    expect(feedback.failure()).toEqual({
      message: 'Não foi possível confirmar se a alteração foi salva. Confira antes de repetir.',
      retry: null,
    });
    dispose();
  });

  it('um sucesso posterior limpa a falha e descartes não geram aviso', async () => {
    const { feedback, dispose } = setup();

    await feedback.run(async () => failure('failed'));
    await feedback.run(async () => success);
    expect(feedback.failure()).toBeNull();

    await feedback.run(async () => failure('disposed'));
    expect(feedback.failure()).toBeNull();
    dispose();
  });

  it('fechar o aviso esquece a falha', async () => {
    const { feedback, dispose } = setup();

    await feedback.run(async () => failure('failed'));
    feedback.dismiss();

    expect(feedback.failure()).toBeNull();
    dispose();
  });
});
