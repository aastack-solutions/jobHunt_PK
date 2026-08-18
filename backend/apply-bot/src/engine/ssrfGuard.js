// SSRF guard for the apply-bot's browser sessions.
//
// Why this exists: applyUrl comes from the Job table, which is populated by ~13
// external fetch sources (some scraped, some third-party APIs) — it is NOT trusted
// input. Playwright's page.goto() makes a real network request from inside our
// infrastructure to whatever URL it's given, with no validation of its own. A
// malicious or compromised source could publish a job with applyUrl pointing at a
// private/internal address (e.g. Railway's internal network, a cloud metadata
// endpoint like 169.254.169.254) and the browser would happily fetch it.
//
// Why this can't be an off-the-shelf npm SSRF filter: packages like
// ssrf-req-filter/request-filtering-agent wrap Node's http.Agent — they protect
// axios/fetch calls, but Playwright's browser does NOT route through Node's HTTP
// stack at all, so those packages give zero protection for page.goto() or any
// in-page navigation/fetch/redirect. This has to intercept at the browser's own
// network layer via context.route(), which is why it's hand-rolled here rather than
// a dependency.
//
// Coverage: context.route('**/*', ...) fires for every request the page makes —
// the initial navigation AND any subsequent redirect, fetch, or resource load
// triggered by the page's own JS. That also mitigates (though does not perfectly
// eliminate — see the DNS-rebinding note below) the "legitimate initial hostname,
// malicious redirect target" class of SSRF, since every hop gets re-checked.
const dns = require('dns').promises;
const net = require('net');
const logger = require('../logger');

// IPv4 ranges to block: RFC1918 private, loopback, link-local (includes the
// 169.254.169.254 cloud metadata address used by AWS/GCP/Azure/Railway-adjacent
// platforms), CGNAT, "this network", benchmarking/test-net, multicast, reserved.
const IPV4_BLOCKED_RANGES = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isBlockedIPv4(ip) {
  const target = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGES.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (target & mask) === (ipv4ToInt(base) & mask);
  });
}

// IPv6: loopback (::1), unique-local (fc00::/7), link-local (fe80::/10), and
// IPv4-mapped addresses (::ffff:a.b.c.d) — unwrapped and re-checked as IPv4, since
// naive string-prefix IPv6 checks are exactly the bypass class seen in real
// advisories (IPv4-mapped-IPv6 normalization slipping past a filter that only
// checked the IPv6 literal form).
function isBlockedIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true; // unrecognized shape — fail closed, not open
}

// Resolves the hostname RIGHT NOW (not cached) and checks the resulting address.
// Re-resolving per-request (context.route fires on every navigation/redirect/fetch)
// is what limits — not eliminates — classic DNS-rebinding: a request is judged safe
// at the moment it's actually about to fire, not once at task-creation time. A
// sufficiently fast rebind between this check and Chromium's own connect is a
// residual risk this can't fully close from application code alone; it is not a
// substitute for network-level egress controls if those become available later.
async function isSafeUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  // A literal IP in the URL — check directly, no DNS lookup needed.
  if (net.isIP(url.hostname)) {
    return !isBlockedIp(url.hostname);
  }

  try {
    // A bare dns.lookup() has no timeout of its own — a hanging resolver would
    // otherwise stall this route handler (and everything waiting on the request it's
    // guarding) until the outer TASK_DEADLINE_MS eventually kills the whole task.
    // Fail fast here instead: 3s is generous for a real DNS lookup.
    const lookupPromise = dns.lookup(url.hostname, { all: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DNS lookup timed out')), 3000)
    );
    const addresses = await Promise.race([lookupPromise, timeoutPromise]);
    return addresses.every((a) => !isBlockedIp(a.address));
  } catch (err) {
    logger.warn(`ssrfGuard: DNS lookup failed for ${url.hostname} — ${err.message}`);
    return false; // can't resolve → can't verify → block
  }
}

// Installs the guard on a Playwright BrowserContext. Call once per session, right
// after context creation, before any navigation.
async function installSsrfGuard(context) {
  await context.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    const safe = await isSafeUrl(requestUrl).catch(() => false);
    if (!safe) {
      logger.warn(`ssrfGuard: blocked request to ${requestUrl}`);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}

module.exports = { installSsrfGuard, isSafeUrl, isBlockedIp };
