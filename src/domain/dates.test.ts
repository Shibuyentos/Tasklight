// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  calendarWeeks,
  type DateContext,
  dateOnlyTime,
  dayLabel,
  dueTone,
  formatDueDate,
  formatMonthDay,
  formatNumericDate,
  formatShortNumericDate,
  formatTime,
  isDateOnly,
  isDueByToday,
  localDate,
  monthTitle,
  quickDates,
  weekdayLabels,
  zonedTime,
} from './dates';

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

describe('zonedTime e dateOnlyTime', () => {
  it('data sem hora fica às 04:00 no fuso do usuário, como o ClickUp grava', () => {
    expect(dateOnlyTime({ year: 2026, month: 11, day: 3 }, 'America/Sao_Paulo')).toBe(
      Date.parse('2026-11-03T07:00:00Z'),
    );
  });

  it('acerta o horário nos dias de troca de horário de verão', () => {
    const tz = 'America/New_York';
    // O horário de verão termina às 02:00 de 01/11: às 04:00 o fuso já é UTC-5.
    expect(dateOnlyTime({ year: 2026, month: 11, day: 1 }, tz)).toBe(
      Date.parse('2026-11-01T09:00:00Z'),
    );
    expect(zonedTime({ year: 2026, month: 3, day: 8 }, 15, 30, tz)).toBe(
      Date.parse('2026-03-08T19:30:00Z'),
    );
  });

  it('localDate devolve o dia de calendário no fuso', () => {
    expect(localDate(Date.parse('2026-10-22T02:30:00Z'), 'America/Sao_Paulo')).toEqual({
      year: 2026,
      month: 10,
      day: 21,
    });
  });
});

describe('quickDates', () => {
  it('reproduz os atalhos do ClickUp numa quarta-feira à noite', () => {
    const evening = { ...ctx, now: local('2026-10-21T18:59:00') };
    const options = quickDates(evening).map((option) => ({
      key: option.key,
      hint: option.hint,
      time: option.time,
      at: new Date(option.value).toISOString(),
    }));

    expect(options).toEqual([
      { key: 'today', hint: 'qua', time: false, at: '2026-10-21T07:00:00.000Z' },
      { key: 'later', hint: '8:59 pm', time: true, at: '2026-10-21T23:59:00.000Z' },
      { key: 'tomorrow', hint: 'qui', time: false, at: '2026-10-22T07:00:00.000Z' },
      { key: 'thisWeekend', hint: 'sáb', time: false, at: '2026-10-24T07:00:00.000Z' },
      { key: 'nextWeek', hint: 'seg', time: false, at: '2026-10-26T07:00:00.000Z' },
      { key: 'nextWeekend', hint: '31 out', time: false, at: '2026-10-31T07:00:00.000Z' },
      { key: 'twoWeeks', hint: '4 nov', time: false, at: '2026-11-04T07:00:00.000Z' },
      { key: 'fourWeeks', hint: '18 nov', time: false, at: '2026-11-18T07:00:00.000Z' },
    ]);
  });

  it('no sábado, "este final de semana" é hoje e "semana que vem" é a segunda seguinte', () => {
    const saturday = { ...ctx, now: local('2026-10-24T09:00:00') };
    const byKey = Object.fromEntries(quickDates(saturday).map((option) => [option.key, option]));

    expect(localDate(byKey.thisWeekend?.value ?? 0, ctx.timeZone).day).toBe(24);
    expect(localDate(byKey.nextWeek?.value ?? 0, ctx.timeZone).day).toBe(26);
  });
});

describe('calendário', () => {
  it('outubro de 2026 começando no domingo ocupa seis semanas, de 27/9 a 7/11', () => {
    const weeks = calendarWeeks(2026, 10, 0);

    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toEqual({ year: 2026, month: 9, day: 27 });
    expect(weeks[5]?.[6]).toEqual({ year: 2026, month: 11, day: 7 });
  });

  it('a semana pode começar na segunda-feira', () => {
    expect(calendarWeeks(2026, 10, 1)[0]?.[0]).toEqual({ year: 2026, month: 9, day: 28 });
    expect(weekdayLabels(1)).toEqual(['2ª', '3ª', '4ª', '5ª', '6ª', 'sá', 'do']);
  });

  it('rótulos e título seguem o ClickUp', () => {
    expect(weekdayLabels(0)).toEqual(['do', '2ª', '3ª', '4ª', '5ª', '6ª', 'sá']);
    expect(monthTitle(2026, 10)).toBe('outubro 2026');
  });
});

describe('formatTime', () => {
  it('usa 12 horas com am/pm minúsculo', () => {
    expect(formatTime(local('2026-10-21T20:59:00'), ctx.timeZone)).toBe('8:59 pm');
    expect(formatTime(local('2026-10-21T00:05:00'), ctx.timeZone)).toBe('12:05 am');
    expect(formatTime(local('2026-07-08T15:30:00'), ctx.timeZone, { compact: true })).toBe(
      '3:30pm',
    );
  });
});

describe('rótulos de data', () => {
  it('dayLabel descreve o dia por extenso', () => {
    expect(dayLabel({ year: 2026, month: 11, day: 5 })).toBe('5 de novembro de 2026');
  });

  it('formatNumericDate mostra a hora só quando há hora', () => {
    expect(formatNumericDate(dateOnly('2026-11-03'), ctx.timeZone)).toBe('11/3/26');
    expect(formatNumericDate(local('2026-07-08T15:30:00'), ctx.timeZone)).toBe('7/8/26, 3:30pm');
  });
});

describe('datas do detalhe', () => {
  it('formatShortNumericDate omite o ano corrente e mostra a hora quando houver', () => {
    expect(formatShortNumericDate(dateOnly('2026-10-01'), ctx)).toBe('10/1');
    expect(formatShortNumericDate(dateOnly('2025-12-30'), ctx)).toBe('12/30/25');
    expect(formatShortNumericDate(local('2026-11-10T15:30:00'), ctx)).toBe('11/10, 3:30pm');
  });

  it('formatMonthDay segue o "Criada em" do ClickUp', () => {
    expect(formatMonthDay(local('2026-10-21T09:45:00'), ctx)).toBe('out 21');
    expect(formatMonthDay(local('2025-09-25T09:45:00'), ctx)).toBe('set 25, 2025');
  });
});
