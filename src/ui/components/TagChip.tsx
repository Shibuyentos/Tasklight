import type { TaskTag } from '../../domain/task-detail';
import styles from './TagChip.module.css';

const FALLBACK = 'rgb(123, 123, 123)';

/** Etiqueta no tema escuro: a cor do ClickUp suavizada no fundo e clareada no texto. */
export function TagChip(props: { tag: TaskTag }) {
  const color = () => props.tag.background ?? props.tag.foreground ?? FALLBACK;
  return (
    <span
      class={styles.chip}
      style={{
        'background-color': `color-mix(in srgb, ${color()} 28%, rgb(17, 17, 17))`,
        color: `color-mix(in srgb, ${color()} 55%, rgb(255, 255, 255))`,
      }}
    >
      {props.tag.name}
    </span>
  );
}
