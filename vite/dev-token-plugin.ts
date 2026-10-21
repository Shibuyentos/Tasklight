import { loadEnv, type Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:tasklight/dev-token';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export interface DevTokenPluginOptions {
  readEnv?: (mode: string, root: string) => Record<string, string>;
}

/**
 * Expõe `CLICKUP_API_KEY` do `.env.local` ao app somente no `vite dev`.
 * No build e nos testes o módulo virtual exporta `null`, então o token nunca chega ao `dist/`.
 */
export function devTokenPlugin(options: DevTokenPluginOptions = {}): Plugin {
  const readEnv = options.readEnv ?? ((mode: string, root: string) => loadEnv(mode, root, ''));
  let token: string | null = null;

  return {
    name: 'tasklight-dev-token',
    enforce: 'pre',
    configResolved(config) {
      const exposes = config.command === 'serve' && config.mode !== 'test';
      token = exposes ? readEnv(config.mode, config.root).CLICKUP_API_KEY || null : null;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_ID ? `export default ${JSON.stringify(token)};` : undefined;
    },
  };
}
