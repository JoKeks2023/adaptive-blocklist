import io
import urllib.error

import pytest

from blocklist import downloader
from blocklist.downloader import DownloadError, make_fetcher


def test_rejects_non_https():
    with pytest.raises(DownloadError):
        make_fetcher()("http://example.invalid/list")


def test_retries_then_succeeds(monkeypatch):
    calls = []
    def flaky(url, timeout, max_bytes):
        calls.append(1)
        if len(calls) < 3:
            raise urllib.error.URLError("boom")
        return "ok"
    monkeypatch.setattr(downloader, "_fetch_once", flaky)
    sleeps = []
    assert make_fetcher(retries=3, sleep=sleeps.append)("https://example.invalid/x") == "ok"
    assert len(calls) == 3 and sleeps == [2.0, 4.0]


def test_gives_up_after_retries(monkeypatch):
    monkeypatch.setattr(downloader, "_fetch_once", lambda *a: (_ for _ in ()).throw(TimeoutError("slow")))
    with pytest.raises(DownloadError):
        make_fetcher(retries=2, sleep=lambda s: None)("https://example.invalid/x")


def test_404_is_not_retried(monkeypatch):
    calls = []
    def not_found(url, timeout, max_bytes):
        calls.append(1)
        raise urllib.error.HTTPError(url, 404, "nf", {}, io.BytesIO())
    monkeypatch.setattr(downloader, "_fetch_once", not_found)
    with pytest.raises(DownloadError):
        make_fetcher(retries=3, sleep=lambda s: None)("https://example.invalid/x")
    assert len(calls) == 1
