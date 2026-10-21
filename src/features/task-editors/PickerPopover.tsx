import { Popover } from '@kobalte/core/popover';
import type { JSX } from 'solid-js';
import styles from './editors.module.css';

export interface PickerTrigger {
  label: string;
  class?: string | undefined;
  title?: string | undefined;
  disabled?: boolean | undefined;
  testId?: string;
  ui?: string;
}

export interface PickerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: PickerTrigger;
  triggerContent: JSX.Element;
  /** Largura e particularidades do menu. */
  contentClass?: string | undefined;
  /** Elemento que recebe o foco ao abrir, como a pesquisa. */
  initialFocus?: () => HTMLElement | undefined;
  children: JSX.Element;
}

/** Gatilho + menu flutuante dos editores. O clique no gatilho não chega à linha da tarefa. */
export function PickerPopover(props: PickerPopoverProps) {
  return (
    <Popover
      open={props.open}
      onOpenChange={props.onOpenChange}
      placement="bottom-start"
      gutter={4}
      flip
      slide
      overflowPadding={8}
    >
      <Popover.Trigger
        class={props.trigger.class}
        aria-label={props.trigger.label}
        title={props.trigger.title}
        disabled={props.trigger.disabled}
        data-testid={props.trigger.testId}
        data-ui={props.trigger.ui}
        onClick={(event: MouseEvent) => event.stopPropagation()}
      >
        {props.triggerContent}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class={[styles.menu, props.contentClass].filter(Boolean).join(' ')}
          aria-label={props.trigger.label}
          onOpenAutoFocus={(event) => {
            const target = props.initialFocus?.();
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
        >
          {props.children}
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
