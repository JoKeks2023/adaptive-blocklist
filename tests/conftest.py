from pathlib import Path

import pytest

from blocklist.builder import BuildMeta
from blocklist.config import Config, Module, Profile, Source

FIX = Path(__file__).parent / "fixtures"
META = BuildMeta(build_time="2026-01-01T00:00:00Z", commit="abcdef1234567890")


def make_source(sid, fmt="domains", status="active", min_entries=1, required=True, ratio=0.02):
    return Source(
        id=sid, name=sid.upper(), url=f"https://example.invalid/{sid}", format=fmt, homepage="https://example.invalid",
        license="MIT", license_url="", purpose="test", verified="2026-01-01", status=status,
        pending_reason="not verified" if status == "pending" else "", min_entries=min_entries,
        max_invalid_ratio=ratio, required=required,
    )


def make_module(mid, sources, min_domains=1, allow_empty=False, include_deny=False):
    return Module(id=mid, name=mid.title(), description=f"{mid} desc", sources=tuple(sources), risk=None,
                  min_domains=min_domains, allow_empty=allow_empty, include_deny=include_deny)


@pytest.fixture
def config():
    sources = {
        "ads-a": make_source("ads-a", "hosts"),
        "ads-b": make_source("ads-b", "domains"),
        "trk": make_source("trk", "domains"),
        "future": make_source("future", "domains", status="pending"),
    }
    modules = {
        "advertising": make_module("advertising", ["ads-a", "ads-b", "future"]),
        "tracking": make_module("tracking", ["trk"]),
    }
    profiles = {"desktop": Profile("desktop", "Desktop", "desc", ("advertising", "tracking"))}
    return Config(sources=sources, modules=modules, profiles=profiles)


CONTENT = {
    "https://example.invalid/ads-a": "0.0.0.0 ads.example.com\n0.0.0.0 Dup.example.com\n127.0.0.1 localhost\n",
    "https://example.invalid/ads-b": "dup.example.com\nbanner.example.net\n# c\n",
    "https://example.invalid/trk": "tracker.example.org\nads.example.com\n",
}


@pytest.fixture
def fetcher():
    def fetch(url):
        return CONTENT[url]
    return fetch
