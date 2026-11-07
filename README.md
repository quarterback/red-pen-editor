# Red Pen Editor

**A free, local-first editorial judgment skill, npm CLI, and MCP server.** Version 0.1.0. MIT licensed. No hosted service, paywall, telemetry, or provider API key.

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

Requires Node.js 20+. Run from this directory with no `npm install`:

```sh
node bin/red-pen-editor.mjs inspect examples/bloated.md
node bin/red-pen-editor.mjs brief examples/bloated.md
```

For **actual contextual editorial review**, use a local Ollama model:

```sh
ollama pull llama3.2
node bin/red-pen-editor.mjs review examples/bloated.md --model llama3.2
node bin/red-pen-editor.mjs edit examples/bloated.md --model llama3.2 > revised.md
```

Ollama must be running. `inspect` is only a surface-level diagnostic, not a substitute for an editor. `review` returns the model's proposed cuts and accepted/rejected operations; `edit` prints the revised text and does not overwrite input. Keep a human review before publication. You can override the local model with `--model` or `EDITOR_MODEL`.

To install the *local working folder* as an npm executable:

```sh
npm link
red-pen-editor inspect examples/bloated.md
```

This package has **not been published to npm**. The package name is a working name and availability has not been checked.

### 3. MCP server: editorial judgment from any connected agent

Start the dependency-free stdio server:

```sh
node /absolute/path/to/red-pen-editor/bin/red-pen-editor-mcp.mjs
```

Example client config (adapt the fields to your MCP host):

```json
{
  "mcpServers": {
    "red-pen-editor": {
      "command": "node",
      "args": ["/absolute/path/to/red-pen-editor/bin/red-pen-editor-mcp.mjs"]
    }
  }
}
```

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
5. Reject ambiguous spans, overlapping edits, and attempts to delete a protected number, URL, email, or explicit `preserve` string.
6. Return an edited version and rejected-edit log; review meaning and grammar before publishing.

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

## What the guard can and cannot prove

The package checks exact source spans and literal anchors. It **cannot prove semantic equivalence**, detect every changed implication, or know whether a distinctive passage was intentional. A local model can also make poor editing decisions. `editorial_apply` operates on text supplied by the caller; it does not access a file system or send content to a server. Only the optional local Ollama call uses HTTP, by default restricted to loopback.

### Privacy

The skill and host-agent MCP tools do not contact a third-party service. The Ollama integration sends text to a loopback HTTP endpoint only. If the *host agent itself* uses an online model, its existing data-handling arrangements still apply. Review source confidentiality before sending sensitive content to any model.

## Development

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
- Test with multiple agents and local models; publish registry packages once the behavior is validated.

MIT License.
