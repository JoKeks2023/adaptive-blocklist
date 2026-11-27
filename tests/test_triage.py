from blocklist.triage import extract_domains, labels_for, published_lookup, render_comment, triage

BODY = """### Domains

Ads.Example.com
http://bad.example.com/x
*.wild.example.com
known.example.net
ads.example.com

### Category

Advertising
"""


def test_extract_only_domains_section():
    assert extract_domains(BODY)[0] == "Ads.Example.com"
    assert "Advertising" not in extract_domains(BODY)


def test_triage_validates_dedupes_and_detects_listed():
    r = triage(BODY, lambda d: "Tracking" if d == "known.example.net" else None)
    assert r["valid"] == ["ads.example.com", "known.example.net"]
    assert r["invalid"] == ["http://bad.example.com/x", "*.wild.example.com"]
    assert r["already"] == {"known.example.net": "Tracking"}
    assert labels_for(r) == ["needs-info"]
    assert "not a valid domain" in render_comment(r)


def test_all_listed_label_and_empty_body():
    assert labels_for(triage("### Domains\n\nx.example.com\n", lambda d: "Advertising")) == ["already-listed"]
    assert labels_for(triage("nothing", lambda d: None)) == ["needs-info"]


def test_lookup_survives_fetch_errors():
    def boom(url):
        raise OSError("down")
    assert published_lookup("https://x.invalid/", boom)("a.example.com") is None


def test_lookup_builds_index():
    files = {
        "https://s/data/catalog.json": '{"modules":[{"name":"Tracking","file":"lists/modules/t.txt"}]}',
        "https://s/lists/modules/t.txt": "# c\n0.0.0.0 t.example.com\n",
    }
    assert published_lookup("https://s/", files.__getitem__)("t.example.com") == "Tracking"
