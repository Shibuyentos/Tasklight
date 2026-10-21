import type { Requester } from '../api/scheduler';
import {
  fetchAllTeamTasks,
  fetchAttachmentsCount,
  fetchCustomTaskTypes,
  type TeamTasksQuery,
} from '../api/tasks';
import type { ApiCustomItem } from '../api/types';
import { normalizeTask } from '../domain/normalize';
import type { Task } from '../domain/task';
import type { TaskType } from '../store/tasks';

/** Consultas de tarefas já no modelo do app, com a prioridade de cada uso. */
export interface TasksApi {
  fetchAssignedRoots(onPage?: (tasks: Task[]) => void): Promise<Task[]>;
  fetchUpdatedSince(cursor: number): Promise<Task[]>;
  fetchOpenSubtasks(parentId: string): Promise<Task[]>;
  fetchAttachmentsCount(taskId: string): Promise<number>;
  fetchTaskTypes(): Promise<TaskType[]>;
}

/** Os ícones dos tipos de tarefa vêm do Font Awesome; outras origens usam o ícone padrão. */
const FONT_AWESOME_SOURCES: ReadonlySet<string> = new Set(['fas', 'fab']);

function toTaskType({ id, name, avatar }: ApiCustomItem): TaskType {
  const fromFontAwesome = avatar?.source != null && FONT_AWESOME_SOURCES.has(avatar.source);
  return { id, name, icon: fromFontAwesome ? (avatar?.value ?? null) : null };
}

export function createTasksApi(requester: Requester, teamId: string, userId: number): TasksApi {
  async function background(query: TeamTasksQuery): Promise<Task[]> {
    const tasks = await fetchAllTeamTasks(requester, teamId, query, { priority: 'background' });
    return tasks.map(normalizeTask);
  }

  return {
    async fetchAssignedRoots(onPage) {
      const tasks: Task[] = [];
      await fetchAllTeamTasks(
        requester,
        teamId,
        { assignees: [userId], subtasks: false, includeClosed: true },
        {
          priority: 'visible',
          onPage: (page) => {
            const normalized = page.map(normalizeTask);
            tasks.push(...normalized);
            onPage?.(normalized);
          },
        },
      );
      return tasks;
    },

    // Sem filtro de responsável: quem perde a tarefa precisa recebê-la para tirá-la da tela.
    fetchUpdatedSince: (cursor) =>
      background({
        subtasks: true,
        includeClosed: true,
        dateUpdatedGt: cursor,
        orderBy: 'updated',
      }),

    fetchOpenSubtasks: (parentId) =>
      background({ parent: parentId, subtasks: true, includeClosed: false }),

    fetchAttachmentsCount: (taskId) => fetchAttachmentsCount(requester, taskId, 'background'),

    async fetchTaskTypes() {
      const items = await fetchCustomTaskTypes(requester, teamId, 'background');
      return items.map(toTaskType);
    },
  };
}
