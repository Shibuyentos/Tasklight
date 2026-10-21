import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from './Menu';

describe('Menu', () => {
  it('abre pelo gatilho e executa o item escolhido', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(() => (
      <Menu.Root>
        <Menu.Trigger>Abrir menu</Menu.Trigger>
        <Menu.Content>
          <Menu.Item onSelect={onSelect}>Trocar token</Menu.Item>
          <Menu.Separator />
          <Menu.Item>Outra ação</Menu.Item>
        </Menu.Content>
      </Menu.Root>
    ));

    await user.click(screen.getByRole('button', { name: 'Abrir menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Trocar token' }));

    expect(onSelect).toHaveBeenCalledOnce();
  });
});
