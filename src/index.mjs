/** Dependency-free editorial inspection and safe application of model-proposed edits. */
export const KINDS = ['duplicate', 'redundancy', 'throat-clearing', 'overexplaining', 'structure', 'line-edit', 'other'];

export function wordCount(text) {
  return (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

function sentences(text) {
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  return [...segmenter.segment(text)].map(s => ({ text: s.segment.trim(), index: s.index })).filter(s => s.text);
}

function normalizedWords(text) {
  return (text.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) ?? []).filter(Boolean);
}

function overlapScore(a, b) {
  const A = new Set(normalizedWords(a));
  const B = new Set(normalizedWords(b));
  if (A.size < 7 || B.size < 7) return 0;
  const shared = [...A].filter(w => B.has(w)).length;
  return shared / (A.size + B.size - shared);
}

// Common English function words. Paragraph comparison ignores these so that
// paraphrased duplicates are scored on the words that carry the claim.
const STOPWORDS = new Set(`a about above after again all also am an and any are as at be because been before being
below between both but by can could did do does doing down during each few for from further had has have having he her
here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our
ours out over own same she should so some such than that the their theirs them then there these they this those through
to too under until up very was we were what when where which while who whom why will with would you your yours means
need needs use using make making made get gets got via per still`.split(/\s+/));

function contentWords(text) {
  const words = normalizedWords(text)
    .filter(w => !STOPWORDS.has(w))
    .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return new Set(words);
}

/** Share of the smaller paragraph's content words that also appear in the other paragraph. */
function paragraphOverlap(a, b) {
  const A = contentWords(a);
  const B = contentWords(b);
  if (A.size < 5 || B.size < 5) return 0;
  const shared = [...A].filter(w => B.has(w)).length;
  return shared / Math.min(A.size, B.size);
}

export const PARAGRAPH_OVERLAP_THRESHOLD = 0.6;

/** Surface signals are candidates, NEVER automatic deletion instructions. */
export function inspect(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const parts = text.trim() ? text.trim().split(/\n\s*\n/g) : [];
  const all = sentences(text);
  const repeats = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].text, b = all[j].text;
      const exact = normalizedWords(a).join(' ') === normalizedWords(b).join(' ');
      const score = exact ? 1 : overlapScore(a, b);
      if ((exact && normalizedWords(a).length >= 4) || (score >= 0.77 && normalizedWords(a).length >= 8 && normalizedWords(b).length >= 8)) {
        repeats.push({ first: a, later: b, similarity: Number(score.toFixed(2)), note: 'Possible duplication. Editorial review required.' });
      }
    }
  }
  const paragraphRepeats = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const score = paragraphOverlap(parts[i], parts[j]);
      if (score >= PARAGRAPH_OVERLAP_THRESHOLD) {
        paragraphRepeats.push({ first: i + 1, later: j + 1, overlap: Number(score.toFixed(2)),
          firstText: parts[i].trim(), laterText: parts[j].trim(),
          note: 'Paragraphs share most of their content words. Check whether the later one adds anything.' });
      }
    }
  }
  return {
    words: wordCount(text), characters: text.length, paragraphs: parts.length, sentences: all.length,
    possibleRepeatedSentences: repeats.slice(0, 20),
    possibleRepeatedParagraphs: paragraphRepeats.slice(0, 20),
    note: 'These are surface signals, not a semantic review or a recommendation to shorten.'
  };
}

function occurrences(source, needle) {
  if (!needle) return [];
  const offsets = [];
  let at = 0;
  while (at <= source.length - needle.length) {
    const hit = source.indexOf(needle, at);
    if (hit < 0) break;
    offsets.push(hit);
    at = hit + 1;
  }
  return offsets;
}

const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

/** Checks fact-bearing literals; cannot itself prove semantic equivalence. */
export function protectedLiterals(text, preserve = []) {
  const found = new Set();
  const matches = [
    /https?:\/\/[^\s)>\]}]+/g,
    /\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g,
    /(?<![\p{L}\p{N}])(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:\s*%|\s*(?:million|billion|thousand))?\b/gu,
    /\b(?:19|20)\d{2}-\d\d-\d\d\b/g,
    // Written dates: "May 1", "May 1, 2027", "June 2026"
    new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*\\d{4})?(?![\\p{L}\\p{N}])`, 'gu'),
    new RegExp(`\\b${MONTH}\\.?\\s+(?:19|20)\\d{2}\\b`, 'gu')
  ];
  for (const rule of matches) for (const match of text.matchAll(rule)) found.add(match[0]);
  for (const literal of preserve) if (literal && text.includes(literal)) found.add(literal);
  return [...found];
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Counts a literal as a whole token, so "1" is not found inside "10" or "2027".
 * Boundaries are only enforced on sides where the literal itself starts or ends
 * with a letter or digit.
 */
export function countLiteral(text, literal) {
  if (!literal) return 0;
  const startsWord = /^[\p{L}\p{N}]/u.test(literal);
  const endsWord = /[\p{L}\p{N}]$/u.test(literal);
  const pattern = `${startsWord ? '(?<![\\p{L}\\p{N}])' : ''}${escapeRegExp(literal)}${endsWord ? '(?![\\p{L}\\p{N}])' : ''}`;
  return [...text.matchAll(new RegExp(pattern, 'gu'))].length;
}

function lostLiterals(original, revised, preserve) {
  return protectedLiterals(original, preserve).filter(x => countLiteral(revised, x) === 0);
}

export function applyEdits(text, proposals, { preserve = [], unsafe = false } = {}) {
  if (typeof text !== 'string' || !Array.isArray(proposals)) throw new TypeError('Expected text and an array of edits');
  const rejected = [];
  const located = [];
  for (let i = 0; i < proposals.length; i++) {
    const e = proposals[i];
    if (!e || typeof e.before !== 'string' || typeof e.after !== 'string' || !e.before) {
      rejected.push({ index: i, reason: 'Each edit requires nonempty before and a string after.' }); continue;
    }
    if (e.before === e.after) { rejected.push({ index: i, reason: 'No change.' }); continue; }
    if (e.allowLoss !== undefined && (!Array.isArray(e.allowLoss) || e.allowLoss.some(x => typeof x !== 'string'))) {
      rejected.push({ index: i, reason: 'allowLoss must be an array of strings.' }); continue;
    }
    const hits = occurrences(text, e.before);
    if (hits.length !== 1) {
      rejected.push({ index: i, reason: hits.length === 0 ? 'Original span not found exactly.' : 'Original span is ambiguous (multiple occurrences).' }); continue;
    }
    located.push({ ...e, index: i, start: hits[0], end: hits[0] + e.before.length });
  }

  // Each edit, in proposal order, is checked for overlap against edits already
  // ACCEPTED, then against the literal guard. An edit that fails the guard no
  // longer blocks a later edit that overlaps it.
  const accepted = [];
  const allowed = new Set();
  // Literals the caller named in `preserve` can never be released by allowLoss.
  const pinned = new Set(preserve.filter(x => x && text.includes(x)));
  let current = text;
  for (const e of located) {
    if (accepted.some(a => e.start < a.end && e.end > a.start)) {
      rejected.push({ index: e.index, reason: 'Overlapping edit; use one larger span.' }); continue;
    }
    const tentative = applyLocated(text, [...accepted, e]);
    const lost = unsafe ? [] : lostLiterals(text, tentative, preserve);
    const permitted = new Set([...allowed, ...(e.allowLoss ?? [])]);
    const blocked = lost.filter(x => pinned.has(x) || !permitted.has(x));
    if (blocked.length) {
      rejected.push({ index: e.index, reason: `Protected detail would disappear: ${blocked.join(', ')}`, edit: e });
      continue;
    }
    const newlyLost = lost.filter(x => !allowed.has(x));
    if (newlyLost.length) e.allowedLoss = newlyLost;
    for (const x of e.allowLoss ?? []) allowed.add(x);
    accepted.push(e);
    current = tentative;
  }
  current = current.replace(/\n{3,}/g, '\n\n').trim();
  rejected.sort((a, b) => a.index - b.index);
  return {
    original: text,
    revised: current,
    beforeWords: wordCount(text), afterWords: wordCount(current),
    wordsRemoved: wordCount(text) - wordCount(current),
    accepted: accepted.sort((a, b) => a.index - b.index).map(({ start, end, index, ...e }) => ({ index, start, end, ...e })),
    rejected,
    warning: 'Anchor checks protect literal details, not full meaning. Review the revision before publishing.'
  };
}

// True when position `at` in `s` begins a sentence: start of text, after a
// paragraph or line break, or after closing punctuation and whitespace.
function atSentenceStart(s, at) {
  const head = s.slice(0, at);
  return head.trim() === '' || /\n\s*$/.test(head) || /[.!?]["'’”)\]]*\s+$/.test(head);
}

// When a deletion removes the opening of a sentence, capitalize the word that
// now starts it. Skips words that look like identifiers, URLs, emails or code.
function recapitalize(s, at, removed) {
  if (!/^\s*\p{Lu}/u.test(removed) || !atSentenceStart(s, at)) return s;
  const word = s.slice(at).match(/^[^\s]+/)?.[0] ?? '';
  if (!/^\p{Ll}/u.test(word)) return s;
  if (/[\p{Lu}\p{N}_@`/]|:\/\//u.test(word.slice(1).replace(/[.,;:!?'"’”)\]]+$/u, ''))) return s;
  return s.slice(0, at) + word[0].toLocaleUpperCase('en') + s.slice(at + 1);
}

function applyLocated(original, selections) {
  let s = original;
  for (const e of [...selections].sort((a,b) => b.start - a.start)) {
    s = s.slice(0, e.start) + e.after + s.slice(e.end);
    if (e.after === '') s = recapitalize(s, e.start, e.before);
  }
  return s;
}

export function editorialBrief({ audience = 'the intended reader', purpose = 'answer the actual request', preserve = [] } = {}) {
  return [
    `Read for ${audience}; purpose: ${purpose}.`,
    'Decide what deserves to exist before shortening sentences.',
    'Identify duplicate claims even when phrased differently; cut the weaker occurrence.',
    'Remove introductions that delay the answer and conclusions that repeat it.',
    'Delete explanations that add no evidence, distinction, decision, or necessary context.',
    'Preserve essential complexity, uncertainty, exceptions, citations, facts, and the author’s voice.',
    'Prefer deleting a paragraph to polishing one that adds no information.',
    'Avoid arbitrary word-count quotas, generic replacement prose, and an enforced house voice.',
    'Suggest only defensible changes, quoting the exact source span in before and the proposed replacement in after.',
    'If a justified cut removes a number, date, URL or email that appears nowhere else, list each one in that edit\'s allowLoss array and say why in reason.',
    preserve.length ? `Explicitly preserve: ${preserve.join(' | ')}.` : ''
  ].filter(Boolean).join('\n');
}
