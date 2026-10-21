import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditToast } from './EditToast';
import { createEditFeedback } from './edit-feedback';

describe('EditToast', () => {
  it('mostra a falha, repete o comando e some quando dá certo', async () => {
    const user = userEvent.setup();
    const feedback = createEditFeedback();
    const command = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'failed', taskId: 'a', keys: [] } })
      .mockResolvedValueOnce({ ok: true, value: null });
    render(() => <EditToast feedback={feedback} />);

    await feedback.run(command);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar a alteração.');
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(command).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sem "tentar de novo" quando repetir não é seguro; fechar esconde o aviso', async () => {
    const user = userEvent.setup();
    const feedback = createEditFeedback();
    render(() => <EditToast feedback={feedback} />);

    await feedback.run(async () => ({
      ok: false,
      error: { kind: 'uncertain', taskId: 'a', keys: [] },
    }));
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
