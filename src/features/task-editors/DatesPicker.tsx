import { Calendar, ChevronDown, ChevronUp, X } from 'lucide-solid';
import { createMemo, createSignal, For, type JSX, Show } from 'solid-js';
import {
  calendarWeeks,
  compareDates,
  type DateContext,
  dateOnlyTime,
  dayLabel,
  formatNumericDate,
  isDateOnly,
  type LocalDate,
  localClock,
  localDate,
  monthTitle,
  type QuickDateKey,
  quickDates,
  sameDate,
  weekdayLabels,
  zonedTime,
} from '../../domain/dates';
import { type MessageKey, t } from '../../i18n';
import styles from './editors.module.css';
import { PickerPopover } from './PickerPopover';

export interface DatesChange {
  dueDate?: number | null;
  dueDateTime?: boolean;
  startDate?: number | null;
  startDateTime?: boolean;
}

export interface DatesPickerProps {
  dueDate: number | null;
  startDate: number | null;
  ctx: DateContext;
  onChange: (change: DatesChange) => void;
  disabled?: boolean;
  triggerLabel: string;
  triggerClass?: string;
  triggerTitle?: string;
  children: JSX.Element;
}

type Field = 'start' | 'due';

const QUICK_LABEL: Readonly<Record<QuickDateKey, MessageKey>> = {
  today: 'editors.dates.today',
  later: 'editors.dates.later',
  tomorrow: 'editors.dates.tomorrow',
  thisWeekend: 'editors.dates.thisWeekend',
  nextWeek: 'editors.dates.nextWeek',
  nextWeekend: 'editors.dates.nextWeekend',
  twoWeeks: 'editors.dates.twoWeeks',
  fourWeeks: 'editors.dates.fourWeeks',
};

/** Seletor de datas do ClickUp: início e vencimento, atalhos e calendário no fuso do usuário. */
export function DatesPicker(props: DatesPickerProps) {
  const [open, setOpen] = createSignal(false);
  const [field, setField] = createSignal<Field>('due');
  const [view, setView] = createSignal<LocalDate>({ year: 1970, month: 1, day: 1 });
  let dueButton: HTMLButtonElement | undefined;

  const tz = () => props.ctx.timeZone;
  const today = () => localDate(props.ctx.now, tz());
  const fieldValue = (which: Field) => (which === 'due' ? props.dueDate : props.startDate);
  const dayOf = (which: Field) => {
    const value = fieldValue(which);
    return value === null ? null : localDate(value, tz());
  };

  function showMonthOf(date: LocalDate) {
    setView({ year: date.year, month: date.month, day: 1 });
  }

  function apply(which: Field, value: number | null, time: boolean) {
    if (which === 'due') {
      props.onChange({ dueDate: value, dueDateTime: time });
      setOpen(false);
    } else {
      props.onChange({ startDate: value, startDateTime: time });
      setField('due');
    }
  }

  /** O dia escolhido mantém a hora de uma data que já tinha hora. */
  function pick(day: LocalDate) {
    const which = field();
    const current = fieldValue(which);
    if (current !== null && !isDateOnly(current, tz())) {
      const { hour, minute } = localClock(current, tz());
      apply(which, zonedTime(day, hour, minute, tz()), true);
    } else {
      apply(which, dateOnlyTime(day, tz()), false);
    }
  }

  const weeks = createMemo(() => calendarWeeks(view().year, view().month, props.ctx.weekStartDay));
  const range = createMemo(() => {
    const start = dayOf('start');
    const due = dayOf('due');
    return start && due && compareDates(start, due) < 0 ? { start, due } : null;
  });

  function moveMonth(step: number) {
    const current = view();
    const index = current.year * 12 + current.month - 1 + step;
    setView({ year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 });
  }

  return (
    <PickerPopover
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setField('due');
          showMonthOf(dayOf('due') ?? today());
        }
      }}
      trigger={{
        label: props.triggerLabel,
        class: props.triggerClass,
        title: props.triggerTitle,
        disabled: props.disabled,
      }}
      triggerContent={props.children}
      contentClass={styles.datesMenu}
      initialFocus={() => dueButton}
    >
      <div class={styles.datesFields}>
        <For each={['start', 'due'] as const}>
          {(which) => (
            <div class={styles.dateField} data-active={field() === which || undefined}>
              <button
                ref={(element) => {
                  if (which === 'due') dueButton = element;
                }}
                type="button"
                class={styles.dateFieldButton}
                aria-label={t(which === 'due' ? 'editors.dates.due' : 'editors.dates.start')}
                aria-pressed={field() === which}
                onClick={() => {
                  setField(which);
                  const day = dayOf(which);
                  if (day) showMonthOf(day);
                }}
              >
                <Calendar size={14} />
                <span class={fieldValue(which) === null ? styles.dateFieldPlaceholder : undefined}>
                  {fieldValue(which) === null
                    ? t(which === 'due' ? 'editors.dates.due' : 'editors.dates.start')
                    : formatNumericDate(fieldValue(which) ?? 0, tz())}
                </span>
              </button>
              <Show when={fieldValue(which) !== null}>
                <button
                  type="button"
                  class={styles.dateFieldClear}
                  aria-label={t(
                    which === 'due' ? 'editors.dates.clearDue' : 'editors.dates.clearStart',
                  )}
                  onClick={() => apply(which, null, false)}
                >
                  <X size={14} />
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class={styles.datesBody}>
        <div class={styles.quickDates}>
          <For each={quickDates(props.ctx)}>
            {(option) => (
              <button
                type="button"
                class={styles.quickDate}
                onClick={() => apply(field(), option.value, option.time)}
              >
                <span>{t(QUICK_LABEL[option.key])}</span>
                <span class={styles.quickDateHint}>{option.hint}</span>
              </button>
            )}
          </For>
        </div>
        <div class={styles.calendar}>
          <div class={styles.calendarNav}>
            <h2 class={styles.calendarTitle}>{monthTitle(view().year, view().month)}</h2>
            <button type="button" class={styles.calendarToday} onClick={() => showMonthOf(today())}>
              {t('editors.dates.todayButton')}
            </button>
            <button
              type="button"
              class={styles.calendarArrow}
              aria-label={t('editors.dates.previousMonth')}
              onClick={() => moveMonth(-1)}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              class={styles.calendarArrow}
              aria-label={t('editors.dates.nextMonth')}
              onClick={() => moveMonth(1)}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <table class={styles.calendarGrid}>
            <thead>
              <tr>
                <For each={weekdayLabels(props.ctx.weekStartDay)}>
                  {(label) => <th scope="col">{label}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={weeks()}>
                {(week) => (
                  <tr>
                    <For each={week}>
                      {(day) => {
                        const isToday = () => sameDate(day, today());
                        const selected = () =>
                          [dayOf('due'), dayOf('start')].some(
                            (value) => value !== null && sameDate(value, day),
                          );
                        const inRange = () => {
                          const value = range();
                          return (
                            value !== null &&
                            compareDates(day, value.start) > 0 &&
                            compareDates(day, value.due) < 0
                          );
                        };
                        return (
                          <td data-in-range={inRange() || undefined}>
                            <button
                              type="button"
                              class={styles.calendarDay}
                              aria-label={dayLabel(day)}
                              aria-pressed={selected()}
                              aria-current={isToday() ? 'date' : undefined}
                              // Como no ClickUp, só o que já passou fica apagado, inclusive no mês vizinho.
                              data-muted={compareDates(day, today()) < 0 || undefined}
                              onClick={() => pick(day)}
                            >
                              {day.day}
                            </button>
                          </td>
                        );
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </div>
    </PickerPopover>
  );
}
