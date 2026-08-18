# 04 — Confidence and Filter Tuning

Two different things get called "filtering" in this system, and they should be tuned
in opposite directions — worth being precise about which is which before changing
either:

- **The safety filter** (selection-time: daily cap, dedupe, credential requirement,
  `https://`-only) exists to prevent *harm* (duplicate applications, exceeding a
  sane daily volume, guessing at a login it doesn't have). This should get **stricter
  over time as you learn about edge cases**, not looser.
- **The confidence filter** (`fieldTaxonomy.js`'s `MIN_CONFIDENCE_TO_FILL` and the
  abstain rule in `worker.js`) exists to prevent *wrong data going into a real form*.
  This is the one worth actively tuning to reduce **unnecessary** abstains — cases
  where a job was genuinely fillable but the engine gave up anyway — without ever
  weakening the "never guess on email/name/resume" hard rule underneath it.

This doc is about the second one: reducing false-negative abstains without
introducing false-positive submissions.

## The lever that matters most: the synonym list, not the threshold

It's tempting to just lower `MIN_CONFIDENCE_TO_FILL` (currently 60, in
`fieldTaxonomy.js`) when the abstain rate looks high. Don't start there — a lower
threshold means the engine fills fields it's *less* sure about, which is exactly the
"wrong data goes in unsupervised" failure mode the whole design exists to prevent
(see the plan's §3, "the key correctness rail").

Instead, the first lever is `SYNONYMS` in `fieldTaxonomy.js`. Every abstain is either:
1. A field that genuinely wasn't on the page (correct to abstain), or
2. A field that *was* on the page, labeled in a way the synonym list doesn't
   recognize (fixable by adding the synonym — no accuracy tradeoff, pure
   improvement).

**Method**: pull every `skipped_low_confidence` task's `fieldsFilled` audit JSON
(it records which fields *were* found as `unmapped`, even if not filled) and manually
check: was the required field (email/name/resume) actually present under a label not
in `SYNONYMS`? If yes, add that label as a synonym. This is the direct output of
§01-E's test-corpus research, applied continuously as real abstains accumulate.

## Second lever: per-adapter overrides beat generic matching

`greenhouseAdapter.js`/`leverAdapter.js`/`ashbyAdapter.js` already hardcode
known-stable selectors before falling back to the generic taxonomy for secondary
fields (phone/LinkedIn/portfolio). If a *required* field is abstaining often on one
specific platform, the fix is usually a hardcoded selector for that platform, not a
generic-taxonomy synonym — generic matching is inherently the fallback, not the
primary path, for the three known ATS platforms.

## Third lever: the resume-upload requirement is the strictest single gate

Look at the `requiredOk` check in each adapter — all three require `resume_upload`
to be found (`type="file"` element matched) before confidence goes above 60. This is
deliberately the hardest field to miss on, since submitting an application with no
resume attached is a worse outcome than not submitting at all. If a real ATS's resume
upload is inside a shadow DOM or an iframe (some drag-and-drop widgets do this),
`page.locator()` won't find it and the task will abstain correctly, but the fix is
adapter-specific (e.g. `page.frameLocator()` for an iframe) — not a threshold change.

## What "reducing failure" should NOT mean here

Do not:
- Lower `MIN_CONFIDENCE_TO_FILL` to make the abstain rate look better. The number
  going down because the engine got smarter (better synonyms/selectors) is good; the
  number going down because the engine got less careful is a regression dressed up as
  progress.
- Retry a whole task automatically on failure to "reduce failure rate" — this was a
  deliberate choice (`applyBotQueue.js`'s `attempts: 1`) specifically because
  retrying a real form submission risks a duplicate application. If a task fails, it
  should surface in the audit trail for a human/adapter fix, not silently retry.
- Widen the company/job dedupe window to let more tasks through — that's the safety
  filter, and loosening it increases duplicate-application risk, which isn't what
  "reducing failure" should mean.

## Tracking whether tuning is actually working

Re-run §03's confidence-score histogram after each round of synonym/selector
changes. The goal shape over time: the 40-59 "close call" bucket should shrink (fewer
near-misses) while the 0-39 bucket stays roughly flat (genuinely unfillable forms
should still abstain — that's correct behavior, not something to optimize away).
