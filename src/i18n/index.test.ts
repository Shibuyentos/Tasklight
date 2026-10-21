// @vitest-environment node
import { expect, it } from 'vitest';
import { t } from './index';

it('traduz pela chave', () => {
  expect(t('app.name')).toBe('Tasklight');
});
