# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting:
[Report a vulnerability](https://github.com/JoKeks2023/adaptive-blocklist/security/advisories/new).

Examples worth reporting: a way to inject unwanted domains into published lists, a workflow that runs untrusted
issue or source content as code, secrets exposure, or a way to bypass the "failed build never deploys" safeguards.

## Supported versions

Only the latest published build (GitHub Pages) and the `main` branch are supported.

## Design notes

- Upstream list content and issue text are treated as untrusted data: they are parsed, never executed.
- Workflows use minimal permissions and actions pinned to commit SHAs; issue content reaches scripts only through environment variables.
- A failed or invalid build never replaces the previously published lists.
- Maintainer-only automation (`/accept`, `/allow`) requires write access to the repository.
