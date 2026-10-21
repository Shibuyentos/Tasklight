import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('tem nome acessível e executa a ação', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(() => (
      <IconButton label="Recolher barra lateral" onClick={onClick}>
        <svg aria-hidden="true" />
      </IconButton>
    ));

    await user.click(screen.getByRole('button', { name: 'Recolher barra lateral' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('desabilitado não executa a ação', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(() => (
      <IconButton label="Criar" onClick={onClick} disabled>
        <svg aria-hidden="true" />
      </IconButton>
    ));

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
