"""Build engine: download -> parse -> normalise -> dedupe -> allow/deny -> compose.

The engine is pure with respect to its inputs (config + fetcher + build metadata),
so results are deterministic: same inputs -> byte-identical list files.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from . import __version__
from .config import Config, Module, Profile, Source
from .domains import parent_chain
from .downloader import DownloadError, Fetcher
from .parser import parse

SCHEMA_VERSION = 1

# Source / build statuses
OK = "ok"
FAILED = "failed"
INVALID_FORMAT = "invalid_format"
TOO_SMALL = "too_small"
PENDING = "pending"


class BuildError(Exception):
    """Raised when the build must not be published."""

    def __init__(self, message: str, problems: list[str]):
        super().__init__(message)
        self.problems = problems


@dataclass
class SourceResult:
    source: Source
    status: str
    domains: frozenset[str] = frozenset()
    entries: int = 0
    invalid: int = 0
    invalid_samples: list[str] = field(default_factory=list)
    error: str = ""
    seconds: float = 0.0


@dataclass
class BuildMeta:
    build_time: str  # ISO 8601 UTC
    commit: str
    repository: str = ""


@dataclass
class BuildOutput:
    files: dict[str, str]  # relative path -> text content
    catalog: dict
    stats: dict
    problems: list[str]


def fetch_source(source: Source, fetcher: Fetcher) -> SourceResult:
    if source.status == "pending":
        return SourceResult(source, PENDING, error=source.pending_reason)
    started = time.monotonic()
    try:
        text = fetcher(source.url)
    except (DownloadError, OSError) as exc:
        return SourceResult(source, FAILED, error=str(exc), seconds=time.monotonic() - started)
    parsed = parse(text, source.format)
    base = dict(
        domains=frozenset(parsed.domains),
        entries=parsed.entries,
        invalid=parsed.invalid,
        invalid_samples=parsed.invalid_samples,
        seconds=round(time.monotonic() - started, 2),
    )
    if parsed.entries and parsed.invalid_ratio > source.max_invalid_ratio:
        return SourceResult(
            source,
            INVALID_FORMAT,
            error=f"{parsed.invalid}/{parsed.entries} entries invalid for declared format '{source.format}' "
            f"(limit {source.max_invalid_ratio:.1%})",
            **base,
        )
    if len(parsed.domains) < max(source.min_entries, 1):
        return SourceResult(
            source,
            TOO_SMALL,
            error=f"only {len(parsed.domains)} valid domains, expected at least {max(source.min_entries, 1)}",
            **base,
        )
    return SourceResult(source, OK, **base)


def apply_allowlist(domains: set[str] | frozenset[str], allow: frozenset[str]) -> set[str]:
    """Remove allow-listed domains *and all their subdomains*."""
    if not allow:
        return set(domains)
    return {d for d in domains if not any(p in allow for p in parent_chain(d))}


def build_module(
    module: Module, results: dict[str, SourceResult], config: Config
) -> tuple[set[str], list[str]]:
    problems: list[str] = []
    domains: set[str] = set()
    for sid in module.sources:
        result = results[sid]
        if result.status == PENDING:
            continue
        if result.status == OK:
            domains |= result.domains
        elif result.source.required:
            problems.append(f"module '{module.id}': required source '{sid}' {result.status}: {result.error}")
        else:
            # optional source failed -> module would be incomplete, but explicitly allowed by config
            pass
    if module.include_deny:
        domains |= config.deny
    domains = apply_allowlist(domains, config.allow)
    if not module.allow_empty and len(domains) < max(module.min_domains, 1):
        problems.append(f"module '{module.id}': {len(domains)} domains < min_domains {module.min_domains}")
    return domains, problems


def render_list(title: str, description: str, domains: list[str], meta: BuildMeta, sources: list[Source], note: str = "") -> str:
    lines = [
        f"# Title: {title}",
        f"# Description: {description}",
        f"# Domains: {len(domains)}",
        f"# Build: {meta.build_time} ({meta.commit})",
        "# Format: hosts (0.0.0.0 <domain>); exact-domain entries, no wildcard semantics",
    ]
    if note:
        lines.append(f"# Note: {note}")
    if sources:
        lines.append("# Sources (see data/catalog.json for details):")
        for s in sources:
            lines.append(f"#   - {s.name} <{s.homepage}> license: {s.license}")
    lines.append("#")
    lines.extend(f"0.0.0.0 {d}" for d in domains)
    return "\n".join(lines) + "\n"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_all(config: Config, fetcher: Fetcher, meta: BuildMeta) -> BuildOutput:
    problems: list[str] = []
    files: dict[str, str] = {}

    # 1. Fetch every referenced source once.
    units = {**config.modules, **config.vendors}
    needed = dict.fromkeys(sid for m in units.values() for sid in m.sources)
    results = {sid: fetch_source(config.sources[sid], fetcher) for sid in needed}

    # 2. Modules (content categories) and vendors (per-manufacturer lists) are built identically.
    def build_unit(unit: Module, kind: str) -> tuple[set[str], dict]:
        domains, unit_problems = build_module(unit, results, config)
        problems.extend(p.replace("module '", f"{kind} '", 1) for p in unit_problems)
        active = [config.sources[s] for s in unit.sources if results[s].status != PENDING]
        text = render_list(
            f"Universal Blocklist - {unit.name}",
            unit.description,
            sorted(domains),
            meta,
            active,
            note=unit.risk.text if unit.risk else "",
        )
        path = f"lists/{kind}s/{unit.id}.txt"
        files[path] = text
        entry = {
            "id": unit.id,
            "name": unit.name,
            "description": unit.description,
            "risk": {"level": unit.risk.level, "text": unit.risk.text} if unit.risk else None,
            "domains": len(domains),
            "file": path,
            "sha256": _sha256(text),
            "bytes": len(text.encode("utf-8")),
            "sources": [s for s in unit.sources if results[s].status != PENDING],
            "pending_sources": [s for s in unit.sources if results[s].status == PENDING],
            "include_deny": unit.include_deny,
        }
        return domains, entry

    module_domains: dict[str, set[str]] = {}
    module_entries = []
    for module in config.modules.values():
        module_domains[module.id], entry = build_unit(module, "module")
        module_entries.append(entry)
    vendor_domains: dict[str, set[str]] = {}
    vendor_entries = []
    for vendor in config.vendors.values():
        vendor_domains[vendor.id], entry = build_unit(vendor, "vendor")
        vendor_entries.append(entry)

    # 3. Profiles (union of their modules and vendors)
    profile_entries = []
    for profile in config.profiles.values():
        domains = set().union(
            *(module_domains[m] for m in profile.modules), *(vendor_domains[v] for v in profile.vendors)
        )
        used: list[Source] = []
        members = [config.modules[m] for m in profile.modules] + [config.vendors[v] for v in profile.vendors]
        for member in members:
            for s in member.sources:
                if results[s].status != PENDING and config.sources[s] not in used:
                    used.append(config.sources[s])
        risks = [m.risk.text for m in members if m.risk]
        note = f"Modules: {', '.join(profile.modules) or '-'}; vendors: {', '.join(profile.vendors) or '-'}"
        text = render_list(f"Universal Blocklist - Profile {profile.name}", profile.description, sorted(domains), meta, used, note=note)
        path = f"lists/profiles/{profile.id}.txt"
        files[path] = text
        profile_entries.append(
            {
                "id": profile.id,
                "name": profile.name,
                "description": profile.description,
                "modules": list(profile.modules),
                "vendors": list(profile.vendors),
                "domains": len(domains),
                "file": path,
                "sha256": _sha256(text),
                "bytes": len(text.encode("utf-8")),
                "risk_notes": risks,
            }
        )

    # 4. Metadata
    source_entries = []
    for sid, source in config.sources.items():
        result = results.get(sid)
        status = result.status if result else (PENDING if source.status == "pending" else "unused")
        source_entries.append(
            {
                "id": sid,
                "name": source.name,
                "url": source.url,
                "homepage": source.homepage,
                "license": source.license,
                "license_url": source.license_url,
                "purpose": source.purpose,
                "format": source.format,
                "verified": source.verified,
                "status": status,
                "domains": len(result.domains) if result else 0,
                "invalid_entries": result.invalid if result else 0,
                "error": (result.error if result else source.pending_reason) or None,
                "modules": [m.id for m in config.modules.values() if sid in m.sources],
                "vendors": [v.id for v in config.vendors.values() if sid in v.sources],
            }
        )
    build = {
        "time": meta.build_time,
        "commit": meta.commit,
        "version": f"{meta.build_time[:10].replace('-', '.')}+{meta.commit[:7]}",
        "generator": f"universal-blocklist {__version__}",
        "repository": meta.repository,
        "status": "ok" if not problems else "failed",
    }
    catalog = {
        "schema_version": SCHEMA_VERSION,
        "build": build,
        "modules": module_entries,
        "vendors": vendor_entries,
        "profiles": profile_entries,
        "sources": source_entries,
    }
    active_count = sum(1 for e in source_entries if e["status"] == OK)
    stats = {
        "schema_version": SCHEMA_VERSION,
        "build": build,
        "totals": {
            "modules": len(module_entries),
            "vendors": len(vendor_entries),
            "profiles": len(profile_entries),
            "sources_configured": len(source_entries),
            "sources_ok": active_count,
            "sources_pending": sum(1 for e in source_entries if e["status"] == PENDING),
            "sources_failed": sum(1 for e in source_entries if e["status"] not in (OK, PENDING, "unused")),
            "unique_domains_all_modules": len(set().union(*module_domains.values(), *vendor_domains.values())),
        },
        "modules": {e["id"]: {"domains": e["domains"], "bytes": e["bytes"]} for e in module_entries},
        "vendors": {e["id"]: {"domains": e["domains"], "bytes": e["bytes"]} for e in vendor_entries},
        "profiles": {e["id"]: {"domains": e["domains"], "bytes": e["bytes"]} for e in profile_entries},
        "sources": {
            e["id"]: {"status": e["status"], "domains": e["domains"], "invalid_entries": e["invalid_entries"], "error": e["error"]}
            for e in source_entries
        },
    }
    files["data/catalog.json"] = json.dumps(catalog, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    files["data/stats.json"] = json.dumps(stats, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    return BuildOutput(files=files, catalog=catalog, stats=stats, problems=problems)


def write_output(output: BuildOutput, out_dir: Path) -> None:
    """Write all files. Caller must only call this for a successful, validated build."""
    for rel, text in output.files.items():
        target = out_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
