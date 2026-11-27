from blocklist.apply import apply_request, parse_command

DENY_BODY = "### Domains\n\nnew.example.com\nlisted.example.com\nhttp://bad/x\n\n### Category\n\nAdvertising\n"
ALLOW_BODY = "### Affected service / app / device\n\nTV\n\n### Blocked domain(s)\n\nupdate.example.org\n\n### What happens?\n\nx\n"


def lookup(d):
    return "Advertising" if d == "listed.example.com" else None


def test_parse_command():
    assert parse_command("/accept thanks") == "/accept"
    assert parse_command("  /ALLOW") == "/allow"
    assert parse_command("please /accept") is None
    assert parse_command("") is None


def test_accept_adds_only_new_valid_unlisted_domains(tmp_path):
    (tmp_path / "deny.txt").write_text("# existing\nold.example.com\n")
    added, comment = apply_request("/accept", 7, DENY_BODY, ["domain-request"], tmp_path, lookup)
    assert added == ["new.example.com"]
    text = (tmp_path / "deny.txt").read_text()
    assert "# issue #7\nnew.example.com\n" in text and "old.example.com" in text
    assert "listed.example.com" not in text and "bad" not in text
    assert "Skipped invalid" in comment


def test_accept_is_idempotent(tmp_path):
    apply_request("/accept", 7, DENY_BODY, ["domain-request"], tmp_path, lookup)
    added, comment = apply_request("/accept", 7, DENY_BODY, ["domain-request"], tmp_path, lookup)
    assert added == [] and "Nothing to add" in comment


def test_allow_writes_allow_file_even_when_listed(tmp_path):
    added, _ = apply_request("/allow", 9, ALLOW_BODY, ["false-positive"], tmp_path, lambda d: "Telemetry")
    assert added == ["update.example.org"]
    assert "update.example.org" in (tmp_path / "allow.txt").read_text()


def test_wrong_label_is_refused(tmp_path):
    added, comment = apply_request("/accept", 7, DENY_BODY, ["false-positive"], tmp_path, lookup)
    assert added == [] and "domain-request" in comment and not (tmp_path / "deny.txt").exists()
