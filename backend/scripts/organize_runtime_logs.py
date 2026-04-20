"""整理 runtime_logs 目录结构。"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil


@dataclass(frozen=True)
class MigrationRule:
    """描述单个日志文件前缀应迁移到的目标目录。"""

    prefix: str
    target_dir: str


RUNTIME_LOG_DIR = Path(__file__).resolve().parents[1] / "runtime_logs"
TARGET_DIRS = ("backend", "access", "mobile", "legacy")
ROOT_RULES = (
    MigrationRule(prefix="mobile-debug.log", target_dir="mobile"),
    MigrationRule(prefix="backend.log", target_dir="legacy"),
    MigrationRule(prefix="backend-error.log", target_dir="legacy"),
)


def ensure_target_dirs(runtime_log_dir: Path) -> None:
    """确保整理后的目标目录已创建。"""
    for directory_name in TARGET_DIRS:
        (runtime_log_dir / directory_name).mkdir(parents=True, exist_ok=True)


def resolve_target_path(runtime_log_dir: Path, source_path: Path) -> Path | None:
    """根据旧文件名前缀推导迁移目标路径。"""
    for rule in ROOT_RULES:
        if source_path.name == rule.prefix or source_path.name.startswith(f"{rule.prefix}."):
            return runtime_log_dir / rule.target_dir / source_path.name
    return None


def merge_or_move_file(source_path: Path, target_path: Path) -> str:
    """迁移文件；若目标已存在则追加后删除源文件。"""
    if source_path.resolve() == target_path.resolve():
        return "skipped"

    target_path.parent.mkdir(parents=True, exist_ok=True)
    if not target_path.exists():
        shutil.move(str(source_path), str(target_path))
        return "moved"

    if source_path.read_bytes() == target_path.read_bytes():
        source_path.unlink()
        return "deduplicated"

    with source_path.open("rb") as source_handle, target_path.open("ab") as target_handle:
        target_handle.write(source_handle.read())
    source_path.unlink()
    return "merged"


def collect_root_log_files(runtime_log_dir: Path) -> list[Path]:
    """收集仍平铺在 runtime_logs 根目录的旧日志文件。"""
    return sorted(
        path
        for path in runtime_log_dir.iterdir()
        if path.is_file() and path.name != ".gitkeep"
    )


def organize_runtime_logs(runtime_log_dir: Path) -> list[tuple[Path, Path, str]]:
    """整理旧日志到新目录结构，并返回迁移结果。"""
    ensure_target_dirs(runtime_log_dir)
    migration_results: list[tuple[Path, Path, str]] = []
    for source_path in collect_root_log_files(runtime_log_dir):
        target_path = resolve_target_path(runtime_log_dir, source_path)
        if target_path is None:
            continue
        result = merge_or_move_file(source_path, target_path)
        migration_results.append((source_path, target_path, result))
    return migration_results


def main() -> int:
    """执行日志整理并输出摘要。"""
    runtime_log_dir = RUNTIME_LOG_DIR
    migration_results = organize_runtime_logs(runtime_log_dir)
    if not migration_results:
        print(f"No legacy runtime logs found under {runtime_log_dir}")
        return 0

    print(f"Organized runtime logs under {runtime_log_dir}:")
    for source_path, target_path, result in migration_results:
        print(f"- {result}: {source_path.name} -> {target_path.relative_to(runtime_log_dir)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
