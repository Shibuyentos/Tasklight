import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OptionList, type PickerGroup } from './OptionList';

const GROUPS: PickerGroup[] = [
  {
    id: 'not-started',
    label: 'Não iniciado',
    options: [{ id: 'todo', label: 'pendente', searchText: 'to do', checked: true }],
  },
  {
    id: 'active',
    label: 'Ativo',
    options: [
      { id: 'doing', label: 'em progresso' },
      { id: 'blocked', label: 'bloqueado', disabled: true },
    ],
  },
  { id: 'closed', label: 'Fechado', options: [{ id: 'done', label: 'concluído' }] },
];

function setup(onSelect = vi.fn(), extra: Partial<Parameters<typeof OptionList>[0]> = {}) {
  render(() => (
    <OptionList
      label="Status"
      groups={GROUPS}
      placeholder="Pesquisar..."
      emptyText="Nada encontrado"
      onSelect={onSelect}
      {...extra}
    />
  ));
  return { input: screen.getByRole('combobox', { name: 'Pesquisar...' }), onSelect };
}

describe('OptionList', () => {
  it('mostra os grupos com títulos e marca a opção atual', () => {
    setup();

    expect(screen.getByRole('group', { name: 'Ativo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'pendente' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'em progresso' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('pesquisa sem acento e sem caixa, inclusive pelo nome original', async () => {
    const user = userEvent.setup();
    const { input } = setup();

    await user.type(input, 'CONCLUIDO');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'concluído',
    ]);

    await user.clear(input);
    await user.type(input, 'to do');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['pendente']);

    await user.clear(input);
    await user.type(input, 'xyz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Nada encontrado')).toBeInTheDocument();
  });

  it('navega pelas setas pulando opções desativadas e escolhe com Enter', async () => {
    const user = userEvent.setup();
    const { input, onSelect } = setup();
    input.focus();

    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('todo'));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('done'));
    await user.keyboard('{ArrowUp}{Enter}');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: 'doing' });
  });

  it('abre com a opção atual destacada, mesmo fora do topo', () => {
    render(() => (
      <OptionList
        label="Status"
        groups={[
          {
            id: 'g',
            options: [
              { id: 'a', label: 'a' },
              { id: 'b', label: 'b', checked: true },
            ],
          },
        ]}
        placeholder="Pesquisar..."
        emptyText="Nada encontrado"
        onSelect={vi.fn()}
      />
    ));

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-activedescendant',
      expect.stringMatching(/-b$/),
    );
  });

  it('o clique escolhe a opção e ignora as desativadas', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.click(screen.getByRole('option', { name: 'bloqueado' }));
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('option', { name: 'concluído' }));
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ id: 'done' });
  });

  it('atalhos próprios têm prioridade sobre a navegação', async () => {
    const user = userEvent.setup();
    const onShortcut = vi.fn((event: KeyboardEvent) => event.key === 'Enter' && event.ctrlKey);
    const { input, onSelect } = setup(vi.fn(), { onShortcut });
    input.focus();

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onShortcut).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('mostra a mensagem de estado no lugar das opções', () => {
    setup(vi.fn(), { status: 'Carregando status…' });

    expect(screen.getByRole('status')).toHaveTextContent('Carregando status…');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
