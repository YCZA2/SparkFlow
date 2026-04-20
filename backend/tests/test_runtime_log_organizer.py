"""runtime log 整理脚本测试。"""

from __future__ import annotations

from pathlib import Path

from scripts.organize_runtime_logs import organize_runtime_logs


def _write_file(path: Path, content: str) -> None:
    """写入测试用日志文件。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_organize_runtime_logs_moves_mobile_and_legacy_files(tmp_path) -> None:
    """旧平铺日志应按新目录迁移，避免继续污染根目录。"""
    _write_file(tmp_path / "mobile-debug.log", "mobile-current\n")
    _write_file(tmp_path / "mobile-debug.log.2026-04-08", "mobile-history\n")
    _write_file(tmp_path / "backend.log", "backend-mixed\n")
    _write_file(tmp_path / "backend-error.log.2026-04-02", "backend-error-history\n")

    results = organize_runtime_logs(tmp_path)

    assert len(results) == 4
    assert not (tmp_path / "mobile-debug.log").exists()
    assert not (tmp_path / "backend.log").exists()
    assert (tmp_path / "mobile" / "mobile-debug.log").read_text(encoding="utf-8") == "mobile-current\n"
    assert (tmp_path / "mobile" / "mobile-debug.log.2026-04-08").read_text(encoding="utf-8") == "mobile-history\n"
    assert (tmp_path / "legacy" / "backend.log").read_text(encoding="utf-8") == "backend-mixed\n"
    assert (
        tmp_path / "legacy" / "backend-error.log.2026-04-02"
    ).read_text(encoding="utf-8") == "backend-error-history\n"


def test_organize_runtime_logs_merges_existing_targets(tmp_path) -> None:
    """目标已存在时应追加源文件内容，避免迁移时丢日志。"""
    _write_file(tmp_path / "mobile-debug.log", "new-line\n")
    _write_file(tmp_path / "mobile" / "mobile-debug.log", "old-line\n")

    organize_runtime_logs(tmp_path)

    assert not (tmp_path / "mobile-debug.log").exists()
    assert (tmp_path / "mobile" / "mobile-debug.log").read_text(encoding="utf-8") == "old-line\nnew-line\n"
