// Falha o build se dist/ contiver um token do ClickUp ou o valor de CLICKUP_API_KEY do .env.local.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readEnvValue } from './lib/env-file.mjs';
import { findSecretFiles } from './lib/scan-secrets.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const dist = resolve(projectRoot, 'dist');
const envLocal = resolve(projectRoot, '.env.local');

if (!existsSync(dist)) {
  console.error('dist/ não encontrado: rode o build antes desta verificação.');
  process.exit(1);
}

/** @type {string[]} */
const extraValues = [];
if (existsSync(envLocal)) {
  const localToken = readEnvValue(readFileSync(envLocal, 'utf8'), 'CLICKUP_API_KEY');
  if (localToken) extraValues.push(localToken);
}

const found = findSecretFiles(dist, extraValues);
if (found.length > 0) {
  console.error('Segredos encontrados em dist/:');
  for (const file of found) console.error(`  - ${file}`);
  process.exit(1);
}

console.log('dist/ sem segredos');
