import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { type ComponentProps, splitProps } from 'solid-js';
import styles from './Menu.module.css';

function withClass(base: string | undefined, extra: string | undefined): string {
  return [base, extra].filter(Boolean).join(' ');
}

function Content(props: ComponentProps<typeof DropdownMenu.Content>) {
  const [local, others] = splitProps(props, ['class']);
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content class={withClass(styles.content, local.class)} {...others} />
    </DropdownMenu.Portal>
  );
}

function Item(props: ComponentProps<typeof DropdownMenu.Item>) {
  const [local, others] = splitProps(props, ['class']);
  return <DropdownMenu.Item class={withClass(styles.item, local.class)} {...others} />;
}

function Separator(props: ComponentProps<typeof DropdownMenu.Separator>) {
  const [local, others] = splitProps(props, ['class']);
  return <DropdownMenu.Separator class={withClass(styles.separator, local.class)} {...others} />;
}

/** Menu suspenso acessível (Kobalte) com o visual dos menus do ClickUp. */
export const Menu = {
  Root: DropdownMenu,
  Trigger: DropdownMenu.Trigger,
  Content,
  Item,
  Separator,
};
