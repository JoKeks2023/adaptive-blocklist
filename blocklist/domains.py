"""Domain normalisation and validation.

Only syntactically valid, fully qualified hostnames are accepted. Everything
else (IP addresses, single labels, wildcards, URLs, adblock syntax, ...) is
rejected so that unknown formats never slip through as "domains".
"""

from __future__ import annotations

import re

_LABEL_RE = re.compile(r"^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$")
_TLD_RE = re.compile(r"^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$")
_IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

# Entries that appear in hosts files but are not blocklist entries.
RESERVED_HOSTNAMES = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "local",
        "broadcasthost",
        "ip6-localhost",
        "ip6-loopback",
        "ip6-localnet",
        "ip6-mcastprefix",
        "ip6-allnodes",
        "ip6-allrouters",
        "ip6-allhosts",
        "0.0.0.0",
    }
)


def normalize_domain(raw: str) -> str | None:
    """Return the normalised domain or ``None`` if ``raw`` is not a valid hostname.

    Normalisation: strip, lowercase, drop one trailing dot, IDN -> punycode.
    """
    value = raw.strip().lower()
    if value.endswith("."):
        value = value[:-1]
    if not value or len(value) > 253:
        return None
    if not value.isascii():
        try:
            value = value.encode("idna").decode("ascii")
        except UnicodeError:
            return None
        if len(value) > 253:
            return None
    if _IPV4_RE.match(value):
        return None
    labels = value.split(".")
    if len(labels) < 2:
        return None
    if not all(_LABEL_RE.match(label) for label in labels):
        return None
    if not _TLD_RE.match(labels[-1]):
        return None
    return value


def is_reserved(hostname: str) -> bool:
    return hostname.strip().lower() in RESERVED_HOSTNAMES


def parent_chain(domain: str):
    """Yield ``domain`` and all its parent domains (``a.b.c`` -> ``a.b.c``, ``b.c``)."""
    yield domain
    pos = domain.find(".")
    while pos != -1:
        parent = domain[pos + 1 :]
        if "." not in parent:
            return
        yield parent
        pos = domain.find(".", pos + 1)
