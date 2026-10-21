import { describe, expect, it } from 'vitest';
import { customFieldBody, fieldAppliesTo, normalizeCustomField } from './custom-fields';

describe('campos personalizados', () => {
  it('não transforma restrição de tipo malformada em campo global', () => {
    const field = normalizeCustomField({
      type: 'number',
      applied_objects: [{ object_type: 19, object_id: null }],
    });
    expect(fieldAppliesTo(field, 0)).toBe(false);
  });
  it('preserva zero/false e mantém tipos desconhecidos somente leitura', () => {
    expect(normalizeCustomField({ id: 'n', type: 'number', value: 0 }).value).toBe(0);
    expect(normalizeCustomField({ id: 'c', type: 'checkbox', value: false })).toMatchObject({
      value: false,
      editable: false,
    });
    expect(normalizeCustomField({ id: 'x', type: 'future', value: { opaque: 1 } })).toMatchObject({
      value: { opaque: 1 },
      editable: false,
    });
  });
  it('resolve índice dropdown pela orderindex, escreve UUID e restringe por tipo', () => {
    const field = normalizeCustomField({
      id: 'd',
      type: 'drop_down',
      value: 7,
      type_config: { options: [{ id: 'uuid', name: 'Opção', orderindex: '7' }] },
      applied_objects: [{ object_type: 19, object_id: 3 }],
    });
    expect(field.displayValue).toBe('Opção');
    expect(customFieldBody(field, 'uuid')).toEqual({ value: 'uuid' });
    expect(() => customFieldBody(field, '7')).toThrow();
    expect(fieldAppliesTo(field, 3)).toBe(true);
    expect(fieldAppliesTo(field, 0)).toBe(false);
    expect(fieldAppliesTo(normalizeCustomField({}), 0)).toBe(true);
  });
  it('escreve labels, users, date, number e URL com validação', () => {
    const field = (type: string) =>
      normalizeCustomField({ type, type_config: { options: [{ id: 'a', label: 'A' }] } });
    expect(customFieldBody(field('labels'), ['a'])).toEqual({ value: ['a'] });
    expect(customFieldBody(field('users'), { add: [3], rem: [2] })).toEqual({
      value: { add: [3], rem: [2] },
    });
    expect(customFieldBody(field('date'), { timestamp: 0, time: false })).toEqual({
      value: 0,
      value_options: { time: false },
    });
    expect(customFieldBody(field('number'), 0)).toEqual({ value: 0 });
    expect(customFieldBody(field('url'), 'https://example.test')).toEqual({
      value: 'https://example.test',
    });
    expect(() => customFieldBody(field('url'), 'javascript:alert(1)')).toThrow();
    expect(() => customFieldBody(field('future'), 'x')).toThrow();
  });
});
