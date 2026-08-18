// Which ATS platform an applyUrl belongs to. Kept intentionally tiny and duplicated
// (in spirit) by backend/apply-bot/src/adapters/index.js on the other side of the
// service boundary — this copy is only used here to decide whether a stored
// ApplyCredential is required before a task can be created (see applyBotSelect.js).
const PLATFORM_HOSTS = [
  { platform: 'greenhouse', test: (h) => h.includes('greenhouse.io') },
  { platform: 'lever', test: (h) => h.includes('lever.co') },
  { platform: 'ashby', test: (h) => h.includes('ashbyhq.com') },
];

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
  return match ? match.platform : 'generic';
}

function requiresCredential(platform) {
  return LOGIN_REQUIRED_PLATFORMS.has(platform);
}

module.exports = { resolvePlatform, requiresCredential };
