import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const CLICKUP_TOKEN = /pk_\d+_[A-Z0-9]{16,}/;
// Valores muito curtos casariam com qualquer arquivo e gerariam falsos positivos.
const MIN_EXTRA_LENGTH = 8;

/**
 * Procura, recursivamente, arquivos que contenham um token do ClickUp ou um dos valores extras.
 * @param {string} dir
 * @param {string[]} [extraValues]
 * @returns {string[]} caminhos relativos a `dir`, com `/`, em ordem alfabética
 */
export function findSecretFiles(dir, extraValues = []) {
  const needles = extraValues.filter((value) => value.length >= MIN_EXTRA_LENGTH);
  /** @type {string[]} */
  const found = [];

  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        const content = readFileSync(path, 'latin1');
        if (CLICKUP_TOKEN.test(content) || needles.some((needle) => content.includes(needle))) {
          found.push(relative(dir, path).split(sep).join('/'));
        }
      }
    }
  };

  walk(dir);
  return found.sort();
}
