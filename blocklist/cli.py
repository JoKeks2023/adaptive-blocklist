from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .builder import BuildMeta, BuildOutput, build_all, write_output
from .config import ConfigError, load_config
from .downloader import make_fetcher
from .validator import validate_output


def _git_commit(root: Path) -> str:
    if os.environ.get("GITHUB_SHA"):
        return os.environ["GITHUB_SHA"]
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True)
        return out.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def _publish_dir(staging: Path, out_dir: Path) -> None:
    """Swap lists/ and data/ in ``out_dir`` for the freshly validated ones."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in ("lists", "data"):
        target = out_dir / name
        if target.exists():
            shutil.rmtree(target)
        shutil.move(str(staging / name), str(target))


def cmd_build(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    config = load_config(root)
    build_time = args.build_time or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = BuildMeta(
        build_time=build_time,
        commit=args.commit or _git_commit(root),
        repository=os.environ.get("GITHUB_REPOSITORY", ""),
    )
    fetcher = make_fetcher(timeout=args.timeout, retries=args.retries)
    output: BuildOutput = build_all(config, fetcher, meta)

    for e in output.catalog["sources"]:
        print(f"  source {e['id']:<28} {e['status']:<15} {e['domains']:>8} domains" + (f"  ({e['error']})" if e["error"] and e["status"] != "pending" else ""))
    problems = list(output.problems)

    if not problems:
        with tempfile.TemporaryDirectory(prefix="ubl-") as tmp:
            staging = Path(tmp)
            write_output(output, staging)
            problems = validate_output(staging, config)
            if not problems:
                _publish_dir(staging, Path(args.out).resolve())

    if args.report:
        report = Path(args.report)
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps({"problems": problems, "catalog": output.catalog}, indent=2, sort_keys=True) + "\n")

    if problems:
        print("BUILD FAILED - nothing was published:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print(f"Build OK -> {args.out}  ({output.stats['totals']['unique_domains_all_modules']} unique domains)")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    problems = validate_output(Path(args.dir).resolve(), load_config(root))
    if problems:
        print("VALIDATION FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("Validation OK")
    return 0


def cmd_check_config(args: argparse.Namespace) -> int:
    config = load_config(Path(args.root).resolve())
    used = {s for m in config.modules.values() for s in m.sources}
    unused = sorted(set(config.sources) - used)
    print(f"Config OK: {len(config.sources)} sources, {len(config.modules)} modules, {len(config.profiles)} profiles")
    if unused:
        print(f"warning: sources not used by any module: {', '.join(unused)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="universal-blocklist")
    parser.add_argument("--root", default=".", help="repository root (default: .)")
    sub = parser.add_subparsers(dest="command", required=True)

    b = sub.add_parser("build", help="download sources and generate all lists")
    b.add_argument("--out", default="web/public", help="output directory (lists/ and data/ are written below it)")
    b.add_argument("--commit", help="commit id recorded in metadata (default: git HEAD / GITHUB_SHA)")
    b.add_argument("--build-time", help="ISO timestamp recorded in output (default: now, UTC)")
    b.add_argument("--report", help="write a JSON build report here (also on failure)")
    b.add_argument("--timeout", type=float, default=30.0)
    b.add_argument("--retries", type=int, default=3)
    b.set_defaults(func=cmd_build)

    v = sub.add_parser("validate", help="validate a generated output directory")
    v.add_argument("--dir", default="web/public")
    v.set_defaults(func=cmd_validate)

    c = sub.add_parser("check-config", help="validate config/*.yml and overrides/*.txt")
    c.set_defaults(func=cmd_check_config)

    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ConfigError as exc:
        print(f"Config error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
