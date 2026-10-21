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
