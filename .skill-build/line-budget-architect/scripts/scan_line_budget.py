#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_BUDGETS = {
    "app": 250,
    "screen": 250,
    "component": 180,
    "hook": 180,
    "presenter": 140,
    "util": 140,
    "service": 300,
    "schema": 220,
    "test": 400,
    "default": 250,
}

DEFAULT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".swift",
    ".kt",
    ".java",
    ".m",
    ".mm",
}

DEFAULT_EXCLUDES = {
    ".git",
    ".minimax",
    ".skill-build",
    ".next",
    ".nuxt",
    ".expo",
    ".turbo",
    ".cache",
    ".idea",
    ".vscode",
    "node_modules",
    "Pods",
    "build",
    "dist",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "vendor",
}


@dataclass
class FileStat:
    path: str
    kind: str
    lines: int
    budget: int
    overflow: int
    severity: str
    suggestion: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scan a repository for oversized source files and propose architecture refactors."
    )
    parser.add_argument("--root", required=True, help="Repository root to scan.")
    parser.add_argument(
        "--top",
        type=int,
        default=20,
        help="Maximum number of files to print in text mode.",
    )
    parser.add_argument(
        "--min-overflow",
        type=int,
        default=1,
        help="Only report files whose overflow is at least this many lines.",
    )
    parser.add_argument(
        "--budget",
        action="append",
        default=[],
        metavar="ROLE=LINES",
        help="Override a budget, for example: --budget app=220",
    )
    parser.add_argument(
        "--include-extension",
        action="append",
        default=[],
        metavar=".ext",
        help="Additional file extension to scan.",
    )
    parser.add_argument(
        "--include-generated",
        action="store_true",
        help="Include generated or vendored directories such as node_modules, Pods, dist, and build.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    return parser.parse_args()


def merge_budgets(overrides: Iterable[str]) -> dict[str, int]:
    budgets = dict(DEFAULT_BUDGETS)
    for item in overrides:
        if "=" not in item:
            raise SystemExit(f"Invalid budget override: {item!r}. Expected ROLE=LINES.")
        role, raw_value = item.split("=", 1)
        role = role.strip()
        try:
            value = int(raw_value.strip())
        except ValueError as exc:
            raise SystemExit(f"Invalid budget value in {item!r}.") from exc
        if value <= 0:
            raise SystemExit(f"Budget must be positive in {item!r}.")
        budgets[role] = value
    return budgets


def should_skip(path: Path, root: Path, include_generated: bool) -> bool:
    if include_generated:
        return False

    relative_parts = path.relative_to(root).parts
    return any(part in DEFAULT_EXCLUDES for part in relative_parts)


def classify(path: Path) -> str:
    normalized = path.as_posix().lower()
    name = path.name.lower()

    if (
        "/test" in normalized
        or "/tests/" in normalized
        or name.startswith("test_")
        or name.endswith(".test.ts")
        or name.endswith(".test.tsx")
        or name.endswith(".spec.ts")
        or name.endswith(".spec.tsx")
        or name.endswith("_test.py")
    ):
        return "test"
    if "/app/" in normalized or "/pages/" in normalized:
        return "app"
    if "screen" in name:
        return "screen"
    if "/component" in normalized or "/components/" in normalized:
        return "component"
    if "/hook" in normalized or "/hooks/" in normalized or name.startswith("use"):
        return "hook"
    if "/presenter" in normalized or "/presenters/" in normalized:
        return "presenter"
    if "/util" in normalized or "/utils/" in normalized:
        return "util"
    if "/service" in normalized or "/services/" in normalized:
        return "service"
    if "/schema" in normalized or "/schemas/" in normalized:
        return "schema"
    return "default"


def suggestion_for(kind: str) -> str:
    suggestions = {
        "app": "Split route composition from screen state and section components.",
        "screen": "Extract orchestration into useXScreen and move major sections into components.",
        "component": "Split visual sections and move behavior-heavy logic into hooks or presenters.",
        "hook": "Separate data fetching, mutations, and derived selectors.",
        "presenter": "Break mapping/formatting rules into smaller focused helpers.",
        "util": "Split unrelated helper groups by domain.",
        "service": "Separate client transport, parsing, retry/polling, and orchestration.",
        "schema": "Split request, response, and domain models.",
        "test": "Extract fixtures/builders and split scenarios by behavior.",
        "default": "Review responsibilities and split by change reason.",
    }
    return suggestions[kind]


def severity_for(overflow: int) -> str:
    if overflow >= 300:
        return "critical"
    if overflow >= 150:
        return "high"
    if overflow >= 60:
        return "medium"
    return "low"


def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        return sum(1 for _ in handle)


def scan(root: Path, budgets: dict[str, int], extensions: set[str], include_generated: bool) -> list[FileStat]:
    results: list[FileStat] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in extensions:
            continue
        if should_skip(path, root, include_generated):
            continue

        kind = classify(path)
        budget = budgets.get(kind, budgets["default"])
        lines = count_lines(path)
        overflow = lines - budget
        if overflow <= 0:
            continue

        results.append(
            FileStat(
                path=path.relative_to(root).as_posix(),
                kind=kind,
                lines=lines,
                budget=budget,
                overflow=overflow,
                severity=severity_for(overflow),
                suggestion=suggestion_for(kind),
            )
        )

    return sorted(results, key=lambda item: (item.overflow, item.lines), reverse=True)


def print_text(root: Path, results: list[FileStat], top: int, min_overflow: int) -> None:
    filtered = [item for item in results if item.overflow >= min_overflow]
    shown = filtered[:top]

    print(f"Repository: {root}")
    print(f"Violations: {len(filtered)}")
    if not shown:
        print("No files exceed the configured line budget.")
        return

    for index, item in enumerate(shown, start=1):
        print(
            f"{index}. {item.path} | kind={item.kind} | lines={item.lines} | "
            f"budget={item.budget} | overflow=+{item.overflow} | severity={item.severity}"
        )
        print(f"   refactor: {item.suggestion}")


def main() -> None:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Root path does not exist or is not a directory: {root}")

    budgets = merge_budgets(args.budget)
    extensions = set(DEFAULT_EXTENSIONS)
    for extension in args.include_extension:
        ext = extension.strip()
        if not ext.startswith("."):
            ext = f".{ext}"
        extensions.add(ext.lower())

    results = scan(root, budgets, extensions, args.include_generated)
    filtered = [item for item in results if item.overflow >= args.min_overflow]

    if args.json:
        payload = {
            "root": str(root),
            "budgets": budgets,
            "violations": [asdict(item) for item in filtered],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print_text(root, results, args.top, args.min_overflow)


if __name__ == "__main__":
    main()
