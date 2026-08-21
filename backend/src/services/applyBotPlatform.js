// Exact-or-subdomain hostname match. Found & fixed 2026-08-21 (security review):
// every platform test here used to be `h.includes('greenhouse.io')`-style, which
// a hostname like "boards.greenhouse.io.attacker.com" also satisfies (the real
// domain appears as a substring, not as the actual host). Since applyUrl comes
// from ~13 untrusted external job-fetch sources, that misclassification let a
// malicious listing get routed to the real greenhouseAdapter, which then decrypts
// and types the user's actual stored Greenhouse credential into the attacker's
// page. Exact/suffix matching closes it: only the real domain or a genuine
// subdomain of it can match. This also fixes resolveNavigationUrl() below for
// free, since it reuses PLATFORM_HOSTS's same test functions.
function isHostOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// Which ATS platform an applyUrl belongs to. Kept intentionally tiny and duplicated
// (in spirit) by backend/apply-bot/src/adapters/index.js on the other side of the
// service boundary — this copy is only used here to decide whether a stored
// ApplyCredential is required before a task can be created (see applyBotSelect.js).
const PLATFORM_HOSTS = [
  { platform: 'greenhouse', test: (h) => isHostOrSubdomain(h, 'greenhouse.io') },
  { platform: 'lever', test: (h) => isHostOrSubdomain(h, 'lever.co') },
  { platform: 'ashby', test: (h) => isHostOrSubdomain(h, 'ashbyhq.com') },
];

// Greenhouse boards are very often served on the EMPLOYER's own domain with the
// board embedded, so hostname alone cannot see them: coinbase.com, stripe.com,
// samsara.com, instacart.careers, databricks.com, careers.airbnb.com,
// jobs.dropbox.com, asana.com all turned up this way. What gives it away is
// Greenhouse's own job-id parameter, `gh_jid`, which those pages carry.
//
// Measured 2026-08-19 across the whole job table: 611 of the 1088 URLs this
// function used to call "generic" are Greenhouse boards in exactly this shape --
// 21.8% of all active jobs, pointed at a generic engine that does not exist
// instead of at the verified Greenhouse adapter. See
// docs/apply-bot/01-research-plan.md section E, Finding 1.
//
// Digits only, deliberately: this value comes from third-party job-feed data and
// is interpolated into a URL the bot then navigates to (see resolveNavigationUrl),
// so anything that isn't plainly a job id is treated as not-a-match rather than
// passed through.
function greenhouseJobId(applyUrl) {
  try {
    const value = new URL(applyUrl).searchParams.get('gh_jid');
    return value && /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

// The legacy host, on purpose -- do not "modernise" this to job-boards.greenhouse.io.
// Verified 2026-08-19 on 7 real postings: boards.greenhouse.io accepts `token` ALONE
// and redirects to the canonical job-boards.greenhouse.io URL with `for=<company>`
// filled in by Greenhouse itself, so we never have to know the employer's board
// slug. The newer host requires `for=` and served no form without it on all 7.
const GREENHOUSE_EMBED_BASE = 'https://boards.greenhouse.io/embed/job_app';

// Platforms whose adapter logs in with a stored ApplyCredential. Everything else
// (generic) is attempted as a guest/anonymous form fill — most Greenhouse/Lever/Ashby
// forms don't strictly require an account either, but per product decision the bot
// uses pre-created accounts on those three so the same identity is reused every time.
const LOGIN_REQUIRED_PLATFORMS = new Set(['greenhouse', 'lever', 'ashby']);

function resolvePlatform(applyUrl) {
  let hostname;
  try {
    hostname = new URL(applyUrl).hostname.toLowerCase();
  } catch {
    return 'generic';
  }
  const match = PLATFORM_HOSTS.find((p) => p.test(hostname));
  if (match) return match.platform;
  // Hostname said nothing -- fall back to the embedded-board signal above.
  return greenhouseJobId(applyUrl) ? 'greenhouse' : 'generic';
}

// Where the bot should actually NAVIGATE for this posting, which is not always the
// URL a human would open. For an employer-hosted Greenhouse board the human-facing
// page is a job description whose form lives in an embed; returning the embed URL
// directly is what lets the already-verified Greenhouse adapter work on it.
//
// Everything else is returned untouched -- including URLs already on a greenhouse.io
// host, which F5 verified work as-is and must not be rewritten.
//
// One thing this deliberately does NOT do is rewrite to
// `job-boards.greenhouse.io/<company>/jobs/<gh_jid>`. That looks like the obvious
// canonical form and is a trap: probed on 6 real postings, all 6 redirected straight
// back to the employer's own careers page, i.e. it silently does nothing.
function resolveNavigationUrl(applyUrl) {
  let hostname;
  try {
    hostname = new URL(applyUrl).hostname.toLowerCase();
  } catch {
    return applyUrl;
  }
  if (PLATFORM_HOSTS.some((p) => p.test(hostname))) return applyUrl;

  const jobId = greenhouseJobId(applyUrl);
  return jobId ? `${GREENHOUSE_EMBED_BASE}?token=${encodeURIComponent(jobId)}` : applyUrl;
}

function requiresCredential(platform) {
  return LOGIN_REQUIRED_PLATFORMS.has(platform);
}

module.exports = { resolvePlatform, requiresCredential, resolveNavigationUrl, greenhouseJobId };
