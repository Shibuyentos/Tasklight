// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSecretFiles } from './scan-secrets.mjs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'scan-secrets-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<html></html>');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('findSecretFiles', () => {
  it('acha token no formato do ClickUp em subpastas', () => {
    writeFileSync(join(dir, 'assets', 'app.js'), 'const t = "pk_123_ABCDEFGHIJKLMNOPQRSTUV";');

    expect(findSecretFiles(dir)).toEqual(['assets/app.js']);
  });

  it('acha valores extras informados', () => {
    writeFileSync(join(dir, 'assets', 'app.js'), 'const s = "valor-secreto-local";');

    expect(findSecretFiles(dir, ['valor-secreto-local'])).toEqual(['assets/app.js']);
  });

  it('não acusa arquivos limpos', () => {
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1);');

    expect(findSecretFiles(dir)).toEqual([]);
  });

  it('ignora valores extras vazios, que casariam com qualquer arquivo', () => {
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1);');

    expect(findSecretFiles(dir, [''])).toEqual([]);
  });
});
