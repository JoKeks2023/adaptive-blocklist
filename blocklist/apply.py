"""Maintainer-approved application of issue requests to overrides/*.txt.

``/accept`` on a ``domain-request`` issue  -> adds the validated domains to overrides/deny.txt
``/allow``  on a ``false-positive`` issue   -> adds the validated domains to overrides/allow.txt

Only domains that pass ``normalize_domain`` are ever written; issue text is never
executed or interpolated into shell commands.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from .config import load_override
from .triage import triage

COMMANDS = {
    "/accept": ("domain-request", "deny", "Domains"),
    "/allow": ("false-positive", "allow", "Blocked domain(s)"),
}


def parse_command(comment: str) -> str | None:
    words = comment.strip().split()
    return words[0].lower() if words and words[0].lower() in COMMANDS else None


def apply_request(
    command: str,
    issue_number: int,
    issue_body: str,
    labels: list[str],
    overrides_dir: Path,
    listed: Callable[[str], str | None],
) -> tuple[list[str], str]:
    """Return (added domains, comment markdown). Writes the override file when something is added."""
    required_label, target, heading = COMMANDS[command]
    if required_label not in labels:
        return [], f"`{command}` only works on issues labelled `{required_label}`."
    result = triage(issue_body, listed, heading)
    path = overrides_dir / f"{target}.txt"
    existing = load_override(path)
    new = [d for d in result["valid"] if d not in existing]
    if target == "deny":
        new = [d for d in new if d not in result["already"]]
    lines = []
    if new:
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        if text and not text.endswith("\n"):
            text += "\n"
        text += f"# issue #{issue_number}\n" + "".join(f"{d}\n" for d in new)
        path.write_text(text, encoding="utf-8")
        lines.append(f"Added to `overrides/{target}.txt`: " + ", ".join(f"`{d}`" for d in new))
        lines.append("A new build is starting; the lists update in a few minutes.")
    else:
        lines.append("Nothing to add: no new valid domains (already present or already listed).")
    if result["invalid"]:
        lines.append("Skipped invalid entries: " + ", ".join(f"`{d}`" for d in result["invalid"]))
    return new, "\n\n".join(lines) + "\n"
