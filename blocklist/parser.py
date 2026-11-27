"""Parsers for the two supported input formats: ``hosts`` and ``domains``.

The format is declared per source in ``config/sources.yml``; there is no
auto-detection. Lines that do not match the declared format are counted as
invalid (and the source fails if too many are), never guessed at.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .domains import is_reserved, normalize_domain

SUPPORTED_FORMATS = ("hosts", "domains")
_SINK_IPS = frozenset({"0.0.0.0", "127.0.0.1", "::", "::1"})
_SAMPLE_LIMIT = 5


@dataclass
class ParseResult:
    domains: set[str] = field(default_factory=set)
    entries: int = 0  # candidate entries (valid + invalid), excl. comments/blank/reserved
    invalid: int = 0
    invalid_samples: list[str] = field(default_factory=list)

    @property
    def invalid_ratio(self) -> float:
        return self.invalid / self.entries if self.entries else 0.0

    def _reject(self, line: str) -> None:
        self.invalid += 1
        if len(self.invalid_samples) < _SAMPLE_LIMIT:
            self.invalid_samples.append(line[:120])


def _strip_comment(line: str) -> str:
    hash_pos = line.find("#")
    if hash_pos != -1:
        line = line[:hash_pos]
    return line.strip()


def parse(text: str, fmt: str) -> ParseResult:
    if fmt == "hosts":
        return _parse_hosts(text)
    if fmt == "domains":
        return _parse_domains(text)
    raise ValueError(f"unsupported format: {fmt!r} (supported: {', '.join(SUPPORTED_FORMATS)})")


def _parse_hosts(text: str) -> ParseResult:
    result = ParseResult()
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if not line:
            continue
        tokens = line.split()
        ip, hostnames = tokens[0], tokens[1:]
        if hostnames and all(is_reserved(h) for h in hostnames):
            continue  # localhost / broadcasthost boilerplate, whatever IP it uses
        if ip not in _SINK_IPS or not hostnames:
            result.entries += 1
            result._reject(raw)
            continue
        for host in hostnames:
            if is_reserved(host):
                continue
            result.entries += 1
            domain = normalize_domain(host)
            if domain is None:
                result._reject(host)
            else:
                result.domains.add(domain)
    return result


def _parse_domains(text: str) -> ParseResult:
    result = ParseResult()
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if not line:
            continue
        if " " in line or "\t" in line:
            result.entries += 1
            result._reject(raw)
            continue
        if is_reserved(line):
            continue
        result.entries += 1
        domain = normalize_domain(line)
        if domain is None:
            result._reject(line)
        else:
            result.domains.add(domain)
    return result
