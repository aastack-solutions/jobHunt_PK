import { CURRENCY_SYMBOLS } from '../constants/currencies';

// Compact salary range formatter, e.g. "$120k–$160k" or "₨200k–₨350k".
export function formatSalary(min, max, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || '';
  const compact = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  if (!min && !max) return 'Not disclosed';
  if (min && max) return `${symbol}${compact(min)}–${symbol}${compact(max)}`;
  return `${symbol}${compact(min || max)}`;
}

export function truncate(text, max = 60) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
