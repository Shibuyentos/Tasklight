import type { JSX } from 'solid-js';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: JSX.Element;
  class?: string;
}

export function IconButton(props: IconButtonProps) {
  return (
    <button
      type="button"
      class={props.class ? `${styles.button} ${props.class}` : styles.button}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={() => props.onClick?.()}
    >
      {props.children}
    </button>
  );
}
