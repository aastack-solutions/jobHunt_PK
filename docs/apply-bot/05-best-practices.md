# 05 — Best Practices Going Forward

Operating discipline for once this is actually running, not just built.

## Never flip shadow → live without a review batch

`APPLY_BOT_MODE` defaults to `shadow` (`applyBotSelect.js`) for exactly this reason.
Before setting it to `live` — even for a single platform — review at least ~20
`shadow_complete` tasks' `fieldsFilled` audit JSON and screenshots by hand. Confirm:
name/email/resume are correctly filled, no field got the wrong value (e.g. cover
letter text landing in a different textarea than intended), and nothing in the
"unmapped" list should have been required.

Consider flipping one adapter (e.g. Greenhouse) to live before the others, rather
than all three at once — isolates which platform's mistakes you're looking at if
something goes wrong.

## Start the daily cap low, ramp deliberately

The plan's target was ~20-30/day; `APPLY_BOT_DAILY_CAP` defaults to 25. Consider
starting real (non-shadow) usage at something like 5/day per user for the first
week, and only raising it once §03's success-rate and CAPTCHA-rate numbers look
stable. The cap is cheap to raise later and expensive to have gotten wrong at volume.

## Weekly screenshot spot-check, even after going live

Automated success/failure status doesn't catch every problem — a task can report
`submitted` after clicking a button that didn't actually work due to a client-side
validation error the adapter didn't check for. Periodically (weekly is a reasonable
cadence) spot-check a handful of `submitted` tasks' post-submit screenshot against
what a real successful submission looks like on that platform.

## Selector-drift watch

ATS vendors update their forms without notice — this is not a one-time research task
(§01-A), it's ongoing maintenance. A reasonable cadence: once a month, manually apply
to one real test posting per platform (or re-run in shadow mode against a recent
real job) and confirm the adapter still finds the fields it expects. If a platform's
failure rate (§03) spikes suddenly, treat that as an out-of-cycle trigger to check
immediately rather than waiting for the monthly review.

## Credential hygiene

`ApplyCredential` rows don't know if the underlying account's password changed
outside this system (e.g. you changed it directly on Greenhouse). A stale credential
shows up as `failureClass: 'AUTH'` in the data — when that happens, it's a
credential-refresh task, not an adapter bug. Re-verify each stored credential
periodically (logging in manually) rather than assuming "it worked once" means "it
still works."

## Kill-switch drills

The Redis `apply_bot:enabled` flag (`applyBotSelect.js`'s `isEnabled()`) is designed
to stop new task creation instantly, without a redeploy. Test this deliberately at
least once before you need it in a real emergency — flip it off mid-run and confirm
no new `ApplyTask` rows get created, then flip it back on. Don't wait for an actual
incident to discover the mechanism doesn't work the way it's documented.

## Legal/ToS re-check cadence

Terms of service change. The one-time review from §01-C should be revisited
periodically (a light annual pass is reasonable, more often for platforms you rely
on heavily) rather than treated as permanently settled.

## Cost monitoring against the original estimates

The approved plan's §7 laid out rough hosting cost ranges (~$10-30/mo light usage on
Railway, more if run with real concurrency) based on *assumed* volume, before any
real usage existed. Check actual Railway billing for the `apply-bot` service against
those numbers once real volume is flowing — if it's meaningfully higher than
expected, that's the trigger to revisit the Browserbase/Browserless comparison from
§01-B with real cost data instead of estimates.

## Keep the audit trail meaningful, not just present

`ApplyTask.fieldsFilled` and `screenshotKeys` exist so a human can reconstruct what
happened on any given attempt without re-running it. Resist the temptation to trim
this data to save storage — R2's free tier is generous (10 GB per
`JobHuntPK_v7_Final.md`'s original design) and the audit trail is the main tool for
diagnosing whether this system is behaving the way it's supposed to.
