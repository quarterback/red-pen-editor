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
  return {
    words: wordCount(text), characters: text.length, paragraphs: parts.length, sentences: all.length,
    possibleRepeatedSentences: repeats.slice(0, 20),
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

/** Checks fact-bearing literals; cannot itself prove semantic equivalence. */
export function protectedLiterals(text, preserve = []) {
  const found = new Set();
  const matches = [
    /https?:\/\/[^\s)>\]}]+/g,
    /\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/g,
    /(?<![\p{L}\p{N}])(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:\s*%|\s*(?:million|billion|thousand))?\b/gu,
    /\b(?:19|20)\d{2}-\d\d-\d\d\b/g
  ];
  for (const rule of matches) for (const match of text.matchAll(rule)) found.add(match[0]);
  for (const literal of preserve) if (literal && text.includes(literal)) found.add(literal);
  return [...found];
}

export function applyEdits(text, proposals, { preserve = [], unsafe = false } = {}) {
  if (typeof text !== 'string' || !Array.isArray(proposals)) throw new TypeError('Expected text and an array of edits');
  const approved = [], rejected = [];
  for (let i = 0; i < proposals.length; i++) {
    const e = proposals[i];
    if (!e || typeof e.before !== 'string' || typeof e.after !== 'string' || !e.before) {
      rejected.push({ index: i, reason: 'Each edit requires nonempty before and a string after.' }); continue;
    }
    if (e.before === e.after) { rejected.push({ index: i, reason: 'No change.' }); continue; }
    const hits = occurrences(text, e.before);
    if (hits.length !== 1) {
      rejected.push({ index: i, reason: hits.length === 0 ? 'Original span not found exactly.' : 'Original span is ambiguous (multiple occurrences).' }); continue;
    }
    const start = hits[0], end = start + e.before.length;
    if (approved.some(a => start < a.end && end > a.start)) {
      rejected.push({ index: i, reason: 'Overlapping edit; use one larger span.' }); continue;
    }
    approved.push({ ...e, index: i, start, end });
  }
  // Enforce preservation at the full-document level. Reject individual edits
  // that remove an anchor, rather than rejecting the whole editorial pass.
  let current = text;
  let accepted = [];
  for (const e of approved.sort((a,b) => a.start - b.start)) {
    const tentative = applyLocated(text, [...accepted, e]);
    const lost = protectedLiterals(text, preserve).filter(x => !tentative.includes(x));
    if (!unsafe && lost.length) {
      rejected.push({ index: e.index, reason: `Protected detail would disappear: ${lost.join(', ')}`, edit: e });
    } else {
      accepted.push(e);
      current = tentative;
    }
  }
  current = current.replace(/\n{3,}/g, '\n\n').trim();
  return {
    original: text,
    revised: current,
    beforeWords: wordCount(text), afterWords: wordCount(current),
    wordsRemoved: wordCount(text) - wordCount(current),
    accepted: accepted.map(({ start, end, index, ...e }) => ({ index, start, end, ...e })),
    rejected,
    warning: 'Anchor checks protect literal details, not full meaning. Review the revision before publishing.'
  };
}

function applyLocated(original, selections) {
  let s = original;
  for (const e of [...selections].sort((a,b) => b.start - a.start)) {
    s = s.slice(0, e.start) + e.after + s.slice(e.end);
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
    preserve.length ? `Explicitly preserve: ${preserve.join(' | ')}.` : ''
  ].filter(Boolean).join('\n');
}
