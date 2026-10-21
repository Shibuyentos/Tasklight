import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TaskUser } from '../../domain/task-detail';
import { AssigneesPicker } from './AssigneesPicker';

const user = (id: number, name: string): TaskUser => ({
  id,
  name,
  email: `${name.toLowerCase()}@exemplo.com`,
  color: '#7b68ee',
  initials: name.slice(0, 2).toUpperCase(),
  avatarUrl: null,
});
const ME = user(1, 'Ana');
const BRUNO = user(2, 'Bruno');
const CARLA = user(3, 'Carla');

function setup(load: () => Promise<TaskUser[] | null> = async () => [ME, BRUNO, CARLA]) {
  const onChange = vi.fn();
  render(() => (
    <AssigneesPicker
      assigned={[ME, BRUNO]}
      currentUserId={ME.id}
      loadMembers={load}
      onChange={onChange}
      triggerLabel="Alterar responsáveis"
    >
      <span>responsáveis</span>
    </AssigneesPicker>
  ));
  return { onChange, trigger: screen.getByRole('button', { name: 'Alterar responsáveis' }) };
}

describe('AssigneesPicker', () => {
  it('separa responsáveis e pessoas, chamando o usuário atual de "Eu"', async () => {
    const actor = userEvent.setup();
    const { trigger } = setup();

    await actor.click(trigger);

    const assigned = await screen.findByRole('group', { name: 'Responsáveis' });
    expect(assigned).toHaveTextContent('Eu');
    expect(assigned).toHaveTextContent('Bruno');
    expect(screen.getByRole('group', { name: 'Pessoas' })).toHaveTextContent('Carla');
  });

  it('acumula as trocas e grava uma vez ao fechar', async () => {
    const actor = userEvent.setup();
    const { trigger, onChange } = setup();

    await actor.click(trigger);
    await actor.click(await screen.findByRole('option', { name: /Carla/ }));
    await actor.click(screen.getByRole('option', { name: /Bruno/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Responsáveis' })).toHaveTextContent('Carla');

    await actor.keyboard('{Escape}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([ME.id, CARLA.id]);
  });

  it('fechar sem mudanças não grava', async () => {
    const actor = userEvent.setup();
    const { trigger, onChange } = setup();

    await actor.click(trigger);
    await screen.findByRole('option', { name: /Carla/ });
    await actor.keyboard('{Escape}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('pesquisa por nome ou e-mail', async () => {
    const actor = userEvent.setup();
    const { trigger } = setup();

    await actor.click(trigger);
    await screen.findByRole('option', { name: /Carla/ });
    await actor.type(screen.getByRole('combobox'), 'carla@');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Carla');
  });

  it('sem a lista de membros, ainda mostra e permite tirar os responsáveis atuais', async () => {
    const actor = userEvent.setup();
    const { trigger, onChange } = setup(async () => null);

    await actor.click(trigger);
    await waitFor(() =>
      expect(screen.getByText('Membros indisponíveis no momento')).toBeInTheDocument(),
    );
    await actor.click(screen.getByRole('option', { name: /Bruno/ }));
    await actor.keyboard('{Escape}');

    expect(onChange).toHaveBeenCalledWith([ME.id]);
  });
});
