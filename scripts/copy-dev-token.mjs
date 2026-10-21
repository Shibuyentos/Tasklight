// Copia CLICKUP_API_KEY de outro arquivo .env para o .env.local deste projeto, sem exibir o valor.
// Uso: npm run dev:token -- [caminho/do/.env]   (padrão: ../descClickUp/.env)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readEnvValue, upsertEnvValue } from './lib/env-file.mjs';

const KEY = 'CLICKUP_API_KEY';
const projectRoot = resolve(import.meta.dirname, '..');
const source = resolve(process.argv[2] ?? resolve(projectRoot, '../descClickUp/.env'));
const target = resolve(projectRoot, '.env.local');

if (!existsSync(source)) {
  console.error(`Arquivo de origem não encontrado: ${source}`);
  process.exit(1);
}

const token = readEnvValue(readFileSync(source, 'utf8'), KEY);
if (!token) {
  console.error(`${KEY} não encontrado em ${source}`);
  process.exit(1);
}

const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
writeFileSync(target, upsertEnvValue(current, KEY, token));
console.log(`Token copiado (${token.length} caracteres) para .env.local`);
