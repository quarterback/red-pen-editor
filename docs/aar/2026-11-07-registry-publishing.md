# AAR: publish to the MCP Registry (v0.2.0)

Date: 2026-11-07

## Scope

Owner asked to publish the project to an online directory, then confirmed three steps: a GitHub release with an MCP bundle, a listing in the official MCP Registry, and repo topics for directories that crawl GitHub. npm is deferred until the owner can log in from a computer.

## Why this route

- The official MCP Registry is the source that downstream MCP directories and clients pull from, so one listing there reaches the rest.
- npm publishing needs the owner's npm login. The registry also accepts MCPB bundles hosted on GitHub releases, which needs no npm account.
- GitHub Actions OIDC proves ownership of the `io.github.quarterback` namespace with no stored secret.

## What shipped

- `manifest.json`: MCPB manifest (spec 0.3) for the stdio server at `bin/red-pen-editor-mcp.mjs`, Node 20 or later, four tools listed.
- `server.json`: registry record `io.github.quarterback/red-pen-editor`, package type `mcpb`, identifier pointing at the release asset. `fileSha256` is filled in by the workflow.
- `.github/workflows/release.yml`: on a `v*` tag, checks that package, manifest and registry versions match the tag, runs tests, validates and packs the bundle, validates the registry record, creates the GitHub release with the bundle attached, then logs in with GitHub OIDC and publishes.
- `package.json`: `mcpName` added so a later npm release passes registry verification.
- `README.md`: one paragraph naming the registry listing and the bundle.
- Tag `v0.2.0` pushed to trigger the workflow.
- Repo topics: `agent-skill`, `agent-skills`, `mcp`, `mcp-server`, `editing`, `writing`.

## Decisions made by the agent

- MCPB over npm, because npm needs the owner's credentials.
- Validation runs before the release is created, so a bad manifest or registry record stops the run before anything goes public.
- Author in the manifest is listed by name and GitHub profile only; no email.

## Validation

Results of the `v0.2.0` workflow run are recorded in the follow-up section below.

## What was not done

- Not published to npm (owner away from a terminal).
- Directories that take submissions only through a web form under the owner's account (Smithery, mcp.directory, LobeHub, MCP Market) were not submitted.
