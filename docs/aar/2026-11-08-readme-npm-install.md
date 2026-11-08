# AAR: README for the published npm package (v0.2.1)

Date: 2026-11-08

## Scope

Owner asked to update the npm page after 0.2.0 went live. The npm page shows the README from the published version, so the fix is a README change plus a new version.

## What shipped

- README: install with `npm install -g red-pen-editor` or `npx`; CLI examples use the installed command; MCP config runs the server through `npx`; development commands marked as running from a clone.
- Removed the line saying the package was not published to npm, the `npm link` instructions, and the MCP Registry sentence (no listing exists yet).
- Version 0.2.1 in package.json, manifest.json, server.json, the MCP server and the CLI.

## Validation

- `npm test`: 23 passed, 0 failed.

## What was not done

- The npm page changes only when 0.2.1 is published. Owner runs the Release and publish workflow from the Actions tab.
