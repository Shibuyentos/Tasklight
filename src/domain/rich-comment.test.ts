import { describe, expect, it } from 'vitest';
import { commentBody, mergeComments, normalizeComment, normalizeCommentPage } from './rich-comment';

describe('comentários ricos', () => {
  it('preserva tag incompleta e segmento desconhecido mesmo quando possuem texto', () => {
    expect(
      normalizeComment({
        comment: [
          { type: 'tag', text: '@Pessoa' },
          { type: 'image', text: 'Anexo', source: 'opaque' },
        ],
      }).segments,
    ).toEqual([
      { kind: 'unknown', raw: { type: 'tag', text: '@Pessoa' }, text: '@Pessoa' },
      { kind: 'unknown', raw: { type: 'image', text: 'Anexo', source: 'opaque' }, text: 'Anexo' },
    ]);
  });
  it('mescla páginas com IDs sobrepostos sem duplicar comentários', () => {
    expect(
      mergeComments(
        [normalizeComment({ id: 'a', comment_text: 'Original' })],
        [normalizeComment({ id: 'a', comment_text: 'Atualizado' }), normalizeComment({ id: 'b' })],
      ).map(({ id, text }) => ({ id, text })),
    ).toEqual([
      { id: 'a', text: 'Atualizado' },
      { id: 'b', text: '' },
    ]);
  });
  it('preserva texto formatado, menção e segmentos desconhecidos sem HTML', () => {
    const value = normalizeComment({
      id: '90071992547409930',
      date: '123',
      reply_count: '2',
      comment: [
        { text: 'Oi', attributes: { bold: true, link: 'javascript:alert(1)' } },
        { type: 'tag', user: { id: 5, username: 'Pessoa' } },
        { type: 'image', image: { src: 'javascript:bad' } },
      ],
      user: null,
    });
    expect(value).toMatchObject({
      id: '90071992547409930',
      date: 123,
      replyCount: 2,
      author: null,
    });
    expect(value.segments[0]).toEqual({ kind: 'text', text: 'Oi', attributes: { bold: true } });
    expect(value.segments[1]).toMatchObject({ kind: 'mention', user: { id: 5, name: 'Pessoa' } });
    expect(value.segments[2]).toMatchObject({ kind: 'unknown', raw: { type: 'image' } });
  });
  it('pagina por data e id, deduplica e interrompe cursor repetido ou ausente', () => {
    const comments = Array.from({ length: 25 }, (_, index) => ({ id: String(index), date: '100' }));
    const page = normalizeCommentPage({ comments: [...comments, comments[0]] });
    expect(page.comments).toHaveLength(25);
    expect(page.nextCursor).toEqual({ start: '100', start_id: '24' });
    expect(
      normalizeCommentPage({ comments }, { start: '100', start_id: '24' }).nextCursor,
    ).toBeNull();
    expect(normalizeCommentPage({ comments: [{ id: 'x' }] }).nextCursor).toBeNull();
  });
  it('mantém paginação quando a página cheia contém um ID repetido', () => {
    const comments = Array.from({ length: 25 }, (_, index) => ({
      id: String(index === 0 ? 1 : index),
      date: '100',
    }));
    const page = normalizeCommentPage({ comments });
    expect(page.comments).toHaveLength(24);
    expect(page.nextCursor).toEqual({ start: '100', start_id: '24' });
  });
  it('adapta rich draft e rejeita URL perigosa sem converter menção em texto', () => {
    expect(
      commentBody({
        segments: [
          { text: 'Oi', attributes: { bold: true } },
          { type: 'tag', user: { id: 4 } },
        ],
      }),
    ).toEqual({
      comment: [
        { text: 'Oi', attributes: { bold: true } },
        { type: 'tag', user: { id: 4 } },
      ],
      notify_all: false,
    });
    expect(() =>
      commentBody({ segments: [{ text: 'x', attributes: { link: 'data:text/html,x' } }] }),
    ).toThrow();
  });
});
