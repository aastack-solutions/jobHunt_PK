// jobs/exchangeRateFetch.js — runExchangeRateFetch(): fetch the day's PKR/USD
// rate and cache it in Redis ahead of the daily job fetch. Runs 04:45 UTC with
// retries so the rate is ready before matching at 05:00.
const axios = require('axios');
const redisClient = require('../src/redis');
const logger = require('../src/logger');
const prisma = require('../src/db');
const { RATE_KEY, MAX_AGE_MS } = require('../src/services/currencyService');

async function runExchangeRateFetch() {
  try {
    // Free, no-key source. rates.PKR = PKR per 1 USD.
    const { data } = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 10000 });
    const rate = data?.rates?.PKR;
    if (typeof rate !== 'number' || rate <= 0) throw new Error('PKR rate missing/invalid in response');

    await redisClient.set(RATE_KEY, JSON.stringify({ rate, fetchedAt: Date.now() }), {
      PX: MAX_AGE_MS,
    });
    await prisma.schedulerLog.create({
      data: { jobName: 'exchange-rate-fetch', status: 'completed', jobCount: 1 },
    });
    logger.info(`exchange-rate-fetch: 1 USD = ${rate} PKR (cached)`);
    return { rate };
  } catch (err) {
    logger.error(`exchange-rate-fetch failed: ${err.message}`);
    await prisma.schedulerLog
      .create({ data: { jobName: 'exchange-rate-fetch', status: 'failed', error: err.message } })
      .catch(() => {});
    throw err;
  }
}

module.exports = { runExchangeRateFetch };
