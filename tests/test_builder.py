import dataclasses
import json

import pytest

from blocklist.builder import FAILED, INVALID_FORMAT, OK, PENDING, TOO_SMALL, apply_allowlist, build_all, fetch_source
from blocklist.downloader import DownloadError

from .conftest import META, make_module, make_source


def test_dedupe_and_normalisation_within_module(config, fetcher):
    out = build_all(config, fetcher, META)
    assert out.problems == []
    lines = [l for l in out.files["lists/modules/advertising.txt"].splitlines() if not l.startswith("#")]
    assert lines == [
        "0.0.0.0 ads.example.com",
        "0.0.0.0 banner.example.net",
        "0.0.0.0 dup.example.com",  # "Dup.example.com" + "dup.example.com" -> one lowercase entry
    ]


def test_profile_is_union_of_modules_and_deduped(config, fetcher):
    out = build_all(config, fetcher, META)
    lines = [l[8:] for l in out.files["lists/profiles/desktop.txt"].splitlines() if not l.startswith("#")]
    assert lines == sorted(set(lines))
    assert set(lines) == {"ads.example.com", "banner.example.net", "dup.example.com", "tracker.example.org"}


def test_allowlist_removes_domain_and_subdomains(config, fetcher):
    config = dataclasses.replace(config, allow=frozenset({"example.com"}))
    out = build_all(config, fetcher, META)
    adv = out.files["lists/modules/advertising.txt"]
    assert "example.com" not in adv
    assert "banner.example.net" in adv  # different registrable domain is untouched


def test_allowlist_does_not_match_sibling_suffix():
    assert apply_allowlist({"badexample.com", "x.example.com", "example.com"}, frozenset({"example.com"})) == {"badexample.com"}


def test_pending_sources_are_not_downloaded_but_documented(config, fetcher):
    seen = []
    def spy(url):
        seen.append(url)
        return fetcher(url)
    out = build_all(config, spy, META)
    assert not any("future" in u for u in seen)
    adv = next(m for m in out.catalog["modules"] if m["id"] == "advertising")
    assert adv["pending_sources"] == ["future"]
    fut = next(s for s in out.catalog["sources"] if s["id"] == "future")
    assert fut["status"] == PENDING and fut["error"] == "not verified"


def test_failed_required_source_fails_build(config, fetcher):
    def broken(url):
        if url.endswith("ads-b"):
            raise DownloadError("timeout")
        return fetcher(url)
    out = build_all(config, broken, META)
    assert out.catalog["build"]["status"] == "failed"
    assert any("ads-b" in p and "failed" in p for p in out.problems)


def test_optional_source_failure_does_not_fail_module(config, fetcher):
    sources = dict(config.sources)
    sources["ads-b"] = make_source("ads-b", "domains", required=False)
    config = dataclasses.replace(config, sources=sources)
    def broken(url):
        if url.endswith("ads-b"):
            raise DownloadError("timeout")
        return fetcher(url)
    out = build_all(config, broken, META)
    assert out.problems == []
    status = {s["id"]: s["status"] for s in out.catalog["sources"]}
    assert status["ads-b"] == FAILED


def test_empty_source_marks_too_small():
    r = fetch_source(make_source("x"), lambda url: "# nothing here\n")
    assert r.status == TOO_SMALL


def test_min_entries_guards_truncated_download():
    r = fetch_source(make_source("x", min_entries=3), lambda url: "a.example.com\nb.example.com\n")
    assert r.status == TOO_SMALL


def test_wrong_format_detected_not_guessed():
    r = fetch_source(make_source("x", "domains"), lambda url: "||a.example.com^\n||b.example.com^\n")
    assert r.status == INVALID_FORMAT and not r.domains


def test_html_error_page_is_rejected():
    html = "<html>\n<head><title>503</title></head>\n<body>Service Unavailable</body>\n</html>\n"
    assert fetch_source(make_source("x", "domains"), lambda url: html).status == INVALID_FORMAT


def test_min_domains_guard(config, fetcher):
    modules = dict(config.modules)
    modules["tracking"] = make_module("tracking", ["trk"], min_domains=50)
    out = build_all(dataclasses.replace(config, modules=modules), fetcher, META)
    assert any("min_domains" in p for p in out.problems)


def test_custom_module_with_deny_and_empty_allowed(config, fetcher):
    modules = dict(config.modules)
    modules["custom"] = make_module("custom", [], allow_empty=True, include_deny=True)
    cfg = dataclasses.replace(config, modules=modules)
    assert build_all(cfg, fetcher, META).problems == []
    cfg = dataclasses.replace(cfg, deny=frozenset({"mine.example.com"}))
    assert "0.0.0.0 mine.example.com" in build_all(cfg, fetcher, META).files["lists/modules/custom.txt"]


def test_new_profile_needs_no_code_change(config, fetcher):
    from blocklist.config import Profile
    profiles = dict(config.profiles)
    profiles["iot"] = Profile("iot", "IoT", "d", ("tracking",))
    out = build_all(dataclasses.replace(config, profiles=profiles), fetcher, META)
    assert "lists/profiles/iot.txt" in out.files
    assert next(p for p in out.catalog["profiles"] if p["id"] == "iot")["domains"] == 2


def test_deterministic_output(config, fetcher):
    a = build_all(config, fetcher, META)
    b = build_all(config, lambda u: fetcher(u), META)
    assert a.files == b.files
    # input order must not matter either
    reordered = {k: v for k, v in reversed(list(__import__("tests.conftest", fromlist=["CONTENT"]).CONTENT.items()))}
    c = build_all(config, lambda u: reordered[u], META)
    assert a.files == c.files


def test_catalog_metadata_complete(config, fetcher):
    out = build_all(config, fetcher, META)
    cat = json.loads(out.files["data/catalog.json"])
    assert cat["build"]["commit"] == META.commit and cat["build"]["time"] == META.build_time
    assert {"modules", "profiles", "sources", "build", "schema_version"} <= set(cat)
    stats = json.loads(out.files["data/stats.json"])
    assert stats["totals"]["sources_pending"] == 1 and stats["totals"]["sources_ok"] == 3


def test_per_source_lists_are_published_and_modules_are_their_union(config, fetcher, tmp_path):
    from blocklist.builder import build_all, write_output
    from blocklist.validator import validate_output
    from .conftest import META

    out = build_all(config, fetcher, META)
    assert not out.problems
    assert "lists/sources/ads-a.txt" in out.files and "lists/sources/future.txt" not in out.files
    src = {s["id"]: s for s in out.catalog["sources"]}
    assert src["ads-a"]["file"] == "lists/sources/ads-a.txt" and src["ads-a"]["listed"] == 2
    assert src["future"]["file"] is None
    write_output(out, tmp_path)
    assert validate_output(tmp_path, config) == []
    # tampering with a source list must be caught
    p = tmp_path / "lists/sources/trk.txt"
    p.write_text(p.read_text() + "0.0.0.0 extra.example.org\n")
    assert any("source 'trk'" in x for x in validate_output(tmp_path, config))
