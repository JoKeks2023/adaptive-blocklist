"""Independent validation of a generated output directory.

Deliberately re-reads the written files instead of trusting builder state, so a
bug in the builder cannot silently produce a publishable but broken site.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .config import Config
from .domains import normalize_domain, parent_chain

HOSTS_PREFIX = "0.0.0.0 "


def _read_list(path: Path, problems: list[str]) -> list[str] | None:
    if not path.is_file():
        problems.append(f"missing file: {path}")
        return None
    domains: list[str] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line or line.startswith("#"):
            continue
        if not line.startswith(HOSTS_PREFIX):
            problems.append(f"{path.name}:{number}: not a '0.0.0.0 <domain>' line: {line[:80]!r}")
            continue
        domain = line[len(HOSTS_PREFIX):]
        if normalize_domain(domain) != domain:
            problems.append(f"{path.name}:{number}: invalid or non-normalised domain {domain!r}")
            continue
        domains.append(domain)
        if len(problems) > 50:
            problems.append("too many problems, aborting list check")
            break
    return domains


def validate_output(out_dir: Path, config: Config) -> list[str]:
    """Return a list of problems; an empty list means the output may be published."""
    problems: list[str] = []
    catalog_path = out_dir / "data" / "catalog.json"
    stats_path = out_dir / "data" / "stats.json"
    for p in (catalog_path, stats_path):
        if not p.is_file():
            return [f"missing file: {p}"]
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        json.loads(stats_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"]

    if catalog.get("build", {}).get("status") != "ok":
        problems.append("catalog build.status is not 'ok'")

    modules = {m["id"]: m for m in catalog.get("modules", [])}
    vendors = {v["id"]: v for v in catalog.get("vendors", [])}
    profiles = {p["id"]: p for p in catalog.get("profiles", [])}
    if set(modules) != set(config.modules):
        problems.append(f"catalog modules {sorted(modules)} != configured {sorted(config.modules)}")
    if set(profiles) != set(config.profiles):
        problems.append(f"catalog profiles {sorted(profiles)} != configured {sorted(config.profiles)}")

    module_sets: dict[str, set[str]] = {}
    if set(vendors) != set(config.vendors):
        problems.append(f"catalog vendors {sorted(vendors)} != configured {sorted(config.vendors)}")
    entries = (
        [("module", e) for e in modules.values()]
        + [("vendor", e) for e in vendors.values()]
        + [("profile", e) for e in profiles.values()]
    )
    vendor_sets: dict[str, set[str]] = {}
    for kind, entry in entries:
        path = out_dir / entry["file"]
        domains = _read_list(path, problems)
        if domains is None:
            continue
        label = f"{kind} '{entry['id']}'"
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            problems.append(f"{label}: sha256 mismatch with catalog")
        if len(domains) != entry["domains"]:
            problems.append(f"{label}: {len(domains)} domains in file but catalog says {entry['domains']}")
        if len(set(domains)) != len(domains):
            problems.append(f"{label}: contains duplicate domains")
        if domains != sorted(domains):
            problems.append(f"{label}: not sorted deterministically")
        if config.allow:
            leaked = next((d for d in domains if any(p in config.allow for p in parent_chain(d))), None)
            if leaked:
                problems.append(f"{label}: contains allow-listed domain {leaked!r}")
        if kind in ("module", "vendor"):
            (module_sets if kind == "module" else vendor_sets)[entry["id"]] = set(domains)
            cfg = (config.modules if kind == "module" else config.vendors).get(entry["id"])
            if cfg and not cfg.allow_empty and len(domains) < max(cfg.min_domains, 1):
                problems.append(f"{label}: {len(domains)} domains < min_domains {cfg.min_domains}")
        else:
            expected: set[str] = set()
            for m in entry["modules"]:
                expected |= module_sets.get(m, set())
            for v in entry.get("vendors", []):
                expected |= vendor_sets.get(v, set())
            if set(domains) != expected:
                problems.append(f"{label}: is not the union of its modules {entry['modules']} and vendors {entry.get('vendors', [])}")

    # Per-source lists: same file checks, and every module/vendor must equal the union of its
    # source lists (plus the deny list where configured), so the two views cannot drift apart.
    source_sets: dict[str, set[str]] = {}
    for src in catalog.get("sources", []):
        if not src.get("file"):
            continue
        path = out_dir / src["file"]
        domains = _read_list(path, problems)
        if domains is None:
            continue
        label = f"source '{src['id']}'"
        if hashlib.sha256(path.read_bytes()).hexdigest() != src["sha256"]:
            problems.append(f"{label}: sha256 mismatch with catalog")
        if len(domains) != src["listed"]:
            problems.append(f"{label}: {len(domains)} domains in file but catalog says {src['listed']}")
        if len(set(domains)) != len(domains) or domains != sorted(domains):
            problems.append(f"{label}: duplicates or not sorted")
        if config.allow and any(any(p in config.allow for p in parent_chain(d)) for d in domains):
            problems.append(f"{label}: contains allow-listed domains")
        source_sets[src["id"]] = set(domains)
    for kind, group, sets in (("module", config.modules, module_sets), ("vendor", config.vendors, vendor_sets)):
        for uid, unit in group.items():
            if uid not in sets:
                continue
            expected: set[str] = set()
            for sid in unit.sources:
                expected |= source_sets.get(sid, set())
            if unit.include_deny:
                expected |= {d for d in config.deny if not any(p in config.allow for p in parent_chain(d))}
            if sets[uid] != expected:
                problems.append(f"{kind} '{uid}': is not the union of its source lists")
    return problems
