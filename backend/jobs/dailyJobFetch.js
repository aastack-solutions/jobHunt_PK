// jobs/dailyJobFetch.js — runDailyJobFetch(): fetch every source, normalize,
// batch-insert new listings, and record a SchedulerLog. Matching for each user
// is wired in Week 4 (this week only populates + tags the jobs table).
const prisma = require('../src/db');
const logger = require('../src/logger');
const { fetchAllJobs } = require('../src/services/jobFetcher');
const { matchNewJobs } = require('../src/services/matchingEngine');

async function runDailyJobFetch() {
  const started = Date.now();
  try {
    const { jobs, sourceBreakdown } = await fetchAllJobs();

    // In-batch dedupe by contentHash so a single createMany never carries two
    // identical fingerprints (the DB constraint also guards cross-run dupes).
    const seen = new Set();
    const deduped = [];
    for (const j of jobs) {
      if (j.contentHash && seen.has(j.contentHash)) continue;
      if (j.contentHash) seen.add(j.contentHash);
      deduped.push(j);
    }

    // Batch insert only — never loop create(). skipDuplicates uses ON CONFLICT
    // DO NOTHING, covering both unique constraints (platform+externalId, contentHash).
    const { count } = await prisma.job.createMany({ data: deduped, skipDuplicates: true });

    // Score the newly inserted jobs for every user (delta match).
    const matched = await matchNewJobs();

    await prisma.schedulerLog.create({
      data: {
        jobName: 'daily-job-fetch',
        status: 'completed',
        jobCount: count,
        sourceBreakdown,
      },
    });

    logger.info(
      `daily-job-fetch: inserted ${count} new / ${deduped.length} unique / ${jobs.length} fetched, ${matched.created} matches in ${Date.now() - started}ms`
    );
    return {
      inserted: count,
      unique: deduped.length,
      fetched: jobs.length,
      sourceBreakdown,
      matches: matched.created,
    };
  } catch (err) {
    logger.error(`daily-job-fetch failed: ${err.message}`);
    await prisma.schedulerLog
      .create({ data: { jobName: 'daily-job-fetch', status: 'failed', error: err.message } })
      .catch(() => {});
    throw err;
  }
}

module.exports = { runDailyJobFetch };
