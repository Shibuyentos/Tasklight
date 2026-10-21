import { render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type DateContext, dateOnlyTime, zonedTime } from '../../domain/dates';
import { DatesPicker } from './DatesPicker';

const TZ = 'America/Sao_Paulo';
const local = (iso: string) => new Date(`${iso}-03:00`).getTime();
// Quarta-feira, 21/10/2026, 18:59 em Brasília.
const ctx: DateContext = { now: local('2026-10-21T18:59:00'), timeZone: TZ, weekStartDay: 0 };

function setup(dates: { dueDate?: number | null; startDate?: number | null } = {}) {
  const onChange = vi.fn();
  render(() => (
    <DatesPicker
      dueDate={dates.dueDate ?? null}
      startDate={dates.startDate ?? null}
      ctx={ctx}
      onChange={onChange}
      triggerLabel="Alterar datas"
    >
      <span>data</span>
    </DatesPicker>
  ));
  return { onChange, trigger: screen.getByRole('button', { name: 'Alterar datas' }) };
}

async function open(trigger: HTMLElement) {
  const user = userEvent.setup();
  await user.click(trigger);
  await screen.findByRole('dialog');
  return user;
}

describe('DatesPicker', () => {
  it('abre no mês do vencimento com os dias da semana do usuário', async () => {
    const { trigger } = setup({ dueDate: dateOnlyTime({ year: 2026, month: 11, day: 3 }, TZ) });
    await open(trigger);

    expect(screen.getByRole('heading', { name: 'novembro 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'do',
      '2ª',
      '3ª',
      '4ª',
      '5ª',
      '6ª',
      'sá',
    ]);
    expect(screen.getByRole('button', { name: '3 de novembro de 2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sem vencimento abre no mês atual e marca hoje', async () => {
    const { trigger } = setup();
    await open(trigger);

    expect(screen.getByRole('heading', { name: 'outubro 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '21 de outubro de 2026' })).toHaveAttribute(
      'aria-current',
      'date',
    );
  });

  it('só os dias que já passaram ficam apagados, mesmo os do mês seguinte em tela', async () => {
    const { trigger } = setup();
    await open(trigger);

    expect(screen.getByRole('button', { name: '20 de outubro de 2026' })).toHaveAttribute(
      'data-muted',
    );
    expect(screen.getByRole('button', { name: '5 de novembro de 2026' })).not.toHaveAttribute(
      'data-muted',
    );
  });

  it('escolher um dia grava a data sem hora e fecha', async () => {
    const { trigger, onChange } = setup();
    const user = await open(trigger);

    await user.click(screen.getByRole('button', { name: '5 de novembro de 2026' }));

    expect(onChange).toHaveBeenCalledWith({
      dueDate: dateOnlyTime({ year: 2026, month: 11, day: 5 }, TZ),
      dueDateTime: false,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('trocar o dia de um vencimento com hora mantém a hora', async () => {
    const { trigger, onChange } = setup({ dueDate: local('2026-11-03T15:30:00') });
    const user = await open(trigger);

    await user.click(screen.getByRole('button', { name: '6 de novembro de 2026' }));

    expect(onChange).toHaveBeenCalledWith({
      dueDate: zonedTime({ year: 2026, month: 11, day: 6 }, 15, 30, TZ),
      dueDateTime: true,
    });
  });

  it('os atalhos aplicam a data calculada', async () => {
    const { trigger, onChange } = setup();
    const user = await open(trigger);

    expect(screen.getByRole('button', { name: /Próximo final de semana/ })).toHaveTextContent(
      '31 out',
    );
    await user.click(screen.getByRole('button', { name: /Amanhã/ }));

    expect(onChange).toHaveBeenCalledWith({
      dueDate: dateOnlyTime({ year: 2026, month: 10, day: 22 }, TZ),
      dueDateTime: false,
    });
  });

  it('a data inicial é escolhida pelo campo próprio e o menu segue aberto no vencimento', async () => {
    const { trigger, onChange } = setup();
    const user = await open(trigger);

    await user.click(screen.getByRole('button', { name: 'Data inicial' }));
    await user.click(screen.getByRole('button', { name: '23 de outubro de 2026' }));

    expect(onChange).toHaveBeenCalledWith({
      startDate: dateOnlyTime({ year: 2026, month: 10, day: 23 }, TZ),
      startDateTime: false,
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Data de vencimento' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('limpa o vencimento pelo botão do campo', async () => {
    const { trigger, onChange } = setup({
      dueDate: dateOnlyTime({ year: 2026, month: 11, day: 3 }, TZ),
    });
    const user = await open(trigger);

    await user.click(screen.getByRole('button', { name: 'Limpar data de vencimento' }));

    expect(onChange).toHaveBeenCalledWith({ dueDate: null, dueDateTime: false });
  });

  it('navega entre meses e volta para hoje', async () => {
    const { trigger } = setup();
    const user = await open(trigger);

    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getByRole('heading', { name: 'dezembro 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByRole('heading', { name: 'novembro 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getByRole('heading', { name: 'outubro 2026' })).toBeInTheDocument();
  });
});
