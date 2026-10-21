import { fireEvent, render, screen } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Broken(): JSX.Element {
  throw new Error('quebrou');
}

beforeEach(() => {
  // O erro capturado vai para o console de desenvolvimento; aqui ele só polui a saída.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it('troca a tela quebrada por um aviso com "Recarregar"', () => {
    const reload = vi.fn();
    render(() => (
      <AppErrorBoundary onReload={reload}>
        <Broken />
      </AppErrorBoundary>
    ));

    expect(screen.getByRole('heading', { name: 'Algo deu errado.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('sem erro, mostra o conteúdo', () => {
    render(() => (
      <AppErrorBoundary>
        <p>Tudo certo</p>
      </AppErrorBoundary>
    ));

    expect(screen.getByText('Tudo certo')).toBeInTheDocument();
  });
});
