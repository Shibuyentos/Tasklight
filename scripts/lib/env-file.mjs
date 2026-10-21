/**
 * Lê o valor de uma chave em um texto no formato `.env`.
 * Aceita aspas simples ou duplas em volta do valor e ignora linhas comentadas.
 * @param {string} text
 * @param {string} key
 * @returns {string | null}
 */
export function readEnvValue(text, key) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1 || line.slice(0, separator).trim() !== key) continue;
    const value = line.slice(separator + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")));
    return quoted ? value.slice(1, -1) : value;
  }
  return null;
}

/**
 * Grava `key=value` em um texto `.env`: troca a linha existente ou acrescenta no fim.
 * @param {string} text
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
export function upsertEnvValue(text, key, value) {
  const lines = text === '' ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/);
  let replaced = false;
  const updated = lines.map((line) => {
    const separator = line.indexOf('=');
    const isKeyLine =
      !line.trim().startsWith('#') && separator !== -1 && line.slice(0, separator).trim() === key;
    if (!isKeyLine) return line;
    replaced = true;
    return `${key}=${value}`;
  });
  if (!replaced) updated.push(`${key}=${value}`);
  return `${updated.join('\n')}\n`;
}
