const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** "11h", "1h 30m", "45m": estimativa e tempo rastreado como o ClickUp mostra. */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const PATTERN = /^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m?)?$/i;

/** Lê "1h 30m", "1h30", "90m", "1,5h" ou só horas ("2"); `null` quando não entende. */
export function parseDuration(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(value)) return Math.round(Number(value.replace(',', '.')) * HOUR_MS);
  const match = PATTERN.exec(value);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const hours = match[1] === undefined ? 0 : Number(match[1].replace(',', '.'));
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  return Math.round(hours * HOUR_MS + minutes * MINUTE_MS);
}
