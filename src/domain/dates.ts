import { isComplete } from './grouping';
import type { StatusType } from './task';

export interface DateContext {
  now: number;
  timeZone: string;
  /** Primeiro dia da semana do usuário no ClickUp: 0 = domingo. */
  weekStartDay: number;
}

export type DueTone = 'normal' | 'overdue' | 'complete';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const DAY_MS = 86_400_000;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(ms: number, timeZone: string): LocalParts {
  const values: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return {
    year: values.year ?? 0,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

/** Dia de calendário absoluto, para comparar datas no fuso do usuário. */
function dayNumber(parts: LocalParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
}

function weekday(parts: LocalParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** O ClickUp grava datas sem hora às 04:00 no fuso do usuário. */
export function isDateOnly(ms: number, timeZone: string): boolean {
  const parts = localParts(ms, timeZone);
  return parts.hour === 4 && parts.minute === 0 && parts.second === 0;
}

export function formatDueDate(ms: number, ctx: DateContext): string {
  const due = localParts(ms, ctx.timeZone);
  const today = localParts(ctx.now, ctx.timeZone);
  const diff = dayNumber(due) - dayNumber(today);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';

  const weekStart = dayNumber(today) - ((weekday(today) - ctx.weekStartDay + 7) % 7);
  const dueDay = dayNumber(due);
  if (dueDay >= weekStart && dueDay < weekStart + 7) return WEEKDAYS[weekday(due)] ?? '';

  return `${due.month}/${due.day}/${String(due.year).slice(-2)}`;
}

/** "Hoje e atrasadas": tarefa não completa que vence hoje ou já venceu, no calendário do usuário. */
export function isDueByToday(
  dueDate: number | null,
  statusType: StatusType,
  ctx: DateContext,
): boolean {
  if (dueDate === null || isComplete(statusType)) return false;
  return (
    dayNumber(localParts(dueDate, ctx.timeZone)) <= dayNumber(localParts(ctx.now, ctx.timeZone))
  );
}

export function dueTone(dueDate: number | null, statusType: StatusType, ctx: DateContext): DueTone {
  if (isComplete(statusType)) return 'complete';
  if (dueDate === null) return 'normal';
  if (isDateOnly(dueDate, ctx.timeZone)) {
    const due = dayNumber(localParts(dueDate, ctx.timeZone));
    const today = dayNumber(localParts(ctx.now, ctx.timeZone));
    return due < today ? 'overdue' : 'normal';
  }
  return dueDate < ctx.now ? 'overdue' : 'normal';
}

/** Dia de calendário, sem fuso. */
export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;
const CALENDAR_WEEKDAYS = ['do', '2ª', '3ª', '4ª', '5ª', '6ª', 'sá'] as const;
const HOUR_MS = 3_600_000;

export function localDate(ms: number, timeZone: string): LocalDate {
  const { year, month, day } = localParts(ms, timeZone);
  return { year, month, day };
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function sameDate(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Negativo quando `a` vem antes de `b`. */
export function compareDates(a: LocalDate, b: LocalDate): number {
  return Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day);
}

function weekdayOf(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Instante em que o relógio do fuso marca o dia e a hora informados. */
export function zonedTime(date: LocalDate, hour: number, minute: number, timeZone: string): number {
  const wanted = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guess = wanted;
  // Duas correções bastam: a segunda acerta os dias em que o deslocamento do fuso muda.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const seen = localParts(guess, timeZone);
    guess += wanted - Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  }
  return guess;
}

/** Datas sem hora ficam às 04:00 no fuso do usuário, como o ClickUp grava. */
export function dateOnlyTime(date: LocalDate, timeZone: string): number {
  return zonedTime(date, 4, 0, timeZone);
}

/** "8:59 pm"; compacto, como nas células da lista: "3:30pm". */
export function formatTime(ms: number, timeZone: string, options?: { compact?: boolean }): string {
  const { hour, minute } = localParts(ms, timeZone);
  const suffix = hour < 12 ? 'am' : 'pm';
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')}`;
  return options?.compact ? `${clock}${suffix}` : `${clock} ${suffix}`;
}

/** "31 out" */
export function formatShortDay(date: LocalDate): string {
  return `${date.day} ${MONTHS[date.month - 1]?.slice(0, 3) ?? ''}`;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? ''} ${year}`;
}

export function weekdayLabels(weekStartDay: number): string[] {
  return Array.from(
    { length: 7 },
    (_, index) => CALENDAR_WEEKDAYS[(weekStartDay + index) % 7] ?? '',
  );
}

/** Seis semanas, como o calendário do ClickUp, começando no primeiro dia de semana do usuário. */
export function calendarWeeks(year: number, month: number, weekStartDay: number): LocalDate[][] {
  const first: LocalDate = { year, month, day: 1 };
  const start = addDays(first, -((weekdayOf(first) - weekStartDay + 7) % 7));
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  );
}

export type QuickDateKey =
  | 'today'
  | 'later'
  | 'tomorrow'
  | 'thisWeekend'
  | 'nextWeek'
  | 'nextWeekend'
  | 'twoWeeks'
  | 'fourWeeks';

export interface QuickDate {
  key: QuickDateKey;
  value: number;
  /** Com hora marcada; os demais atalhos gravam só a data. */
  time: boolean;
  /** Texto à direita do atalho: dia da semana, data curta ou horário. */
  hint: string;
}

/** Atalhos do seletor de datas do ClickUp, calculados no calendário do usuário. */
export function quickDates(ctx: DateContext): QuickDate[] {
  const today = localDate(ctx.now, ctx.timeZone);
  const weekday = weekdayOf(today);
  const thisWeekend = addDays(today, (6 - weekday + 7) % 7);
  const day = (key: QuickDateKey, date: LocalDate): QuickDate => {
    const ahead = compareDates(date, today) / DAY_MS;
    return {
      key,
      value: dateOnlyTime(date, ctx.timeZone),
      time: false,
      hint: ahead < 7 ? (WEEKDAYS[weekdayOf(date)] ?? '') : formatShortDay(date),
    };
  };
  const later = ctx.now + 2 * HOUR_MS;
  return [
    day('today', today),
    { key: 'later', value: later, time: true, hint: formatTime(later, ctx.timeZone) },
    day('tomorrow', addDays(today, 1)),
    day('thisWeekend', thisWeekend),
    day('nextWeek', addDays(today, (1 - weekday + 7) % 7 || 7)),
    day('nextWeekend', addDays(thisWeekend, 7)),
    day('twoWeeks', addDays(today, 14)),
    day('fourWeeks', addDays(today, 28)),
  ];
}

export function localClock(ms: number, timeZone: string): { hour: number; minute: number } {
  const { hour, minute } = localParts(ms, timeZone);
  return { hour, minute };
}

/** "5 de novembro de 2026", para leitores de tela. */
export function dayLabel(date: LocalDate): string {
  return `${date.day} de ${MONTHS[date.month - 1] ?? ''} de ${date.year}`;
}

/** Data numérica como no ClickUp ("11/3/26"), com a hora quando houver ("7/8/26, 3:30pm"). */
export function formatNumericDate(ms: number, timeZone: string): string {
  const { year, month, day } = localParts(ms, timeZone);
  const date = `${month}/${day}/${String(year).slice(-2)}`;
  return isDateOnly(ms, timeZone)
    ? date
    : `${date}, ${formatTime(ms, timeZone, { compact: true })}`;
}

/** "10/1" no ano corrente e "10/1/25" em outros anos; com hora quando houver, como no detalhe do ClickUp. */
export function formatShortNumericDate(ms: number, ctx: DateContext): string {
  const { year, month, day } = localParts(ms, ctx.timeZone);
  const sameYear = year === localParts(ctx.now, ctx.timeZone).year;
  const date = sameYear ? `${month}/${day}` : `${month}/${day}/${String(year).slice(-2)}`;
  return isDateOnly(ms, ctx.timeZone)
    ? date
    : `${date}, ${formatTime(ms, ctx.timeZone, { compact: true })}`;
}

/** "out 21" no ano corrente e "out 21, 2025" em outros anos, como "Criada em" do ClickUp. */
export function formatMonthDay(ms: number, ctx: DateContext): string {
  const { year, month, day } = localParts(ms, ctx.timeZone);
  const label = `${MONTHS[month - 1]?.slice(0, 3) ?? ''} ${day}`;
  return year === localParts(ctx.now, ctx.timeZone).year ? label : `${label}, ${year}`;
}
