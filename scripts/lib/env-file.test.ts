// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readEnvValue, upsertEnvValue } from './env-file.mjs';

describe('readEnvValue', () => {
  it.each([['KEY=valor'], ['KEY = "valor"'], ["KEY='valor'"]])('lê %s', (line) => {
    expect(readEnvValue(`A=1\n${line}\nB=2`, 'KEY')).toBe('valor');
  });

  it('ignora linhas comentadas', () => {
    expect(readEnvValue('# KEY=antigo\nKEY=atual', 'KEY')).toBe('atual');
  });

  it('aceita quebras de linha do Windows', () => {
    expect(readEnvValue('A=1\r\nKEY=valor\r\n', 'KEY')).toBe('valor');
  });

  it('devolve null quando a chave não existe', () => {
    expect(readEnvValue('A=1', 'KEY')).toBeNull();
  });
});

describe('upsertEnvValue', () => {
  it('troca só a linha da chave e preserva as outras', () => {
    expect(upsertEnvValue('A=1\nKEY=antigo\nB=2\n', 'KEY', 'novo')).toBe('A=1\nKEY=novo\nB=2\n');
  });

  it('acrescenta a chave quando ela não existe', () => {
    expect(upsertEnvValue('A=1\n', 'KEY', 'novo')).toBe('A=1\nKEY=novo\n');
  });

  it('cria o conteúdo a partir de texto vazio', () => {
    expect(upsertEnvValue('', 'KEY', 'novo')).toBe('KEY=novo\n');
  });
});
