import { createEffect, createSignal, on, Show } from 'solid-js';
import { readableTextColor } from '../../domain/color';
import styles from './Avatar.module.css';

// Iniciais em 12px num avatar de 24px, como no ClickUp; os demais tamanhos seguem a proporção.
const FONT_SIZE = { 16: 8, 20: 10, 24: 12, 32: 14 } as const;

export type AvatarSize = keyof typeof FONT_SIZE;

export interface AvatarProps {
  initials: string;
  color: string;
  src?: string | null;
  size?: AvatarSize;
  title?: string;
}

export function Avatar(props: AvatarProps) {
  const [imageFailed, setImageFailed] = createSignal(false);
  createEffect(
    on(
      () => props.src,
      () => setImageFailed(false),
      { defer: true },
    ),
  );

  const size = () => props.size ?? 24;
  const textColor = () =>
    readableTextColor(props.color) === 'dark' ? 'rgba(0, 0, 0, 0.875)' : 'rgb(255, 255, 255)';

  return (
    <span
      class={styles.avatar}
      role="img"
      aria-label={props.title ?? props.initials}
      title={props.title}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        'font-size': `${FONT_SIZE[size()]}px`,
        'background-color': props.color,
        color: textColor(),
      }}
    >
      <Show when={props.src && !imageFailed()} fallback={props.initials}>
        <img
          class={styles.image}
          src={props.src ?? ''}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </Show>
    </span>
  );
}
