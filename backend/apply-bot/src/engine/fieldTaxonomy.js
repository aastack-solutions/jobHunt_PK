// Generic field-identification engine: label/aria-label/placeholder/name-attribute
// matching against a fixed synonym taxonomy — regex/keyword only, no ML, same
// philosophy the resume-parser already uses for skill extraction. Used both as the
// Phase 2 generic adapter's core and as a same-page fallback inside the Phase 1
// ATS-specific adapters when a hand-written selector doesn't match (ATS DOM structure
// does drift over time).
const SYNONYMS = {
  full_name: ['full name', 'your name', 'name'],
  first_name: ['first name', 'given name'],
  last_name: ['last name', 'surname', 'family name'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'mobile', 'contact number', 'telephone'],
  resume_upload: ['resume', 'résumé', 'cv', 'upload resume', 'attach resume'],
  cover_letter_text: ['cover letter', 'coverletter', 'why are you interested', 'additional information'],
  linkedin_url: ['linkedin', 'linkedin profile', 'linkedin url'],
  portfolio_url: ['portfolio', 'website', 'github', 'personal site'],
  work_authorization: ['work authorization', 'authorized to work', 'require sponsorship', 'visa sponsorship'],
  salary_expectation: ['salary expectation', 'expected salary', 'desired salary', 'compensation expectation'],
};

const CONFIDENCE = {
  EXACT_LABEL: 90,
  PLACEHOLDER: 60,
  NAME_ATTR: 35,
  // An id/name hit on a field whose ELEMENT TYPE has already independently confirmed
  // the kind of field it is (see TYPE_RESTRICTED_KEYS). Much stronger evidence than a
  // bare NAME_ATTR hit: the type settles "what kind of field is this", leaving only
  // "which one", which is exactly what the id/name answers.
  NAME_ATTR_TYPE_CONFIRMED: 75,
};
const MIN_CONFIDENCE_TO_FILL = 60; // require at least "placeholder-level" certainty

// Keys whose candidate set bestMatch() pre-filters by input type, so a name/id match
// on a surviving candidate is corroborated rather than speculative.
//
// Real evidence for why this exists (docs/apply-bot/01-research-plan.md §E, Finding
// 4): on 4 of 4 live Greenhouse embed forms the resume input is labelled "Attach" —
// matching no synonym, since 'attach resume' is not a substring of 'attach' — while
// carrying id="resume". Scored at a bare NAME_ATTR (35) that sits under
// MIN_CONFIDENCE_TO_FILL, so the strictest gate in the engine (see docs/apply-bot/04)
// failed on an unambiguous signal. Deliberately keyed off the id/name and NOT off a
// new 'attach' label synonym: those forms carry TWO file inputs, id="resume" and
// id="cover_letter", both labelled "Attach", so a label synonym would match the wrong
// one just as often as the right one.
const TYPE_RESTRICTED_KEYS = { resume_upload: 'file' };

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

// Word-boundary match for the id/name path. Plain `includes` is fine for a long
// synonym but dangerous for a short one — 'cv' would hit any id containing those two
// letters. Underscores, hyphens, digits and spaces all count as boundaries, so
// 'resume', 'resume_upload' and 'job_resume' match while 'cvv' does not.
function nameAttrMatches(nameAndId, synonym) {
  const needle = synonym.replace(/\s+/g, '');
  return new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`).test(nameAndId);
}

// Runs entirely inside the page — returns plain data, not live handles, so the
// caller can decide selectors afterward (Playwright locators can't cross the
// page.evaluate boundary).
async function scanFields(page) {
  return page.evaluate(() => {
    function labelFor(el) {
      if (el.id) {
        const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (byFor) return byFor.innerText;
      }
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.innerText;
      // Nearby preceding text node (common in non-<label>-wrapped custom forms).
      let sib = el.previousElementSibling;
      for (let i = 0; i < 2 && sib; i += 1, sib = sib.previousElementSibling) {
        if (sib.innerText && sib.innerText.trim().length > 0 && sib.innerText.trim().length < 100) {
          return sib.innerText;
        }
      }
      return '';
    }

    const elements = Array.from(document.querySelectorAll('input, textarea, select'));
    return elements.map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      label: labelFor(el),
    }));
  });
}

function scoreFieldForKey(field, key) {
  const synonyms = SYNONYMS[key] || [];
  const label = normalize(field.label);
  const ariaLabel = normalize(field.ariaLabel);
  const placeholder = normalize(field.placeholder);
  const name = normalize(field.name) + ' ' + normalize(field.id);

  if (synonyms.some((s) => label === s || ariaLabel === s)) return CONFIDENCE.EXACT_LABEL;
  if (synonyms.some((s) => label.includes(s) || ariaLabel.includes(s))) return CONFIDENCE.EXACT_LABEL - 10;
  if (synonyms.some((s) => placeholder.includes(s))) return CONFIDENCE.PLACEHOLDER;
  if (synonyms.some((s) => nameAttrMatches(name, s))) {
    return TYPE_RESTRICTED_KEYS[key] === field.type ? CONFIDENCE.NAME_ATTR_TYPE_CONFIRMED : CONFIDENCE.NAME_ATTR;
  }
  return 0;
}

// Returns { field, confidence } for the best match of `key`, or null if nothing
// clears MIN_CONFIDENCE_TO_FILL. `resume_upload` requires an <input type="file">.
function bestMatch(fields, key) {
  let best = null;
  for (const field of fields) {
    if (TYPE_RESTRICTED_KEYS[key] && field.type !== TYPE_RESTRICTED_KEYS[key]) continue;
    const confidence = scoreFieldForKey(field, key);
    if (confidence >= MIN_CONFIDENCE_TO_FILL && (!best || confidence > best.confidence)) {
      best = { field, confidence };
    }
  }
  return best;
}

module.exports = { scanFields, bestMatch, MIN_CONFIDENCE_TO_FILL, SYNONYMS, CONFIDENCE, TYPE_RESTRICTED_KEYS };
