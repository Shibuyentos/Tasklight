export interface TaskTypeInfo {
  id: number;
  name: string;
  icon: string | null;
}

export type TaskTypeKind = 'default' | 'milestone' | 'meeting_note' | 'form_response' | 'custom';

export interface TaskTypeChoice extends TaskTypeInfo {
  kind: TaskTypeKind;
}

/** Tipos do sistema que o menu do ClickUp oferece, com o nome da interface em português. */
const BUILT_IN: Readonly<Record<string, { kind: TaskTypeKind; name: string }>> = {
  milestone: { kind: 'milestone', name: 'Marco' },
  meeting_note: { kind: 'meeting_note', name: 'Anotação da reunião' },
  form_response: { kind: 'form_response', name: 'Resposta do formulário' },
};

/** Os ids abaixo disso são do próprio ClickUp; os tipos criados no workspace começam em 1000. */
const FIRST_CUSTOM_ID = 1000;

/**
 * Opções da aba "Tipo de tarefa": a Tarefa padrão, o Marco e os demais em ordem alfabética.
 * Tipos internos do sistema (IA, fluxos) ficam de fora, como no ClickUp.
 */
export function taskTypeChoices(types: readonly TaskTypeInfo[]): TaskTypeChoice[] {
  const choices: TaskTypeChoice[] = [];
  for (const type of types) {
    if (type.id === 0) continue;
    if (type.id >= FIRST_CUSTOM_ID) {
      choices.push({ ...type, kind: 'custom' });
      continue;
    }
    const builtIn = BUILT_IN[type.name];
    if (builtIn) choices.push({ ...type, name: builtIn.name, kind: builtIn.kind });
  }
  const milestones = choices.filter((choice) => choice.kind === 'milestone');
  const others = choices
    .filter((choice) => choice.kind !== 'milestone')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return [{ id: 0, name: 'Tarefa', icon: null, kind: 'default' }, ...milestones, ...others];
}
