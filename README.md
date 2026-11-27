# Universal Blocklist

Configurable DNS blocklists for **Pi-hole**, **AdGuard Home** and compatible DNS filters.
Pick a device profile in the web configurator, toggle modules, and subscribe to the generated lists.

Everything runs on GitHub: source in the repo, builds in GitHub Actions, hosting on GitHub Pages.
No server, no database, no paid service.

- **Engine** (`blocklist/`, Python): downloads sources, parses, validates, dedupes, applies the allowlist, writes lists + metadata.
- **Config** (`config/`, `overrides/`, YAML/TXT): sources, modules, profiles, allow/deny lists. Adding to these needs no code change.
- **Web** (`web/`, React + Vite + TypeScript): configurator that reads the *published* `catalog.json` and module files.

## Published endpoints

Relative to your Pages site (`https://<user>.github.io/<repo>/`):

| Path | Content |
|---|---|
| `lists/modules/{advertising,tracking,telemetry,malware}.txt` | one list per module (permanent URLs) |
| `lists/modules/custom.txt` | your `overrides/deny.txt` (empty by default) |
| `lists/profiles/desktop.txt` | predefined profile (permanent URL) |
| `data/catalog.json` | modules, profiles, sources (status, license), build info |
| `data/stats.json` | totals and per-module / per-source statistics |

All paths are relative; the site works on project pages and custom domains.

## Architecture

```
config/*.yml ─┐
overrides/*.txt ─┤                      ┌─ lists/modules/*.txt
              ├─> blocklist (Python) ──┼─ lists/profiles/*.txt  ─> web/public ─> vite build ─> Pages artifact
sources (https)┘   download→parse→       └─ data/{catalog,stats}.json
                   validate→dedupe→
                   allowlist→compose
```

Key rules of the engine:

- **Two input formats only**, declared per source: `hosts` (`0.0.0.0|127.0.0.1|::|::1 host [host...]`) and `domains` (one per line). Nothing is auto-detected; non-matching lines count as invalid, and a source with more than `max_invalid_ratio` (default 2 %) invalid lines fails with `invalid_format` (e.g. an HTML error page or adblock syntax).
- **Normalisation:** lowercase, trailing dot removed, IDN → punycode; IPs, single labels, wildcards, URLs are rejected.
- **Fail closed:** failed download (timeout, retries, 64 MB cap, https only), too few entries (`min_entries`), or a module below `min_domains` fails the whole build. Output is written to a temp dir, validated by an independent validator (sha256, sorting, duplicates, allowlist, profile = union of modules), and only then replaces `web/public/{lists,data}`.
- **Deterministic:** sorted output, no timestamps in list bodies except the injected build time; same inputs → byte-identical files.
- **Untrusted input:** downloaded content is only parsed as text, never executed.
- **Output is exact-domain hosts format** (`0.0.0.0 domain`). Subdomains are not collapsed into parents.
- **Allowlist** (`overrides/allow.txt`) removes the domain *and all subdomains* from every list.

## Local setup

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
python -m pytest                       # engine tests
python -m blocklist check-config       # validate config
python -m blocklist build              # downloads sources, writes web/public/{lists,data}

cd web && npm ci
npm run dev                            # http://localhost:5173 (uses web/public/{lists,data})
npm test && npm run build
```

`web/public/lists` and `web/public/data` are git-ignored; they are generated.

## Add a source

Append to `config/sources.yml` (see the header comment there for all fields):

```yaml
my-list:
  name: My List
  url: https://example.org/list.txt   # https only
  homepage: https://example.org
  format: domains                     # hosts | domains
  license: MIT
  purpose: What it blocks
  verified: "2026-11-26"
  min_entries: 1000
```

Then add `my-list` to a module's `sources` in `config/modules.yml`. Only set sources active that you have checked
(URL, format, license, maintenance). Otherwise add `status: pending` with a `pending_reason` – pending sources are
documented in the catalog and the UI but never downloaded.

## Create a module

```yaml
modules:
  social:
    name: Social
    description: Social-media trackers.
    sources: [my-list]
    min_domains: 1000          # build fails if the result is smaller
    risk: { level: medium, text: May break embedded social widgets. }
```

## Create a device profile

```yaml
profiles:
  iot:
    name: IoT
    description: Smart-home devices
    modules: [advertising, malware]
```

The builder, catalog and UI pick it up automatically; the profile gets `lists/profiles/iot.txt`.

## Configure GitHub Pages

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions**: read-only is sufficient (workflows request what they need).
3. Run **Actions → Build and deploy → Run workflow** once. The site appears at `https://<user>.github.io/<repo>/`.
4. Optional: protect `main` and require the **Validate** checks.

Workflows: `validate.yml` (tests, config check, web tests/build; PRs and pushes), `build.yml` (daily at 03:17 UTC,
manual, and on config/engine/web changes: tests → build → validate → deploy), `deploy.yml` (manual trigger that re-dispatches
`build.yml`; deploys only ever happen after a validated build). Actions are pinned to commit SHAs (version in the comment);
update them deliberately. A failed build never reaches the `deploy` job, so the previous Pages version stays live.

## Use with Pi-hole

Admin → **Adlists** → add the profile or module URL, e.g.
`https://<user>.github.io/<repo>/lists/profiles/desktop.txt` → **Save**, then `pihole -g` (Tools → Update Gravity).
Pi-hole matches entries exactly; it does not block subdomains of listed names unless they are listed too.

## Use with AdGuard Home

**Filters → DNS blocklists → Add blocklist → Add a custom list**, name it, paste the URL. The `malware` module has
~260k entries; AdGuard Home needs enough RAM for large lists.

## Web configurator behaviour

- Predefined profiles and every module have **permanent, subscribable URLs**.
- Any other combination of modules is **assembled in your browser** from the published module files. It can be downloaded as TXT and shared as a link (`?p=desktop&m=advertising,malware`), but **has no permanent subscription URL**. Subscribe to the module URLs instead.
- Architecture note: custom combinations could later be published permanently via a validated GitHub-issue flow (an issue form → workflow validates module ids against `catalog.json` → adds a profile entry). The catalog schema and config-driven profiles already support this; it is not implemented.

## Sources and licenses

Source status, license and purpose are in `config/sources.yml` and at runtime in `data/catalog.json`.
Active at launch: StevenBlack/hosts (MIT), HaGeZi dns-blocklists (GPL-3.0; popupads, native trackers, TIF medium).
Pending (not downloaded): URLhaus (now needs an abuse.ch Auth-Key), Phishing.Database (size), Frogeye first-party
trackers and Peter Lowe's list (license not confirmed), WindowsSpyBlocker (stale data).

## Known limitations

- **Telemetry can break devices** (updates, app stores, push, voice assistants). Test first; use the allowlist.
- **Tracking is thin** – only one active source until broader, clearly licensed tracker lists are verified.
- The Advertising source (StevenBlack unified) also contains adware/malware entries, so modules overlap; profiles dedupe.
- Exact-domain matching: no wildcard/subdomain semantics in the generated hosts lists.
- Upstream data drifts; daily builds follow upstream, there is no snapshot pinning or diff review of upstream changes yet.
- The `malware` list is large (~7 MB); the `desktop` profile ~10 MB.
- The UI is English only.

## License

Code: [MIT](LICENSE). **Generated lists** include data from upstream sources under their own licenses
(HaGeZi: GPL-3.0; StevenBlack: MIT). Each list header names its sources and licenses; if you redistribute lists that
include GPL-3.0 data, comply with GPL-3.0 for that data.
