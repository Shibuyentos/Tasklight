import { array, normalizeUser, numeric, object, safeUrl, type TaskUser, text } from './task-detail';

export interface CommentAttributes {
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
  list?: { list: string };
  indent?: number;
  'code-block'?: { 'code-block': string };
}
export type WriteCommentSegment =
  | { text: string; attributes?: CommentAttributes }
  | { type: 'tag'; user: { id: number } };
export type CommentSegment =
  | { kind: 'text'; text: string; attributes: CommentAttributes }
  | { kind: 'mention'; user: TaskUser }
  | { kind: 'unknown'; raw: unknown; text: string };
export interface CommentDraft {
  segments: WriteCommentSegment[];
  notifyAll?: boolean;
  assigneeId?: number;
}
export interface TaskComment {
  id: string;
  date: number | null;
  text: string;
  segments: CommentSegment[];
  author: TaskUser | null;
  resolved: boolean;
  assignee: TaskUser | null;
  assignedBy: TaskUser | null;
  reactions: unknown[];
  replyCount: number;
}
export interface CommentCursor {
  start: string;
  start_id: string;
}
export interface CommentPage {
  comments: TaskComment[];
  nextCursor: CommentCursor | null;
}
export interface CreatedComment {
  id: string;
  histId: string | null;
  date: number | null;
}
function attributes(value: unknown): CommentAttributes {
  const dto = object(value);
  const result: CommentAttributes = {};
  for (const key of ['bold', 'italic', 'code'] as const)
    if (typeof dto[key] === 'boolean') result[key] = dto[key];
  const link = safeUrl(dto.link);
  if (link) result.link = link;
  if (typeof object(dto.list).list === 'string')
    result.list = { list: text(object(dto.list).list) };
  if (typeof dto.indent === 'number' && Number.isFinite(dto.indent)) result.indent = dto.indent;
  if (typeof object(dto['code-block'])['code-block'] === 'string')
    result['code-block'] = { 'code-block': text(object(dto['code-block'])['code-block']) };
  return result;
}
export function normalizeComment(value: unknown): TaskComment {
  const dto = object(value);
  const segments: CommentSegment[] = array(dto.comment).map((value) => {
    const segment = object(value);
    if (segment.type === 'tag') {
      const user = normalizeUser(segment.user);
      if (user) return { kind: 'mention', user };
    }
    if ((segment.type === undefined || segment.type === 'text') && typeof segment.text === 'string')
      return { kind: 'text', text: segment.text, attributes: attributes(segment.attributes) };
    return { kind: 'unknown', raw: value, text: text(segment.text) };
  });
  return {
    id: text(dto.id),
    date: numeric(dto.date),
    text: text(dto.comment_text),
    segments,
    author: normalizeUser(dto.user),
    resolved: dto.resolved === true,
    assignee: normalizeUser(dto.assignee),
    assignedBy: normalizeUser(dto.assigned_by),
    reactions: array(dto.reactions),
    replyCount: numeric(dto.reply_count) ?? 0,
  };
}
/** Mantém a ordem da primeira ocorrência e atualiza conteúdo recebido novamente. */
export function mergeComments(existing: TaskComment[], incoming: TaskComment[]): TaskComment[] {
  const byId = new Map(existing.map((comment) => [comment.id, comment]));
  for (const comment of incoming) if (comment.id) byId.set(comment.id, comment);
  return [...byId.values()];
}
export function normalizeCommentPage(value: unknown, previous?: CommentCursor): CommentPage {
  const seen = new Set<string>();
  const rawComments = array(object(value).comments);
  const comments = rawComments.map(normalizeComment).filter((comment) => {
    if (!comment.id || seen.has(comment.id)) return false;
    seen.add(comment.id);
    return true;
  });
  const last = comments.at(-1);
  const next =
    rawComments.length >= 25 && last?.date !== null && last?.date !== undefined
      ? { start: String(last.date), start_id: last.id }
      : null;
  return {
    comments,
    nextCursor:
      next && !(next.start === previous?.start && next.start_id === previous.start_id)
        ? next
        : null,
  };
}
export function commentBody(draft: CommentDraft): {
  comment: WriteCommentSegment[];
  notify_all: boolean;
  assignee?: number;
} {
  if (!draft.segments.length) throw new Error('Comentário vazio');
  const comment = draft.segments.map((segment): WriteCommentSegment => {
    if ('type' in segment) {
      if (!Number.isSafeInteger(segment.user.id) || segment.user.id <= 0)
        throw new Error('Menção inválida');
      return { type: 'tag', user: { id: segment.user.id } };
    }
    if (segment.attributes?.link && !safeUrl(segment.attributes.link))
      throw new Error('Link inválido');
    return segment.attributes
      ? { text: segment.text, attributes: attributes(segment.attributes) }
      : { text: segment.text };
  });
  return {
    comment,
    notify_all: draft.notifyAll ?? false,
    ...(draft.assigneeId === undefined ? {} : { assignee: draft.assigneeId }),
  };
}
