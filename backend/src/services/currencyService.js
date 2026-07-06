// services/currencyService.js — exchange-rate cache + toUSD().
// Never store pre-computed USD on the Job/User; convert at match time.
// Redis key 'exchange_rate:PKR_USD' = JSON { rate, fetchedAt }, refreshed daily.
const RATE_KEY = 'exchange_rate:PKR_USD';
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // stale after 48h

// Returns the amount in USD, or null if it cannot be converted (caller then
// uses the neutral salary sub-score of 70). rate = PKR per 1 USD.
async function toUSD(amount, currency, redisClient) {
  if (!amount) return null;
  if (currency === 'USD') return amount;
  const cached = await redisClient.get(RATE_KEY).catch(() => null);
  if (!cached) return null;
  let parsed;
  try { parsed = JSON.parse(cached); } catch { return null; }
  const { rate, fetchedAt } = parsed || {};
  if (!rate || Date.now() - fetchedAt > MAX_AGE_MS) return null;
  return Math.round(amount / rate);
}

module.exports = { toUSD, RATE_KEY, MAX_AGE_MS };
