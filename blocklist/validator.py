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
    profiles = {p["id"]: p for p in catalog.get("profiles", [])}
    if set(modules) != set(config.modules):
        problems.append(f"catalog modules {sorted(modules)} != configured {sorted(config.modules)}")
    if set(profiles) != set(config.profiles):
        problems.append(f"catalog profiles {sorted(profiles)} != configured {sorted(config.profiles)}")

    module_sets: dict[str, set[str]] = {}
    entries = [("module", e) for e in modules.values()] + [("profile", e) for e in profiles.values()]
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
        if kind == "module":
            module_sets[entry["id"]] = set(domains)
            cfg = config.modules.get(entry["id"])
            if cfg and not cfg.allow_empty and len(domains) < max(cfg.min_domains, 1):
                problems.append(f"{label}: {len(domains)} domains < min_domains {cfg.min_domains}")
        else:
            expected: set[str] = set()
            for m in entry["modules"]:
                expected |= module_sets.get(m, set())
            if set(domains) != expected:
                problems.append(f"{label}: is not the union of its modules {entry['modules']}")
    return problems
