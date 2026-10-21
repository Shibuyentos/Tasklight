import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Priority } from '../../domain/task';
import { PriorityPicker } from './PriorityPicker';

function setup(value: Priority | null = 'high', disabled = false) {
  const onChange = vi.fn();
  const onRowClick = vi.fn();
  render(() => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a linha clicável só existe para o teste
    // biome-ignore lint/a11y/noStaticElementInteractions: idem
    <div onClick={onRowClick}>
      <PriorityPicker
        value={value}
        onChange={onChange}
        disabled={disabled}
        triggerLabel="Alterar prioridade"
      >
        <span>célula</span>
      </PriorityPicker>
    </div>
  ));
  return {
    onChange,
    onRowClick,
    trigger: screen.getByRole('button', { name: 'Alterar prioridade' }),
  };
}

describe('PriorityPicker', () => {
  it('lista as prioridades do ClickUp com atalhos e marca a atual', async () => {
    const user = userEvent.setup();
    const { trigger, onRowClick } = setup('high');

    await user.click(trigger);

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'UrgenteCtrl 1',
      'AltaCtrl 2',
      'NormalCtrl 3',
      'BaixaCtrl 4',
      'LimparCtrl 0',
    ]);
    expect(screen.getByRole('option', { name: /Alta/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('escolher uma prioridade aplica e fecha o menu', async () => {
    const user = userEvent.setup();
    const { trigger, onChange } = setup('high');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /Urgente/ }));

    expect(onChange).toHaveBeenCalledWith('urgent');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Limpar remove a prioridade e a atual não regrava', async () => {
    const user = userEvent.setup();
    const { trigger, onChange } = setup('high');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /Alta/ }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /Limpar/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('Ctrl+número escolhe direto, como no ClickUp', async () => {
    const user = userEvent.setup();
    const { trigger, onChange } = setup(null);

    await user.click(trigger);
    await screen.findByRole('listbox');
    await user.keyboard('{Control>}3{/Control}');

    expect(onChange).toHaveBeenCalledWith('normal');
  });

  it('Esc fecha sem alterar e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    const { trigger, onChange } = setup('low');

    await user.click(trigger);
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('desativado não abre', async () => {
    const user = userEvent.setup();
    const { trigger } = setup('low', true);

    await user.click(trigger);

    expect(trigger).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
