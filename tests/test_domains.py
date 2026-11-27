import pytest

from blocklist.domains import normalize_domain, parent_chain


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Example.COM", "example.com"),
        ("  ads.example.com.  ", "ads.example.com"),
        ("münchen.de", "xn--mnchen-3ya.de"),
        ("a-b.c-d.example.co.uk", "a-b.c-d.example.co.uk"),
        ("_dmarc.example.com", "_dmarc.example.com"),
    ],
)
def test_normalize_valid(raw, expected):
    assert normalize_domain(raw) == expected


@pytest.mark.parametrize(
    "raw",
    ["", "localhost", "1.2.3.4", "*.example.com", "||x.com^", "http://x.com", "a b.com", "-a.com", "a-.com",
     "a..com", "example.123", "x" * 64 + ".com", ("a." * 130) + "com", "bad!.com", "foo.c"],
)
def test_normalize_invalid(raw):
    assert normalize_domain(raw) is None


def test_parent_chain_excludes_bare_tld():
    assert list(parent_chain("a.b.example.com")) == ["a.b.example.com", "b.example.com", "example.com"]
    assert list(parent_chain("example.com")) == ["example.com"]
