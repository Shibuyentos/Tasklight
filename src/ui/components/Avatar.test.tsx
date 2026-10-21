import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('mostra as iniciais em branco sobre a cor do usuário', () => {
    render(() => <Avatar initials="GR" color="rgb(0, 145, 255)" title="Gabriel Rocha" />);

    const avatar = screen.getByRole('img', { name: 'Gabriel Rocha' });
    expect(avatar).toHaveTextContent('GR');
    expect(avatar).toHaveStyle({
      backgroundColor: 'rgb(0, 145, 255)',
      color: 'rgb(255, 255, 255)',
      width: '24px',
      height: '24px',
    });
  });

  it('usa texto escuro sobre fundo claro', () => {
    render(() => <Avatar initials="PA" color="rgb(255, 197, 61)" title="Pausado" />);

    expect(screen.getByRole('img', { name: 'Pausado' })).toHaveStyle({
      color: 'rgba(0, 0, 0, 0.875)',
    });
  });

  it('respeita o tamanho pedido', () => {
    render(() => <Avatar initials="GR" color="rgb(0, 145, 255)" title="Grande" size={32} />);

    expect(screen.getByRole('img', { name: 'Grande' })).toHaveStyle({ width: '32px' });
  });

  it('volta para as iniciais quando a foto não carrega', () => {
    const { container } = render(() => (
      <Avatar
        initials="GR"
        color="rgb(0, 145, 255)"
        title="Gabriel Rocha"
        src="https://exemplo.com/foto.png"
      />
    ));
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Gabriel Rocha' })).not.toHaveTextContent('GR');

    fireEvent.error(image as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Gabriel Rocha' })).toHaveTextContent('GR');
  });
});
