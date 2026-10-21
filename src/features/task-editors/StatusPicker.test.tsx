import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskStatus } from '../../domain/task';
import { taskTypeChoices } from '../../domain/task-types';
import { StatusPicker } from './StatusPicker';

const status = (name: string, type: TaskStatus['type'], orderindex: number): TaskStatus => ({
  name,
  type,
  orderindex,
  color: '#5f55ee',
});
const STATUSES = [
  status('to do', 'open', 0),
  status('in progress', 'custom', 1),
  status('aceite usuário', 'done', 2),
  status('complete', 'closed', 3),
];

function setup(load: () => Promise<TaskStatus[] | null> = async () => STATUSES) {
  const onChange = vi.fn();
  const onTypeChange = vi.fn();
  render(() => (
    <StatusPicker
      current={STATUSES[0] as TaskStatus}
      loadStatuses={load}
      onChange={onChange}
      types={{
        current: 0,
        choices: taskTypeChoices([
          { id: 1, name: 'milestone', icon: null },
          { id: 1020, name: 'Bug', icon: 'bug' },
        ]),
        onChange: onTypeChange,
      }}
      triggerLabel="Alterar o status de Tarefa"
    >
      <span>ícone</span>
    </StatusPicker>
  ));
  return {
    onChange,
    onTypeChange,
    trigger: screen.getByRole('button', { name: 'Alterar o status de Tarefa' }),
  };
}

describe('StatusPicker', () => {
  it('mostra os status da lista agrupados por tipo, traduzidos e com o atual marcado', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();

    await user.click(trigger);

    await screen.findByRole('option', { name: 'pendente' });
    expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual([
      'Não iniciado',
      'Ativo',
      'Concluído',
      'Fechado',
    ]);
    expect(screen.getByRole('option', { name: 'pendente' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('pesquisa também pelo nome original do status', async () => {
    const user = userEvent.setup();
    const { trigger } = setup();

    await user.click(trigger);
    await screen.findByRole('option', { name: 'pendente' });
    await user.type(screen.getByRole('combobox'), 'progress');

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'em progresso',
    ]);
  });

  it('escolher outro status entrega o status completo e fecha', async () => {
    const user = userEvent.setup();
    const { trigger, onChange } = setup();

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'aceite usuário' }));

    expect(onChange).toHaveBeenCalledWith(STATUSES[2]);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('o status atual não regrava', async () => {
    const user = userEvent.setup();
    const { trigger, onChange } = setup();

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'pendente' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('avisa enquanto carrega e quando os status não estão disponíveis', async () => {
    const user = userEvent.setup();
    let resolve!: (value: TaskStatus[] | null) => void;
    const { trigger } = setup(() => new Promise((done) => (resolve = done)));

    await user.click(trigger);
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando status…');
    resolve(null);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Não foi possível carregar os status'),
    );
  });

  it('abre na aba Status e a aba "Tipo de tarefa" troca o tipo', async () => {
    const user = userEvent.setup();
    const { trigger, onTypeChange, onChange } = setup();

    await user.click(trigger);
    expect(await screen.findByRole('tab', { name: 'Status' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Tipo de tarefa' }));

    expect(screen.getByRole('option', { name: /^Tarefa/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Tarefa(padrão)',
      'Marco',
      'Bug',
    ]);
    await user.click(screen.getByRole('option', { name: 'Marco' }));

    expect(onTypeChange).toHaveBeenCalledWith(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
