/** Helpers de formato argentino (es-AR). Deterministas: no dependen del ICU ni de la zona del runtime. */

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `1234.56` -> `1.234,56` */
export function formatNumber(value: number, fractionDigits = 2): string {
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [int, dec] = fixed.split('.');
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${groupThousands(int)}${dec ? `,${dec}` : ''}`;
}

/** `1234.56` -> `$ 1.234,56` */
export function formatCurrency(value: number, fractionDigits = 2): string {
  return `$ ${formatNumber(value, fractionDigits)}`;
}

/** Score OKR 0.0–1.0: `0.7` -> `0,70` */
export function formatScore(score: number): string {
  return formatNumber(score, 2);
}

/** Proporción 0–1 a porcentaje: `0.7` -> `70 %` */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  return `${formatNumber(ratio * 100, fractionDigits)} %`;
}

type DateInput = Date | string | number;

const dateTimeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(input: DateInput) {
  const date =
    typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
      ? new Date(`${input}T12:00:00-03:00`) // fecha sin hora: evitar corrimientos de día
      : new Date(input);
  if (Number.isNaN(date.getTime())) throw new RangeError('Fecha inválida');
  const map: Record<string, string> = {};
  for (const p of dateTimeParts.formatToParts(date)) map[p.type] = p.value;
  return map;
}

/** `dd/mm/aaaa` en hora de Buenos Aires. */
export function formatDate(input: DateInput): string {
  const p = parts(input);
  return `${p.day}/${p.month}/${p.year}`;
}

/** Hora 24 h: `14:32` */
export function formatTime(input: DateInput): string {
  const p = parts(input);
  return `${p.hour}:${p.minute}`;
}

/** `dd/mm/aaaa 14:32` */
export function formatDateTime(input: DateInput): string {
  return `${formatDate(input)} ${formatTime(input)}`;
}
