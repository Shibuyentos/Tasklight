import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskTag } from '../../domain/task-detail';
import { TagsPicker } from './TagsPicker';

const tag = (name: string): TaskTag => ({ name, foreground: '#4466ff', background: '#4466ff' });

function setup(
  load: () => Promise<TaskTag[] | null> = async () => [tag('farmácia'), tag('mercado')],
) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(() => (
    <TagsPicker
      tags={[tag('mercado')]}
      loadTags={load}
      onAdd={onAdd}
      onRemove={onRemove}
      triggerLabel="Alterar etiquetas"
    >
      <span>etiquetas</span>
    </TagsPicker>
  ));
  return { onAdd, onRemove, trigger: screen.getByRole('button', { name: 'Alterar etiquetas' }) };
}

describe('TagsPicker', () => {
  it('lista as etiquetas do espaço e marca as da tarefa', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();

    await user.click(trigger);

    expect(await screen.findByRole('option', { name: 'mercado' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'farmácia' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('cada clique adiciona ou remove na hora e o menu continua aberto', async () => {
    const user = userEvent.setup();
    const { trigger, onAdd, onRemove } = setup();

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'farmácia' }));
    await user.click(screen.getByRole('option', { name: 'mercado' }));

    expect(onAdd).toHaveBeenCalledWith('farmácia');
    expect(onRemove).toHaveBeenCalledWith('mercado');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('sem o catálogo do espaço, as etiquetas da tarefa continuam removíveis', async () => {
    const user = userEvent.setup();
    const { trigger, onRemove } = setup(async () => null);

    await user.click(trigger);
    await waitFor(() =>
      expect(screen.getByText('Etiquetas indisponíveis no momento')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('option', { name: 'mercado' }));

    expect(onRemove).toHaveBeenCalledWith('mercado');
  });
});
