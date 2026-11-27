# Contributing

This project follows a short [Code of Conduct](CODE_OF_CONDUCT.md). Security problems: see [SECURITY.md](SECURITY.md).
Questions and ideas: [Discussions](https://github.com/JoKeks2023/adaptive-blocklist/discussions).

Thanks for helping! The easiest contributions need no code:

- **Something broke:** use [Report a problem](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=broken-service.yml)
  (the web configurator pre-fills your configuration).
- **Missing domains:** [Suggest domains](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=block-domain.yml).
  A bot checks the syntax and whether they are already listed; a maintainer reviews the rest.

## How maintainers handle reports

| Report | Action |
|---|---|
| False positive on one domain | Add it to `overrides/allow.txt` (removes the domain and its subdomains from all lists) and report it upstream. |
| Missing domain | Add it to `overrides/deny.txt` (shows up in the `custom` module) or report it upstream; prefer upstream. |
| Whole source is too aggressive | Move the source to another module or mark it `status: pending` in `config/sources.yml`. |

### Maintainer shortcuts

Comment on an issue (write access required; a workflow validates and commits, then rebuilds the lists):

- `/accept` on a `domain-request` issue: adds the valid, not yet listed domains to `overrides/deny.txt`.
- `/allow` on a `false-positive` issue: adds the reported blocked domains to `overrides/allow.txt`.

## Code changes

```bash
python -m venv .venv && . .venv/bin/activate && pip install -e '.[dev]'
python -m pytest && python -m blocklist check-config
cd web && npm ci && npm test && npm run build
```

See the README for adding sources, modules and profiles. New sources must be verified first (URL, format, license,
maintenance); otherwise add them as `status: pending` with a reason.
