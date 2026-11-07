# AAR: publish to the MCP Registry (v0.2.0)

Date: 2026-11-07

## Scope

Owner asked to publish the project to an online directory, then confirmed three steps: a GitHub release with an MCP bundle, a listing in the official MCP Registry, and repo topics for directories that crawl GitHub. Owner can reach npm only through the website, so npm publishing runs in the same workflow from a token stored as a repo secret.

## Why this route

- The official MCP Registry is the source that downstream MCP directories and clients pull from, so one listing there reaches the rest.
- The registry accepts MCPB bundles hosted on GitHub releases, so the listing does not depend on npm.
- npm trusted publishing (no token) can only be set up for a package that already exists, so the first npm release needs a token created on npmjs.com and saved as the `NPM_TOKEN` repo secret.
- GitHub Actions OIDC proves ownership of the `io.github.quarterback` namespace with no stored secret.

## What shipped

- `manifest.json`: MCPB manifest (spec 0.3) for the stdio server at `bin/red-pen-editor-mcp.mjs`, Node 20 or later, four tools listed.
- `server.json`: registry record `io.github.quarterback/red-pen-editor`, package type `mcpb`, identifier pointing at the release asset. `fileSha256` is filled in by the workflow.
- `.github/workflows/release.yml`: runs from the Actions tab or a `v*` tag. Checks that package, manifest and registry versions match, runs tests, validates and packs the bundle, validates the registry record, publishes to npm with provenance when `NPM_TOKEN` is set, creates the tag and GitHub release with the bundle attached, then logs in with GitHub OIDC and publishes to the registry.
- `package.json`: `mcpName` added so a later npm release passes registry verification.
- `README.md`: one paragraph naming the registry listing and the bundle.
- Repo topics: `agent-skill`, `agent-skills`, `mcp`, `mcp-server`, `editing`, `writing`.

## Decisions made by the agent

- MCPB over npm, because npm needs the owner's credentials.
- Validation runs before anything is published, so a bad manifest or registry record stops the run first.
- The session's proxy refused the tag push (HTTP 403), so the workflow was given a manual trigger and creates the tag itself. The owner starts it; the agent does not.
- The registry record lists only the MCPB bundle. The npm package's default command is the CLI, so an npm entry would launch the wrong program from MCP clients.
- Author in the manifest is listed by name and GitHub profile only; no email.

## Validation

### First run (2026-11-07 23:21 UTC, started by the owner)

- Version check, `npm test`, MCPB validate and pack, and `mcp-publisher validate` all passed. Bundle SHA-256: `250cb16c7e78c88d14ec11664cba9c28e857dd83d1bf694905b2d3e879be7129`.
- `npm publish` signed the provenance statement, then failed with `EOTP`: the npm token was not set to bypass two-factor authentication. Nothing reached npm, so the release and registry steps never ran.
- npm warned that the `bin` paths needed cleaning.

### Fixes after the first run

- `package.json`: added `repository`, `homepage` and `bugs` (npm checks `repository` against the provenance source), cleaned the `bin` paths with `npm pkg fix`.
- Workflow: the npm step skips a version that is already published, and the release step replaces the bundle on an existing release, so a rerun after a partial failure completes the remaining steps.
- Owner action: turn on "Bypass two-factor authentication" for the npm token (or make a new token with it on and update the `NPM_TOKEN` secret), then rerun.

## What was not done

- First run not yet started; owner adds `NPM_TOKEN` (optional) and runs the workflow from the Actions tab.
- Directories that take submissions only through a web form under the owner's account (Smithery, mcp.directory, LobeHub, MCP Market) were not submitted.
