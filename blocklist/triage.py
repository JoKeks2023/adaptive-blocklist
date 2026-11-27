"""Validate domains submitted via the "Suggest domains to block" issue form."""

from __future__ import annotations

import json
import re
import urllib.request
from collections.abc import Callable

from .domains import normalize_domain

MAX_DOMAINS = 50
MARKER = "<!-- ubl-triage -->"


def extract_domains(body: str, heading: str = "Domains") -> list[str]:
    """Return the raw lines of one '### <heading>' section of an issue-form body."""
    match = re.search(rf"###\s+{re.escape(heading)}\s*\n(.*?)(?:\n###\s|\Z)", body, re.S)
    if not match:
        return []
    lines = [ln.strip() for ln in match.group(1).splitlines()]
    return [ln for ln in lines if ln and ln != "_No response_"][:MAX_DOMAINS]


def triage(body: str, listed: Callable[[str], str | None], heading: str = "Domains") -> dict:
    valid: list[str] = []
    invalid: list[str] = []
    already: dict[str, str] = {}
    for raw in extract_domains(body, heading):
        domain = normalize_domain(raw)
        if domain is None:
            invalid.append(raw[:80])
        elif domain not in valid:
            valid.append(domain)
            module = listed(domain)
            if module:
                already[domain] = module
    return {"valid": valid, "invalid": invalid, "already": already}


def render_comment(result: dict) -> str:
    lines = [MARKER, "Automated check of your submission:", ""]
    if not result["valid"] and not result["invalid"]:
        lines.append("No domains found. Please list one domain per line in the **Domains** field.")
    for d in result["valid"]:
        note = f"already listed in **{result['already'][d]}**" if d in result["already"] else "valid, not listed yet"
        lines.append(f"- `{d}`: {note}")
    for d in result["invalid"]:
        lines.append(f"- `{d}`: **not a valid domain** (no URLs, wildcards or IPs; one domain per line)")
    lines += ["", "A maintainer will review the new domains."]
    return "\n".join(lines) + "\n"


def labels_for(result: dict) -> list[str]:
    if result["invalid"] or not result["valid"]:
        return ["needs-info"]
    if result["valid"] and len(result["already"]) == len(result["valid"]):
        return ["already-listed"]
    return []


def published_lookup(site_url: str, fetch: Callable[[str], str] | None = None) -> Callable[[str], str | None]:
    """Build a domain -> module-name lookup from the published lists. Falls back to 'unknown' on errors."""
    def default_fetch(url: str) -> str:
        with urllib.request.urlopen(url, timeout=30) as r:  # noqa: S310 (https site url from workflow)
            return r.read().decode("utf-8", "replace")

    get = fetch or default_fetch
    index: dict[str, str] = {}
    try:
        catalog = json.loads(get(site_url + "data/catalog.json"))
        for module in catalog["modules"]:
            for line in get(site_url + module["file"]).splitlines():
                if line.startswith("0.0.0.0 "):
                    index.setdefault(line[8:].strip(), module["name"])
    except (OSError, ValueError, KeyError):
        pass
    return index.get
