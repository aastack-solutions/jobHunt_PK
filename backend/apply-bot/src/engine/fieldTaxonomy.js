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

const CONFIDENCE = { EXACT_LABEL: 90, PLACEHOLDER: 60, NAME_ATTR: 35 };
const MIN_CONFIDENCE_TO_FILL = 60; // require at least "placeholder-level" certainty

function normalize(s) {
  return String(s || '').toLowerCase().trim();
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
  if (synonyms.some((s) => name.includes(s.replace(/\s+/g, '')))) return CONFIDENCE.NAME_ATTR;
  return 0;
}

// Returns { field, confidence } for the best match of `key`, or null if nothing
// clears MIN_CONFIDENCE_TO_FILL. `resume_upload` requires an <input type="file">.
function bestMatch(fields, key) {
  let best = null;
  for (const field of fields) {
    if (key === 'resume_upload' && field.type !== 'file') continue;
    const confidence = scoreFieldForKey(field, key);
    if (confidence >= MIN_CONFIDENCE_TO_FILL && (!best || confidence > best.confidence)) {
      best = { field, confidence };
    }
  }
  return best;
}

module.exports = { scanFields, bestMatch, MIN_CONFIDENCE_TO_FILL, SYNONYMS };
