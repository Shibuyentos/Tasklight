import { array, numeric, object, safeUrl, text } from './task-detail';

export interface CustomFieldOption {
  id: string;
  name: string;
  color: string | null;
  orderindex: number | null;
}
export interface CustomField {
  id: string;
  name: string;
  type: string;
  typeConfig: Record<string, unknown>;
  options: CustomFieldOption[];
  appliedTaskTypeIds: number[] | null;
  value: unknown;
  displayValue: string;
  editable: boolean;
  required: boolean;
}
export type CustomFieldInput =
  | string
  | number
  | string[]
  | { add: number[]; rem: number[] }
  | { timestamp: number; time: boolean };
export interface CustomFieldBody {
  value: string | number | string[] | { add: number[]; rem: number[] };
  value_options?: { time: boolean };
}
const EDITABLE = new Set(['drop_down', 'labels', 'users', 'date', 'number', 'url']);
export function normalizeCustomField(value: unknown): CustomField {
  const dto = object(value);
  const config = object(dto.type_config);
  const type = text(dto.type);
  const options = array(config.options).map((value) => {
    const option = object(value);
    return {
      id: text(option.id),
      name: text(option.name ?? option.label),
      color: typeof option.color === 'string' ? option.color : null,
      orderindex: numeric(option.orderindex),
    };
  });
  const restrictedTypes = array(dto.applied_objects)
    .map(object)
    .filter((item) => item.object_type === 19);
  const applied = restrictedTypes.length
    ? restrictedTypes
        .map((item) => numeric(item.object_id))
        .filter((id): id is number => id !== null && Number.isSafeInteger(id) && id >= 0)
    : null;
  let displayValue =
    dto.value == null ? '' : typeof dto.value === 'object' ? '' : String(dto.value);
  if (type === 'drop_down')
    displayValue =
      options.find(
        (option) =>
          option.id === dto.value ||
          (option.orderindex !== null && option.orderindex === numeric(dto.value)),
      )?.name ?? displayValue;
  if (type === 'labels')
    displayValue = array(dto.value)
      .map((id) => options.find((option) => option.id === id)?.name ?? text(id))
      .join(', ');
  return {
    id: text(dto.id),
    name: text(dto.name),
    type,
    typeConfig: config,
    options,
    appliedTaskTypeIds: applied,
    value: dto.value ?? null,
    displayValue,
    editable: EDITABLE.has(type),
    required: dto.required === true,
  };
}
export function fieldAppliesTo(field: CustomField, customItemId: number): boolean {
  return field.appliedTaskTypeIds === null || field.appliedTaskTypeIds.includes(customItemId);
}
export function customFieldBody(field: CustomField, value: CustomFieldInput): CustomFieldBody {
  const invalid = () => {
    throw new Error('Valor de campo inválido');
  };
  if (!field.editable) return invalid();
  switch (field.type) {
    case 'drop_down':
      return typeof value === 'string' && field.options.some((option) => option.id === value)
        ? { value }
        : invalid();
    case 'labels':
      return Array.isArray(value) &&
        value.every((id) => field.options.some((option) => option.id === id))
        ? { value: [...new Set(value)] }
        : invalid();
    case 'users': {
      const input = object(value);
      const validIds = (ids: unknown): ids is number[] =>
        Array.isArray(ids) &&
        ids.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0);
      return validIds(input.add) && validIds(input.rem)
        ? { value: { add: input.add, rem: input.rem } }
        : invalid();
    }
    case 'date': {
      const input = object(value);
      return typeof input.timestamp === 'number' &&
        Number.isFinite(input.timestamp) &&
        typeof input.time === 'boolean'
        ? { value: input.timestamp, value_options: { time: input.time } }
        : invalid();
    }
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? { value } : invalid();
    case 'url':
      return typeof value === 'string' && safeUrl(value) ? { value } : invalid();
    default:
      return invalid();
  }
}
