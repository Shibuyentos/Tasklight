import { type JSX, Match, Switch } from 'solid-js';
import type { StatusType } from '../../domain/task';

export type StatusIconKind = 'open' | 'custom' | 'done';

export function statusIconKind(type: StatusType): StatusIconKind {
  if (type === 'open' || type === 'unstarted') return 'open';
  if (type === 'done' || type === 'closed') return 'done';
  return 'custom';
}

export interface StatusIconProps {
  type: StatusType;
  size?: number;
  /**
   * `group` é o ícone da pílula; `row` é o das linhas sem tipo de tarefa, em que o ClickUp mostra
   * só o anel nos status em andamento.
   */
  appearance?: 'group' | 'row';
  /** Cor do "recorte" do check, igual ao fundo sobre o qual o ícone aparece. */
  cutout?: string;
  class?: string;
  style?: JSX.CSSProperties;
  testId?: string;
}

/** Ícones de status próprios: tracejado (aberto), anel (em andamento), check (concluído). */
export function StatusIcon(props: StatusIconProps) {
  const kind = () => statusIconKind(props.type);
  const size = () => props.size ?? 16;

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      class={props.class}
      style={props.style}
      data-status-icon={kind()}
      data-testid={props.testId}
    >
      <Switch>
        <Match when={kind() === 'open'}>
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-dasharray="2.9 2.01"
          />
        </Match>
        <Match when={kind() === 'custom'}>
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5" />
          {props.appearance === 'row' ? null : <circle cx="8" cy="8" r="4" fill="currentColor" />}
        </Match>
        <Match when={kind() === 'done'}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.25 7.1 10.3 11 6.2"
            stroke={props.cutout ?? 'var(--bg-main)'}
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </Match>
      </Switch>
    </svg>
  );
}
