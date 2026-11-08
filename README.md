# Red Pen Editor

**A free, local-first editorial judgment skill, npm CLI, and MCP server.** Version 0.2.1. MIT licensed. No hosted service, paywall, telemetry, or provider API key.

The main question is: **What can be deleted without diminishing the piece's useful meaning, accuracy, or voice?**

This project focuses on substantive cuts: repetitive claims, unnecessary paragraphs, empty introductions, repeated conclusions, and excessive explanations. It does not impose a word-count target or automatically ban stylistic phrases.

## Three ways to use it

### 1. Agent Skill: no model installation needed

Copy `skills/red-pen-editor/` into the skills folder of a compatible agent. The `SKILL.md` contains the editorial method and works using the agent's existing model. The included code is optional.

Example for an agent with a project-level `.agents/skills` folder:

```sh
mkdir -p .agents/skills
cp -R skills/red-pen-editor .agents/skills/
```

### 2. npm CLI: review or edit a file locally

Requires Node.js 20+. Install from npm:

```sh
npm install -g red-pen-editor
red-pen-editor inspect draft.md
red-pen-editor brief draft.md
```

Or run it once without installing:

```sh
npx red-pen-editor inspect draft.md
```

For **actual contextual editorial review**, use a local Ollama model:

```sh
ollama pull llama3.2
red-pen-editor review draft.md --model llama3.2
red-pen-editor edit draft.md --model llama3.2 > revised.md
```

Ollama must be running. `inspect` is only a surface-level diagnostic, not a substitute for an editor. It flags near-identical sentences and paragraphs that share most of their content words. `review` returns the model's proposed cuts and accepted/rejected operations; `edit` prints the revised text and does not overwrite input. Keep a human review before publication. You can override the local model with `--model` or `EDITOR_MODEL`.

### 3. MCP server: editorial judgment from any connected agent

Add the dependency-free stdio server to your MCP host. Example client config (adapt the fields to your host):

```json
{
  "mcpServers": {
    "red-pen-editor": {
      "command": "npx",
      "args": ["-y", "-p", "red-pen-editor", "red-pen-editor-mcp"]
    }
  }
}
```

If you installed the package globally, use `"command": "red-pen-editor-mcp"` with no args.

| Tool | Function | Model requirement |
| --- | --- | --- |
| `editorial_brief` | Returns a substantive editorial rubric and possible duplication signals | Host agent only |
| `editorial_apply` | Applies host-proposed, exact-span edits with safety checks | Host agent only |
| `editorial_review_local` | Uses Ollama to make and explain edit proposals | Local Ollama |
| `editorial_edit_local` | Uses Ollama and returns a guarded edited version | Local Ollama |

The host agent can make editorial judgments and call `editorial_apply` itself. **No second model, subscription, or outside API is needed** for that path. The stand-alone CLI uses a local model for substantive editing. The MCP server supports the 2025-11-25 legacy handshake and the 2026-07-28 stateless stdio request pattern.

## Editing behavior

1. Read for the audience and purpose.
2. Identify paragraphs or claims with no unique contribution.
3. Recommend deletion before sentence-level compression.
4. Require an exact source span for each cut or replacement.
5. Reject ambiguous spans, overlapping edits, and edits that would remove the last occurrence of a protected number, written or ISO date, URL, email, or explicit `preserve` string. Literals are matched as whole tokens, so `1` does not count as kept because `10` survives.
6. Allow a justified cut of a protected detail only when the edit names it in `allowLoss`. The accepted edit records what it released in `allowedLoss`. `allowLoss` cannot release a `preserve` string, and edits proposed by a local model have it stripped.
7. When a deletion removes the start of a sentence, capitalize the word that now opens it.
8. Return an edited version and rejected-edit log; review meaning and grammar before publishing.

### Host-agent example

The host sends this edit proposal to `editorial_apply`:

```json
{
  "text": "There are several factors to consider. The change takes effect May 1.",
  "edits": [{
    "before": "There are several factors to consider. ",
    "after": "",
    "kind": "throat-clearing",
    "reason": "The preface adds no relevant information."
  }]
}
```

The returned text is `The change takes effect May 1.`

### Cutting a paragraph that holds a unique detail

A background paragraph can be worth cutting even though it holds the only mention of a year. Name the detail in `allowLoss`:

```json
{
  "before": "The program began in 2019 as a pilot in two neighborhoods. ",
  "after": "",
  "kind": "overexplaining",
  "reason": "Residents need the current rule, not the program's history.",
  "allowLoss": ["2019"]
}
```

Without `allowLoss`, the edit is rejected with the detail it would remove.

## What the guard can and cannot prove

The package checks exact source spans and literal anchors. It **cannot prove semantic equivalence**, detect every changed implication, or know whether a distinctive passage was intentional. A local model can also make poor editing decisions. `editorial_apply` operates on text supplied by the caller; it does not access a file system or send content to a server. Only the optional local Ollama call uses HTTP, by default restricted to loopback.

### Privacy

The skill and host-agent MCP tools do not contact a third-party service. The Ollama integration sends text to a loopback HTTP endpoint only. If the *host agent itself* uses an online model, its existing data-handling arrangements still apply. Review source confidentiality before sending sensitive content to any model.

## Development

From a clone of this repo, with no `npm install`:

```sh
npm test
npm run demo
npm pack --dry-run
```

Tests include semantic-risk guardrails, span validation, deterministic review fixtures, and an MCP JSON-RPC smoke test. The optional local-model integration can be tested against an Ollama installation. There are no npm dependencies.

## Roadmap

- Add a human-reviewed benchmark of paragraph-level substantive cuts.
- Evaluate usefulness and meaning retention, not just words removed.
- Add a document-aware span format for prose, Markdown, and citations.
- Test with multiple agents and local models.

MIT License.
