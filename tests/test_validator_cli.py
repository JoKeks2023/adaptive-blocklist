import json
import shutil
from pathlib import Path

import pytest

from blocklist.builder import build_all, write_output
from blocklist.cli import main
from blocklist.validator import validate_output

from .conftest import META

ROOT = Path(__file__).resolve().parents[1]


def test_valid_output_passes(tmp_path, config, fetcher):
    write_output(build_all(config, fetcher, META), tmp_path)
    assert validate_output(tmp_path, config) == []


def test_tampered_list_is_caught(tmp_path, config, fetcher):
    write_output(build_all(config, fetcher, META), tmp_path)
    p = tmp_path / "lists/modules/tracking.txt"
    p.write_text(p.read_text() + "0.0.0.0 evil.example.com\n")
    problems = validate_output(tmp_path, config)
    assert any("sha256" in x for x in problems) and any("sorted" in x or "domains in file" in x for x in problems)


def test_garbage_line_is_caught(tmp_path, config, fetcher):
    write_output(build_all(config, fetcher, META), tmp_path)
    p = tmp_path / "lists/modules/tracking.txt"
    p.write_text(p.read_text() + "<html>oops\n")
    assert any("not a '0.0.0.0" in x for x in validate_output(tmp_path, config))


def test_missing_file_is_caught(tmp_path, config, fetcher):
    write_output(build_all(config, fetcher, META), tmp_path)
    (tmp_path / "lists/profiles/desktop.txt").unlink()
    assert any("missing file" in x for x in validate_output(tmp_path, config))


def test_failed_build_catalog_is_not_valid(tmp_path, config):
    out = build_all(config, lambda u: "", META)
    write_output(out, tmp_path)
    assert validate_output(tmp_path, config)


def test_shipped_config_is_valid():
    assert main(["--root", str(ROOT), "check-config"]) == 0


def test_cli_failed_build_does_not_replace_previous_output(tmp_path, monkeypatch, capsys):
    """A failing build must leave the previously published files untouched."""
    root = tmp_path / "repo"
    shutil.copytree(ROOT / "config", root / "config")
    shutil.copytree(ROOT / "overrides", root / "overrides")
    out = tmp_path / "out"
    (out / "lists/modules").mkdir(parents=True)
    previous = out / "lists/modules/advertising.txt"
    previous.write_text("0.0.0.0 previous.example.com\n")

    from blocklist import cli
    from blocklist.downloader import DownloadError
    def always_fail(url):
        raise DownloadError("network down")
    monkeypatch.setattr(cli, "make_fetcher", lambda **kw: always_fail)
    rc = main(["--root", str(root), "build", "--out", str(out), "--commit", "abc", "--report", str(tmp_path / "r.json")])
    assert rc == 1
    assert previous.read_text() == "0.0.0.0 previous.example.com\n"
    report = json.loads((tmp_path / "r.json").read_text())
    assert report["problems"] and report["catalog"]["build"]["status"] == "failed"
