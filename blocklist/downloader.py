"""HTTP downloader with timeout, retries and a hard size limit.

Downloaded content is only ever treated as text data - it is never executed
or interpreted as code.
"""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from collections.abc import Callable
from urllib.parse import urlparse

USER_AGENT = "universal-blocklist-builder/0.1 (+https://github.com/topics/dns-blocklist)"
MAX_BYTES = 64 * 1024 * 1024

Fetcher = Callable[[str], str]


class DownloadError(Exception):
    pass


def make_fetcher(
    timeout: float = 30.0,
    retries: int = 3,
    backoff: float = 2.0,
    max_bytes: int = MAX_BYTES,
    sleep: Callable[[float], None] = time.sleep,
) -> Fetcher:
    def fetch(url: str) -> str:
        if urlparse(url).scheme != "https":
            raise DownloadError(f"only https URLs are allowed: {url}")
        last_error: Exception | None = None
        for attempt in range(1, retries + 1):
            try:
                return _fetch_once(url, timeout, max_bytes)
            except (urllib.error.URLError, TimeoutError, OSError, DownloadError) as exc:
                last_error = exc
                # 4xx (except 408/429) will not get better by retrying.
                if isinstance(exc, urllib.error.HTTPError) and 400 <= exc.code < 500 and exc.code not in (408, 429):
                    break
                if attempt < retries:
                    sleep(backoff**attempt)
        raise DownloadError(f"{type(last_error).__name__}: {last_error}") from last_error

    return fetch


def _fetch_once(url: str, timeout: float, max_bytes: int) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/plain, */*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (https enforced above)
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise DownloadError(f"response exceeds {max_bytes} bytes")
            chunks.append(chunk)
    return b"".join(chunks).decode("utf-8", errors="replace")
