import { normalizeCustomField } from '../domain/custom-fields';
import { type CommentCursor, normalizeComment, normalizeCommentPage } from '../domain/rich-comment';
import {
  array,
  type ListChoice,
  type ListMetadata,
  normalizeBreadcrumb,
  normalizeDetail,
  normalizeStatus,
  normalizeUsers,
  numeric,
  object,
  type StatusDuration,
  type TaskTag,
  text,
} from '../domain/task-detail';
import { createListCatalog } from './lists';
import type { Requester, ScheduledRequestOptions } from './scheduler';
import { createTaskActions } from './task-actions';

export function createTaskDetailApi(requester: Requester, workspaceId: string) {
  const options: ScheduledRequestOptions = {
    priority: 'interactive',
    invalidateSessionOnUnauthorized: false,
  };
  const catalog = createListCatalog(requester, workspaceId);
  const getTask = async (id: string) => {
    const detail = normalizeDetail(
      await requester.get<unknown>(`/task/${encodeURIComponent(id)}`, {
        ...options,
        query: { include_markdown_description: true, include_subtasks: true },
      }),
    );
    const { space, folder, list } = detail.breadcrumb;
    if (list)
      catalog.seed([
        {
          id: list.id,
          name: list.name,
          spaceId: space?.id ?? detail.task.spaceId,
          spaceName: space?.name ?? '',
          folderId: folder?.id ?? null,
          folderName: folder?.name ?? null,
        },
      ]);
    return detail;
  };
  return {
    getTask,
    async getSpaceTags(spaceId: string): Promise<TaskTag[]> {
      const dto = object(
        await requester.get<unknown>(`/space/${encodeURIComponent(spaceId)}/tag`, options),
      );
      return normalizeDetail({ tags: dto.tags }).tags;
    },
    async getList(listId: string): Promise<ListMetadata> {
      const path = `/list/${encodeURIComponent(listId)}`;
      const [raw, fieldsRaw, membersRaw] = await Promise.allSettled([
        requester.get<unknown>(path, options),
        requester.get<unknown>(`${path}/field`, {
          ...options,
          query: { include_applied_objects: true },
        }),
        requester.get<unknown>(`${path}/member`, options),
      ]);
      if (raw.status === 'rejected') throw raw.reason;
      const unavailable: NonNullable<ListMetadata['unavailable']> = [];
      if (fieldsRaw.status === 'rejected') unavailable.push('customFields');
      if (membersRaw.status === 'rejected') unavailable.push('members');
      const dto = object(raw.value);
      const breadcrumb = normalizeBreadcrumb({ ...dto, list: dto });
      const metadata: ListMetadata = {
        ...(unavailable.length ? { unavailable } : {}),
        id: text(dto.id) || listId,
        name: text(dto.name),
        statuses: array(dto.statuses).map(normalizeStatus),
        customFields: array(
          object(fieldsRaw.status === 'fulfilled' ? fieldsRaw.value : undefined).fields,
        ).map(normalizeCustomField),
        members: normalizeUsers(
          object(membersRaw.status === 'fulfilled' ? membersRaw.value : undefined).members,
        ),
        breadcrumb,
        permissionLevel: dto.permission_level == null ? null : text(dto.permission_level),
      };
      catalog.seed([
        {
          id: metadata.id,
          name: metadata.name,
          spaceId: breadcrumb.space?.id ?? '',
          spaceName: breadcrumb.space?.name ?? '',
          folderId: breadcrumb.folder?.id ?? null,
          folderName: breadcrumb.folder?.name ?? null,
        },
      ]);
      return metadata;
    },
    async getComments(id: string, cursor?: CommentCursor) {
      return normalizeCommentPage(
        await requester.get<unknown>(`/task/${encodeURIComponent(id)}/comment`, {
          ...options,
          ...(cursor ? { query: { start: cursor.start, start_id: cursor.start_id } } : {}),
        }),
        cursor,
      );
    },
    async getReplies(commentId: string) {
      return array(
        object(
          await requester.get<unknown>(`/comment/${encodeURIComponent(commentId)}/reply`, options),
        ).comments,
      )
        .map(normalizeComment)
        .map((comment) => ({ ...comment, replyCount: 0 }));
    },
    async getTimeInStatus(id: string): Promise<StatusDuration[]> {
      const dto = object(
        await requester.get<unknown>(`/task/${encodeURIComponent(id)}/time_in_status`, options),
      );
      const normalize = (value: unknown, current: boolean): StatusDuration => {
        const item = object(value);
        const total = object(item.total_time);
        return {
          name: text(item.status),
          color: text(item.color),
          minutes: numeric(total.by_minute) ?? 0,
          since: numeric(total.since),
          current,
        };
      };
      return [
        ...(dto.current_status ? [normalize(dto.current_status, true)] : []),
        ...array(dto.status_history).map((value) => normalize(value, false)),
      ];
    },
    getLists: (onPage?: (lists: ListChoice[]) => void) => catalog.getLists(onPage),
    seedLists: catalog.seed,
    ...createTaskActions(requester, getTask),
  };
}
export type TaskDetailApi = ReturnType<typeof createTaskDetailApi>;
