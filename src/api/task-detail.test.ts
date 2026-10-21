import { describe, expect, it } from 'vitest';
import type { Requester, ScheduledRequestOptions } from './scheduler';
import { createTaskDetailApi } from './task-detail';

describe('detalhes por recurso', () => {
  it('busca tags existentes no Space e preserva cores', async () => {
    const requester: Requester = {
      get: async <T>(path: string, options?: ScheduledRequestOptions) => {
        expect(path).toBe('/space/s/tag');
        expect(options).toEqual({
          priority: 'interactive',
          invalidateSessionOnUnauthorized: false,
        });
        return { tags: [{ name: 'Tag', tag_fg: '#fff', tag_bg: '#000' }] } as T;
      },
    };
    expect(await createTaskDetailApi(requester, 'w').getSpaceTags('s')).toEqual([
      { name: 'Tag', foreground: '#fff', background: '#000' },
    ]);
  });
  it('busca markdown/subtarefas e normaliza opcionais, URLs e IDs defensivamente', async () => {
    const calls: Array<[string, ScheduledRequestOptions | undefined]> = [];
    const requester: Requester = {
      get: async <T>(path: string, options?: ScheduledRequestOptions) => {
        calls.push([path, options]);
        return {
          id: 't',
          name: 'Nome',
          markdown_description: '**Olá**',
          assignees: null,
          attachments: [{ id: 'a', url: 'javascript:x' }],
          time_estimate: '0',
          subtasks: [{ id: 'child' }],
          custom_fields: [{ id: 'f', type: 'number', value: 0 }],
        } as T;
      },
    };
    const detail = await createTaskDetailApi(requester, 'w').getTask('t');
    expect(calls[0]).toEqual([
      '/task/t',
      {
        query: { include_markdown_description: true, include_subtasks: true },
        priority: 'interactive',
        invalidateSessionOnUnauthorized: false,
      },
    ]);
    expect(detail).toMatchObject({
      task: { id: 't', assigneeIds: [] },
      markdownDescription: '**Olá**',
      timeEstimate: 0,
      attachments: [{ url: null }],
      subtasks: [{ id: 'child' }],
      customFields: [{ value: 0 }],
    });
  });
  it('compõe metadados isolados por lista com campos aplicáveis e membros', async () => {
    const calls: string[] = [];
    const requester: Requester = {
      get: async <T>(path: string, options?: ScheduledRequestOptions) => {
        calls.push(path);
        expect(options?.invalidateSessionOnUnauthorized).toBe(false);
        if (path.endsWith('/field')) {
          expect(options?.query).toEqual({ include_applied_objects: true });
          return { fields: [{ id: 'f', type: 'number' }] } as T;
        }
        if (path.endsWith('/member')) return { members: [{ id: 5, username: 'Membro' }] } as T;
        return {
          id: 'l',
          name: 'Lista',
          status: { status: 'Cor' },
          statuses: [{ status: 'Aberto', type: 'open', color: '#fff', orderindex: 0 }],
        } as T;
      },
    };
    const metadata = await createTaskDetailApi(requester, 'w').getList('l');
    expect(metadata.statuses.map((status) => status.name)).toEqual(['Aberto']);
    expect(metadata.members[0]).toMatchObject({ id: 5, name: 'Membro' });
    expect(metadata.customFields[0]?.id).toBe('f');
    expect(calls.sort()).toEqual(['/list/l', '/list/l/field', '/list/l/member']);
  });
  it('lê comentários, respostas e métricas sem inventar paginação em replies', async () => {
    const calls: Array<[string, ScheduledRequestOptions | undefined]> = [];
    const requester: Requester = {
      get: async <T>(path: string, options?: ScheduledRequestOptions) => {
        calls.push([path, options]);
        if (path.endsWith('time_in_status'))
          return {
            current_status: { status: 'Doing', total_time: { by_minute: 0, since: '100' } },
            status_history: [],
          } as T;
        return { comments: [{ id: '99999999999999999', date: '100' }] } as T;
      },
    };
    const api = createTaskDetailApi(requester, 'w');
    const cursor = { start: '100', start_id: '12345678901234567890' };
    expect((await api.getComments('t', cursor)).comments[0]?.id).toBe('99999999999999999');
    expect(calls[0]?.[1]?.query).toEqual(cursor);
    await api.getReplies('12345678901234567890');
    expect(calls[1]).toEqual([
      '/comment/12345678901234567890/reply',
      { priority: 'interactive', invalidateSessionOnUnauthorized: false },
    ]);
    expect(await api.getTimeInStatus('t')).toEqual([
      { name: 'Doing', color: '', minutes: 0, since: 100, current: true },
    ]);
  });
});
