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

// Short "posted ago" label, e.g. "5h ago" / "3d ago". null when date unknown.
export function postedAgo(date) {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// True when the date is within the last `hours` (default 24h) — drives the "New" badge.
export function isFresh(date, hours = 24) {
  if (!date) return false;
  const ms = Date.now() - new Date(date).getTime();
  return !Number.isNaN(ms) && ms >= 0 && ms <= hours * 3_600_000;
}
