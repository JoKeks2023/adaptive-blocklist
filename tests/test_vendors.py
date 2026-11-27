import dataclasses
import json
import shutil
from pathlib import Path

import pytest

from blocklist.builder import build_all, write_output
from blocklist.cli import main
from blocklist.config import Config, ConfigError, Profile, load_config
from blocklist.validator import validate_output

from .conftest import META, make_module

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def vconfig(config):
    vendors = {"acme": make_module("acme", ["trk"]), "globex": make_module("globex", ["ads-b"])}
    profiles = dict(config.profiles)
    profiles["tv"] = Profile("tv", "TV", "d", ("tracking",), ("acme",))
    return dataclasses.replace(config, vendors=vendors, profiles=profiles)


def lines(text):
    return [l[8:] for l in text.splitlines() if l.startswith("0.0.0.0 ")]


def test_vendor_lists_are_published_and_cataloged(vconfig, fetcher):
    out = build_all(vconfig, fetcher, META)
    assert out.problems == []
    assert lines(out.files["lists/vendors/acme.txt"]) == ["ads.example.com", "tracker.example.org"]
    cat = out.catalog
    assert [v["id"] for v in cat["vendors"]] == ["acme", "globex"]
    assert next(v for v in cat["vendors"] if v["id"] == "acme")["file"] == "lists/vendors/acme.txt"
    assert out.stats["totals"]["vendors"] == 2


def test_profile_is_union_of_modules_and_vendors(vconfig, fetcher):
    out = build_all(vconfig, fetcher, META)
    tv = next(p for p in out.catalog["profiles"] if p["id"] == "tv")
    assert tv["vendors"] == ["acme"] and tv["modules"] == ["tracking"]
    assert lines(out.files["lists/profiles/tv.txt"]) == ["ads.example.com", "tracker.example.org"]


def test_vendor_failure_fails_build(vconfig):
    from blocklist.downloader import DownloadError
    def broken(url):
        if url.endswith("ads-b"):
            raise DownloadError("down")
        return "tracker.example.org\n"
    out = build_all(vconfig, broken, META)
    assert any("vendor 'globex'" in p for p in out.problems)


def test_allowlist_applies_to_vendors(vconfig, fetcher):
    cfg = dataclasses.replace(vconfig, allow=frozenset({"example.org"}))
    out = build_all(cfg, fetcher, META)
    assert "tracker.example.org" not in out.files["lists/vendors/acme.txt"]


def test_validator_checks_vendors_and_profile_union(tmp_path, vconfig, fetcher):
    write_output(build_all(vconfig, fetcher, META), tmp_path)
    assert validate_output(tmp_path, vconfig) == []
    p = tmp_path / "lists/vendors/acme.txt"
    p.write_text(p.read_text() + "0.0.0.0 zzz.example.com\n")
    assert any("vendor 'acme'" in x for x in validate_output(tmp_path, vconfig))


def test_unknown_vendor_in_profile_is_a_config_error(tmp_path):
    shutil.copytree(ROOT / "config", tmp_path / "config")
    shutil.copytree(ROOT / "overrides", tmp_path / "overrides")
    (tmp_path / "config/profiles.yml").write_text(
        "profiles:\n  x:\n    name: X\n    description: d\n    modules: [malware]\n    vendors: [nope]\n"
    )
    with pytest.raises(ConfigError, match="unknown vendor"):
        load_config(tmp_path)


def test_shipped_profiles_reference_existing_vendors():
    cfg = load_config(ROOT)
    assert {"desktop", "smart-tv", "smart-home", "mobile", "gaming", "universal"} <= set(cfg.profiles)
    assert set(cfg.profiles["smart-tv"].vendors) <= set(cfg.vendors)
    assert main(["--root", str(ROOT), "check-config"]) == 0


def test_suggested_vendors_exist_and_defaults_are_empty():
    cfg = load_config(ROOT)
    for p in cfg.profiles.values():
        assert set(p.suggested_vendors) <= set(cfg.vendors)
    # nothing is blocked for a brand the user did not pick
    assert cfg.profiles["smart-tv"].vendors == () and "samsung" in cfg.profiles["smart-tv"].suggested_vendors


def test_unknown_suggested_vendor_is_a_config_error(tmp_path):
    shutil.copytree(ROOT / "config", tmp_path / "config")
    shutil.copytree(ROOT / "overrides", tmp_path / "overrides")
    (tmp_path / "config/profiles.yml").write_text(
        "profiles:\n  x:\n    name: X\n    description: d\n    modules: [malware]\n    suggested_vendors: [nope]\n"
    )
    with pytest.raises(ConfigError, match="suggested vendor"):
        load_config(tmp_path)
