// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { taskTypeChoices } from './task-types';

describe('taskTypeChoices', () => {
  it('reproduz a lista "Tipo de tarefa" do ClickUp: padrão, marco e o resto em ordem alfabética', () => {
    const choices = taskTypeChoices([
      { id: 1, name: 'milestone', icon: null },
      { id: 3, name: 'form_response', icon: null },
      { id: 4, name: 'meeting_note', icon: null },
      { id: 5, name: 'ai_skill', icon: null },
      { id: 7, name: 'workflow', icon: null },
      { id: 1001, name: 'Financeiro', icon: 'dollar-sign' },
      { id: 1002, name: 'Task', icon: 'check-circle' },
      { id: 1003, name: 'Data & Evento', icon: 'calendar' },
      { id: 1004, name: 'Item', icon: 'gift' },
      { id: 1005, name: 'Leetcode', icon: 'question' },
    ]);

    expect(choices.map((choice) => [choice.id, choice.name])).toEqual([
      [0, 'Tarefa'],
      [1, 'Marco'],
      [4, 'Anotação da reunião'],
      [1003, 'Data & Evento'],
      [1001, 'Financeiro'],
      [1004, 'Item'],
      [1005, 'Leetcode'],
      [3, 'Resposta do formulário'],
      [1002, 'Task'],
    ]);
    expect(choices[0]?.kind).toBe('default');
    expect(choices[1]?.kind).toBe('milestone');
    expect(choices.find((choice) => choice.id === 1001)).toMatchObject({
      kind: 'custom',
      icon: 'dollar-sign',
    });
  });

  it('sem tipos carregados ainda oferece a Tarefa padrão', () => {
    expect(taskTypeChoices([]).map((choice) => choice.name)).toEqual(['Tarefa']);
  });
});
