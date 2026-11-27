from pathlib import Path

import pytest

from blocklist.parser import parse

FIX = Path(__file__).parent / "fixtures"


def test_hosts_basic():
    r = parse((FIX / "hosts_basic.txt").read_text(), "hosts")
    assert r.domains == {
        "ads.example.com",
        "tracker.example.net",
        "analytics.example.net",
        "xn--mnchen-ads-9db.de",
    }
    # invalid: bad_host!, singlelabel, 1.2.3.4  (reserved/localhost lines are ignored, not invalid)
    assert r.invalid == 3
    assert not any("localhost" in d for d in r.domains)


def test_hosts_rejects_non_sink_ip_and_missing_host():
    r = parse("8.8.8.8 example.com\n0.0.0.0\n", "hosts")
    assert r.domains == set()
    assert r.invalid == 2


def test_hosts_comments_and_blank_lines_ignored():
    r = parse("# only comments\n\n   \n#0.0.0.0 x.com\n", "hosts")
    assert r.entries == 0 and r.domains == set()


def test_domains_basic():
    r = parse((FIX / "domains_basic.txt").read_text(), "domains")
    assert r.domains == {"example.org", "sub.example.org"}
    # '!' line, wildcard, adblock, url, 'not a domain', '-bad-' => all invalid, none guessed
    assert r.invalid == 6


def test_wrong_format_is_not_silently_accepted():
    r = parse((FIX / "wrong_format.txt").read_text(), "domains")
    assert r.domains == set()
    assert r.invalid_ratio == 1.0


def test_unsupported_format_raises():
    with pytest.raises(ValueError):
        parse("x.com", "adblock")
