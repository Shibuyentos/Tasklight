import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import type { TaskStatus } from '../../domain/task';
import { StatusPill } from './StatusPill';

const PAUSED: TaskStatus = {
  name: 'pausado',
  color: 'rgb(245, 183, 36)',
  type: 'custom',
  orderindex: 4,
};
const PLANNED: TaskStatus = {
  name: 'programado',
  color: 'rgb(51, 151, 221)',
  type: 'open',
  orderindex: 0,
};

describe('StatusPill', () => {
  it('mostra o nome como veio, deixando as maiúsculas para o CSS', () => {
    render(() => <StatusPill status={PLANNED} />);

    const label = screen.getByText('programado');
    expect(label).toBeInTheDocument();
    expect(label.className).toMatch(/label/);
  });

  it('usa a cor do status no fundo e texto branco sobre cor escura', () => {
    render(() => <StatusPill status={PLANNED} />);

    expect(screen.getByTestId('status-pill')).toHaveStyle({
      backgroundColor: 'rgb(51, 151, 221)',
      color: 'rgb(255, 255, 255)',
    });
  });

  it('usa texto escuro sobre cor clara', () => {
    render(() => <StatusPill status={PAUSED} />);

    expect(screen.getByTestId('status-pill')).toHaveStyle({
      backgroundColor: 'rgb(245, 183, 36)',
      color: 'rgba(0, 0, 0, 0.875)',
    });
  });
});
