// resolveAdapter(applyUrl) — hostname match, first match wins. genericAdapter is
// deliberately LAST and matches() everything, so it only ever catches what the
// three ATS adapters don't.
//
// Note the separation of concerns: this resolver is a pure function of the URL —
// it does NOT know about APPLY_BOT_GENERIC_ENABLED. That gate lives at the
// selection layer (backend/jobs/applyBotSelect.js), which never creates a task for
// platform "generic" unless the flag is set — so even though genericAdapter is
// registered here (F8 is scaffolded, not gone), it's never actually invoked by the
// worker in production until F8 is implemented and the flag is turned on.
const greenhouseAdapter = require('./greenhouseAdapter');
const leverAdapter = require('./leverAdapter');
const ashbyAdapter = require('./ashbyAdapter');
const genericAdapter = require('./genericAdapter');

const ADAPTERS = [greenhouseAdapter, leverAdapter, ashbyAdapter, genericAdapter];

function resolveAdapter(applyUrl) {
  return ADAPTERS.find((adapter) => adapter.matches(applyUrl)) || null;
}

module.exports = { resolveAdapter, ADAPTERS };
