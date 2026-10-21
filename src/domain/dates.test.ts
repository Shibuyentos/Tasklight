// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type DateContext, dueTone, formatDueDate, isDateOnly, isDueByToday } from './dates';

// Horário de Brasília (UTC-3, sem horário de verão).
const local = (iso: string) => new Date(`${iso}-03:00`).getTime();
const dateOnly = (isoDay: string) => local(`${isoDay}T04:00:00`);

// Quarta-feira, 21/10/2026, 15h.
const ctx: DateContext = {
  now: local('2026-10-21T15:00:00'),
  timeZone: 'America/Sao_Paulo',
  weekStartDay: 0,
};

describe('formatDueDate', () => {
  it.each([
    ['2026-10-21', 'Hoje'],
    ['2026-10-22', 'Amanhã'],
    ['2026-10-20', 'Ontem'],
    ['2026-10-19', 'seg'],
    ['2026-10-18', 'dom'],
    ['2026-10-23', 'sex'],
    ['2026-10-24', 'sáb'],
    ['2026-10-25', '10/25/26'],
    ['2026-11-03', '11/3/26'],
    ['2025-12-30', '12/30/25'],
  ])('%s → %s', (isoDay, expected) => {
    expect(formatDueDate(dateOnly(isoDay), ctx)).toBe(expected);
  });

  it('respeita a semana começando na segunda-feira', () => {
    const mondayStart = { ...ctx, weekStartDay: 1 };

    expect(formatDueDate(dateOnly('2026-10-18'), mondayStart)).toBe('10/18/26');
    expect(formatDueDate(dateOnly('2026-10-25'), mondayStart)).toBe('dom');
  });
});

describe('dueTone', () => {
  it('data sem hora de hoje ainda não está atrasada', () => {
    expect(dueTone(dateOnly('2026-10-21'), 'custom', ctx)).toBe('normal');
  });

  it('data sem hora de ontem está atrasada', () => {
    expect(dueTone(dateOnly('2026-10-20'), 'open', ctx)).toBe('overdue');
  });

  it('data com hora compara com o momento atual', () => {
    expect(dueTone(local('2026-10-21T10:00:00'), 'custom', ctx)).toBe('overdue');
    expect(dueTone(local('2026-10-21T18:00:00'), 'custom', ctx)).toBe('normal');
  });

  it('tarefa concluída nunca fica atrasada', () => {
    expect(dueTone(dateOnly('2026-09-04'), 'done', ctx)).toBe('complete');
    expect(dueTone(dateOnly('2026-12-01'), 'closed', ctx)).toBe('complete');
  });

  it('sem vencimento é normal', () => {
    expect(dueTone(null, 'custom', ctx)).toBe('normal');
  });
});

describe('isDueByToday', () => {
  it('vale para vencimentos de hoje, mesmo mais tarde, e para os atrasados', () => {
    expect(isDueByToday(dateOnly('2026-10-21'), 'custom', ctx)).toBe(true);
    expect(isDueByToday(local('2026-10-21T23:00:00'), 'open', ctx)).toBe(true);
    expect(isDueByToday(dateOnly('2026-08-28'), 'custom', ctx)).toBe(true);
  });

  it('não vale para amanhã, sem data ou tarefa completa', () => {
    expect(isDueByToday(dateOnly('2026-10-22'), 'custom', ctx)).toBe(false);
    expect(isDueByToday(null, 'custom', ctx)).toBe(false);
    expect(isDueByToday(dateOnly('2026-08-28'), 'done', ctx)).toBe(false);
    expect(isDueByToday(dateOnly('2026-08-28'), 'closed', ctx)).toBe(false);
  });
});

describe('isDateOnly', () => {
  it('04:00 no fuso do usuário é data sem hora', () => {
    expect(isDateOnly(dateOnly('2026-10-21'), 'America/Sao_Paulo')).toBe(true);
    expect(isDateOnly(local('2026-10-21T10:30:00'), 'America/Sao_Paulo')).toBe(false);
  });

  it('funciona em dias de troca de horário de verão', () => {
    // Nova York: o horário de verão termina em 01/11/2026 e começa em 08/03/2026.
    expect(isDateOnly(Date.parse('2026-11-01T09:00:00Z'), 'America/New_York')).toBe(true);
    expect(isDateOnly(Date.parse('2026-03-08T08:00:00Z'), 'America/New_York')).toBe(true);
  });
});
