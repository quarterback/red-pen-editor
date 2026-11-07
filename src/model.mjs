import { editorialBrief, applyEdits, inspect, KINDS } from './index.mjs';

export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    assessment: { type: 'string' },
    edits: { type: 'array', items: { type: 'object', additionalProperties: false,
      properties: {
        before: { type: 'string' }, after: { type: 'string' },
        kind: { type: 'string', enum: KINDS },
        reason: { type: 'string' }, priority: { type: 'string', enum: ['high','medium','low'] }
      }, required: ['before','after','kind','reason','priority']
    } },
    protectedMeaning: { type: 'array', items: { type: 'string' } }
  }, required: ['assessment','edits','protectedMeaning']
};

export function reviewPrompt(text, opts = {}) {
  return `You are a demanding substantive editor, not a copywriting generator.\n${editorialBrief(opts)}

Rules:
- Remove unearned information rather than compressing every sentence.
- Make no edits solely to achieve a target length. Zero edits is acceptable.
- Assess entire sections, then individual sentences. Find conceptual duplication across paragraphs.
- An edit may delete (after="") or replace text. "before" MUST be a unique, exactly matching substring of the source, including whitespace/newlines as needed.
- Proposals must be non-overlapping. One edit per repeated paragraph is preferable to a list of word substitutions.
- Do not insert claims or change level of certainty, attribution, numbers, names, dates, citations, code, or quoted material.
- Do not force an unnatural uniform voice; favor the source author's rhythm and style.
- Explain editorial *value*, not a grammar platitude, in each reason.
- Do not delete a necessary qualification because it looks verbose.
- Return JSON only, following the supplied schema.

SOURCE START
${text}
SOURCE END`;
}

export async function reviewWithOllama(text, options = {}) {
  const model = options.model || process.env.EDITOR_MODEL || 'llama3.2';
  const endpoint = options.endpoint || process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const url = new URL('/api/generate', endpoint);
  if (!['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname) && !options.allowRemote) {
    throw new Error('Remote model endpoint blocked. Explicitly set allowRemote to send text off-device.');
  }
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ model, prompt: reviewPrompt(text, options), format: REVIEW_SCHEMA, stream: false,
        options: { temperature: 0.1 } }), signal: AbortSignal.timeout(options.timeoutMs || 120000) });
  } catch (error) {
    throw new Error(`Cannot reach Ollama at ${url}. Start Ollama and pull a model. (${error.message})`);
  }
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
  const payload = await response.json();
  let data;
  try { data = JSON.parse(payload.response); }
  catch { throw new Error('Model did not return valid JSON. Try another local model.'); }
  if (!Array.isArray(data.edits)) throw new Error('Model response missing edits array.');
  for (const e of data.edits) {
    if (!e || typeof e.before !== 'string' || typeof e.after !== 'string') throw new Error('Malformed proposed edit.');
  }
  // A local model may not release protected details; allowLoss is for the host
  // agent or a person, so strip it from model proposals.
  const proposals = data.edits.map(({ allowLoss, ...e }) => e);
  const preview = applyEdits(text, proposals, { preserve: options.preserve });
  return { model, assessment: data.assessment || '', protectedMeaning: data.protectedMeaning || [],
    inspection: inspect(text), ...preview };
}
