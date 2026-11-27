"""Strict loading and validation of config/*.yml and overrides/*.txt."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .domains import normalize_domain
from .parser import SUPPORTED_FORMATS

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
RISK_LEVELS = ("low", "medium", "high")
SOURCE_STATUSES = ("active", "pending")


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Source:
    id: str
    name: str
    url: str
    format: str
    homepage: str
    license: str
    license_url: str
    purpose: str
    verified: str
    status: str  # "active" | "pending"
    pending_reason: str
    min_entries: int
    max_invalid_ratio: float
    required: bool


@dataclass(frozen=True)
class Risk:
    level: str
    text: str


@dataclass(frozen=True)
class Module:
    id: str
    name: str
    description: str
    sources: tuple[str, ...]
    risk: Risk | None
    min_domains: int
    allow_empty: bool
    include_deny: bool


@dataclass(frozen=True)
class Profile:
    id: str
    name: str
    description: str
    modules: tuple[str, ...]


@dataclass(frozen=True)
class Config:
    sources: dict[str, Source]
    modules: dict[str, Module]
    profiles: dict[str, Profile]
    allow: frozenset[str] = field(default_factory=frozenset)
    deny: frozenset[str] = field(default_factory=frozenset)


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"{path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ConfigError(f"{path}: top level must be a mapping")
    return data


def _require(mapping: dict, key: str, typ: type, where: str):
    value = mapping.get(key)
    if not isinstance(value, typ) or (typ is str and not value.strip()):
        raise ConfigError(f"{where}: '{key}' is required and must be a non-empty {typ.__name__}")
    return value


def _check_id(value: str, where: str) -> None:
    if not ID_RE.match(value):
        raise ConfigError(f"{where}: invalid id {value!r} (use lowercase letters, digits, '-')")


def _section(data: dict, key: str, path: Path) -> dict:
    section = data.get(key)
    if not isinstance(section, dict) or not section:
        raise ConfigError(f"{path}: '{key}' must be a non-empty mapping")
    return section


def load_sources(path: Path) -> dict[str, Source]:
    sources: dict[str, Source] = {}
    for sid, raw in _section(_load_yaml(path), "sources", path).items():
        where = f"{path}: source '{sid}'"
        _check_id(str(sid), where)
        if not isinstance(raw, dict):
            raise ConfigError(f"{where}: must be a mapping")
        fmt = _require(raw, "format", str, where)
        if fmt not in SUPPORTED_FORMATS:
            raise ConfigError(f"{where}: unsupported format {fmt!r} (supported: {', '.join(SUPPORTED_FORMATS)})")
        status = raw.get("status", "active")
        if status not in SOURCE_STATUSES:
            raise ConfigError(f"{where}: status must be one of {SOURCE_STATUSES}")
        url = _require(raw, "url", str, where)
        if not url.startswith("https://"):
            raise ConfigError(f"{where}: url must use https")
        pending_reason = str(raw.get("pending_reason", "") or "")
        if status == "pending" and not pending_reason:
            raise ConfigError(f"{where}: pending sources need a pending_reason")
        ratio = float(raw.get("max_invalid_ratio", 0.02))
        if not 0 <= ratio <= 1:
            raise ConfigError(f"{where}: max_invalid_ratio must be within 0..1")
        sources[str(sid)] = Source(
            id=str(sid),
            name=_require(raw, "name", str, where),
            url=url,
            format=fmt,
            homepage=_require(raw, "homepage", str, where),
            license=_require(raw, "license", str, where),
            license_url=str(raw.get("license_url", "") or ""),
            purpose=_require(raw, "purpose", str, where),
            verified=str(_require(raw, "verified", str, where)),
            status=status,
            pending_reason=pending_reason,
            min_entries=int(raw.get("min_entries", 1)),
            max_invalid_ratio=ratio,
            required=bool(raw.get("required", True)),
        )
    return sources


def load_modules(path: Path, sources: dict[str, Source]) -> dict[str, Module]:
    modules: dict[str, Module] = {}
    for mid, raw in _section(_load_yaml(path), "modules", path).items():
        where = f"{path}: module '{mid}'"
        _check_id(str(mid), where)
        if not isinstance(raw, dict):
            raise ConfigError(f"{where}: must be a mapping")
        refs = _require(raw, "sources", list, where)
        for ref in refs:
            if ref not in sources:
                raise ConfigError(f"{where}: unknown source {ref!r}")
        risk = None
        if raw.get("risk"):
            r = raw["risk"]
            if not isinstance(r, dict) or r.get("level") not in RISK_LEVELS or not r.get("text"):
                raise ConfigError(f"{where}: risk needs level ({'/'.join(RISK_LEVELS)}) and text")
            risk = Risk(level=r["level"], text=str(r["text"]).strip())
        modules[str(mid)] = Module(
            id=str(mid),
            name=_require(raw, "name", str, where),
            description=_require(raw, "description", str, where).strip(),
            sources=tuple(refs),
            risk=risk,
            min_domains=int(raw.get("min_domains", 1)),
            allow_empty=bool(raw.get("allow_empty", False)),
            include_deny=bool(raw.get("include_deny", False)),
        )
    return modules


def load_profiles(path: Path, modules: dict[str, Module]) -> dict[str, Profile]:
    profiles: dict[str, Profile] = {}
    for pid, raw in _section(_load_yaml(path), "profiles", path).items():
        where = f"{path}: profile '{pid}'"
        _check_id(str(pid), where)
        if not isinstance(raw, dict):
            raise ConfigError(f"{where}: must be a mapping")
        refs = _require(raw, "modules", list, where)
        if not refs:
            raise ConfigError(f"{where}: needs at least one module")
        for ref in refs:
            if ref not in modules:
                raise ConfigError(f"{where}: unknown module {ref!r}")
        profiles[str(pid)] = Profile(
            id=str(pid),
            name=_require(raw, "name", str, where),
            description=_require(raw, "description", str, where).strip(),
            modules=tuple(dict.fromkeys(refs)),
        )
    return profiles


def load_override(path: Path) -> frozenset[str]:
    """Read an override file (one domain per line, ``#`` comments). Invalid lines are errors."""
    if not path.exists():
        return frozenset()
    result: set[str] = set()
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        domain = normalize_domain(line)
        if domain is None:
            raise ConfigError(f"{path}:{number}: not a valid domain: {line!r}")
        result.add(domain)
    return frozenset(result)


def load_config(root: Path) -> Config:
    sources = load_sources(root / "config" / "sources.yml")
    modules = load_modules(root / "config" / "modules.yml", sources)
    profiles = load_profiles(root / "config" / "profiles.yml", modules)
    return Config(
        sources=sources,
        modules=modules,
        profiles=profiles,
        allow=load_override(root / "overrides" / "allow.txt"),
        deny=load_override(root / "overrides" / "deny.txt"),
    )
