import { createMemo, createSignal, createUniqueId, For, type JSX, Show } from 'solid-js';
import styles from './editors.module.css';

export interface PickerOption {
  id: string;
  label: string;
  /** Texto extra considerado na pesquisa (ex.: o nome original de um status traduzido). */
  searchText?: string;
  icon?: JSX.Element;
  /** Substitui o rótulo em texto, como a etiqueta colorida; o texto continua sendo o nome. */
  content?: JSX.Element;
  /** Texto à direita, como o atalho "Ctrl 1". */
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  class?: string;
}

export interface PickerGroup {
  id: string;
  label?: string;
  options: PickerOption[];
}

export interface OptionListProps {
  /** Nome acessível da lista de opções. */
  label: string;
  groups: PickerGroup[];
  placeholder: string;
  emptyText: string;
  onSelect: (option: PickerOption) => void;
  /** Atalhos próprios do menu; devolve `true` quando tratou a tecla. */
  onShortcut?: (event: KeyboardEvent) => boolean;
  /** Mensagem no lugar das opções (carregando, indisponível). */
  status?: string | null;
  /** Aviso acima das opções, sem escondê-las. */
  note?: string | null;
  ref?: (input: HTMLInputElement) => void;
}

/** Sem acentos e sem diferença de caixa, para a pesquisa achar "concluído" digitando "concluido". */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Pesquisa e opções agrupadas, no formato dos menus do ClickUp, navegáveis pelo teclado. */
export function OptionList(props: OptionListProps) {
  const id = createUniqueId();
  const [query, setQuery] = createSignal('');
  const [activeId, setActiveId] = createSignal<string | null>(null);

  const visibleGroups = createMemo(() => {
    const wanted = searchKey(query().trim());
    return props.groups
      .map((group) => ({
        ...group,
        options: wanted
          ? group.options.filter((option) =>
              searchKey(`${option.label} ${option.searchText ?? ''}`).includes(wanted),
            )
          : group.options,
      }))
      .filter((group) => group.options.length > 0);
  });
  const enabled = createMemo(() =>
    visibleGroups().flatMap((group) => group.options.filter((option) => !option.disabled)),
  );
  // A opção destacada continua a escolhida pelo teclado; sem ela, a atual ou a primeira.
  const active = createMemo(() => {
    const options = enabled();
    return (
      options.find((option) => option.id === activeId()) ??
      options.find((option) => option.checked) ??
      options[0] ??
      null
    );
  });
  const optionId = (option: PickerOption) => `${id}-${option.id}`;

  function move(step: number) {
    const options = enabled();
    if (options.length === 0) return;
    const index = options.findIndex((option) => option.id === active()?.id);
    const next = options[Math.min(options.length - 1, Math.max(0, index + step))];
    if (next) setActiveId(next.id);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (props.onShortcut?.(event)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      const option = active();
      if (!option) return;
      event.preventDefault();
      props.onSelect(option);
    }
  }

  return (
    <>
      <label class={styles.search}>
        <input
          ref={props.ref}
          class={styles.searchInput}
          type="text"
          role="combobox"
          aria-label={props.placeholder}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active() ? optionId(active() as PickerOption) : undefined}
          placeholder={props.placeholder}
          autocomplete="off"
          spellcheck={false}
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setActiveId(null);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <Show
        when={!props.status}
        fallback={
          <p class={styles.message} role="status">
            {props.status}
          </p>
        }
      >
        <Show when={props.note}>
          <p class={styles.message}>{props.note}</p>
        </Show>
        <div id={`${id}-list`} class={styles.options} role="listbox" aria-label={props.label}>
          <Show
            when={visibleGroups().length > 0}
            fallback={<p class={styles.message}>{props.emptyText}</p>}
          >
            <For each={visibleGroups()}>
              {(group, index) => (
                // biome-ignore lint/a11y/useSemanticElements: grupo de opções dentro de um listbox (padrão ARIA)
                <div role="group" aria-label={group.label}>
                  <Show when={index() > 0 && group.label}>
                    <hr class={styles.divider} />
                  </Show>
                  <Show when={group.label}>
                    <div class={styles.heading} aria-hidden="true">
                      {group.label}
                    </div>
                  </Show>
                  <For each={group.options}>
                    {(option) => (
                      // biome-ignore lint/a11y/useFocusableInteractive: o foco fica na pesquisa, que aponta a opção ativa por aria-activedescendant
                      // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado é tratado no campo de pesquisa
                      <div
                        id={optionId(option)}
                        class={[styles.option, option.class].filter(Boolean).join(' ')}
                        role="option"
                        aria-selected={option.checked === true}
                        aria-disabled={option.disabled || undefined}
                        data-active={active()?.id === option.id || undefined}
                        onPointerMove={() => !option.disabled && setActiveId(option.id)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => !option.disabled && props.onSelect(option)}
                      >
                        <Show when={option.icon}>
                          <span class={styles.optionIcon}>{option.icon}</span>
                        </Show>
                        <span class={styles.optionLabel}>{option.content ?? option.label}</span>
                        <Show when={option.checked}>
                          <CheckIcon />
                        </Show>
                        <Show when={option.hint}>
                          <span class={styles.optionHint}>{option.hint}</span>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </>
  );
}

function CheckIcon() {
  return (
    <svg class={styles.optionCheck} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
