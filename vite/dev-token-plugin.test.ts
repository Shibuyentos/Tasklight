// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { devTokenPlugin } from './dev-token-plugin';

type Hook = (...args: unknown[]) => unknown;

function loadVirtualModule(
  command: 'serve' | 'build',
  mode: string,
  env: Record<string, string>,
): unknown {
  const plugin = devTokenPlugin({ readEnv: () => env });
  (plugin.configResolved as Hook)({ command, mode, root: '/projeto' });
  const resolvedId = (plugin.resolveId as Hook)('virtual:tasklight/dev-token');
  return (plugin.load as Hook)(resolvedId);
}

describe('devTokenPlugin', () => {
  const env = { CLICKUP_API_KEY: 'pk_1_TEST' };

  it('no build nunca expõe o token', () => {
    expect(loadVirtualModule('build', 'production', env)).toBe('export default null;');
  });

  it('no vite dev expõe o token do .env.local', () => {
    expect(loadVirtualModule('serve', 'development', env)).toBe('export default "pk_1_TEST";');
  });

  it('nos testes não expõe o token', () => {
    expect(loadVirtualModule('serve', 'test', env)).toBe('export default null;');
  });

  it('no vite dev sem a variável exporta null', () => {
    expect(loadVirtualModule('serve', 'development', {})).toBe('export default null;');
  });

  it('não interfere em outros módulos', () => {
    const plugin = devTokenPlugin({ readEnv: () => env });
    expect((plugin.resolveId as Hook)('outro-modulo')).toBeUndefined();
    expect((plugin.load as Hook)('outro-modulo')).toBeUndefined();
  });
});
