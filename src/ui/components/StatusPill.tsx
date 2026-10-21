import { readableTextColor } from '../../domain/color';
import { statusLabel } from '../../domain/status';
import type { TaskStatus } from '../../domain/task';
import { StatusIcon } from './StatusIcon';
import styles from './StatusPill.module.css';

const TEXT_ON_DARK = 'rgb(255, 255, 255)';
const TEXT_ON_LIGHT = 'rgba(0, 0, 0, 0.875)';

/** Pílula do grupo: cor do status no fundo, ícone e nome (as maiúsculas vêm do CSS). */
export function StatusPill(props: { status: TaskStatus }) {
  const textColor = () =>
    readableTextColor(props.status.color) === 'dark' ? TEXT_ON_LIGHT : TEXT_ON_DARK;

  return (
    <span
      class={styles.pill}
      data-testid="status-pill"
      data-ui="status-pill"
      style={{ 'background-color': props.status.color, color: textColor() }}
    >
      <StatusIcon type={props.status.type} cutout={props.status.color} />
      <span class={styles.label}>{statusLabel(props.status.name)}</span>
    </span>
  );
}
