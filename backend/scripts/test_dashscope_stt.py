#!/usr/bin/env python3
"""Run DashScope STT directly against files stored in backend/uploads."""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path
from typing import Iterable

from core.config import settings
from services.base import STTError
from services.dashscope_stt import DashScopeSTTService

AUDIO_SUFFIXES = {".m4a", ".mp3", ".wav", ".pcm", ".ogg"}
DEFAULT_UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"


def discover_audio_files(root: Path) -> list[Path]:
    files = [
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in AUDIO_SUFFIXES
    ]
    return sorted(files, key=lambda path: path.stat().st_mtime, reverse=True)


def resolve_targets(args: argparse.Namespace) -> list[Path]:
    uploads_dir = Path(args.uploads_dir).resolve()
    if args.file:
        target = Path(args.file).expanduser().resolve()
        if not target.exists():
            raise FileNotFoundError(f"音频文件不存在: {target}")
        return [target]

    candidates = discover_audio_files(uploads_dir)
    if not candidates:
        raise FileNotFoundError(f"未在目录中找到可测试音频: {uploads_dir}")

    if args.list_files:
        return candidates
    if args.all:
        return candidates[: args.limit] if args.limit else candidates
    return [candidates[0]]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="使用 DashScope STT 直接测试 backend/uploads 中的音频文件")
    parser.add_argument("--uploads-dir", default=str(DEFAULT_UPLOADS_DIR), help="上传音频目录，默认 backend/uploads")
    parser.add_argument("--file", help="指定单个音频文件绝对路径或相对路径")
    parser.add_argument("--all", action="store_true", help="测试 uploads 目录中的所有音频文件")
    parser.add_argument("--limit", type=int, default=0, help="与 --all 配合，限制测试文件数量")
    parser.add_argument("--list-files", action="store_true", help="只列出可测试音频文件，不发起识别")
    parser.add_argument("--language", default="zh-CN", help="语言提示，默认 zh-CN")
    parser.add_argument("--no-diarization", action="store_true", help="禁用说话人分离，便于对比识别结果")
    parser.add_argument("--speaker-count", type=int, help="覆盖说话人数配置")
    parser.add_argument("--api-key", help="覆盖环境变量中的 DASHSCOPE_API_KEY")
    return parser


def print_file_list(files: Iterable[Path]) -> None:
    for index, path in enumerate(files, start=1):
        print(f"{index:02d}. {path}")


async def transcribe_file(
    service: DashScopeSTTService,
    audio_path: Path,
    language: str,
) -> int:
    print(f"\n=== Testing: {audio_path} ===")
    started_at = time.perf_counter()
    try:
        result = await service.transcribe(str(audio_path), language_hint=language)
    except STTError as exc:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        print(f"Status: FAILED ({duration_ms} ms)")
        print(f"Error: {exc.message}")
        return 1
    except Exception as exc:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        print(f"Status: FAILED ({duration_ms} ms)")
        print(f"Unexpected error: {exc}")
        return 1

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    print(f"Status: OK ({duration_ms} ms)")
    print(f"Language: {result.language}")
    print(f"Transcript: {result.text or '(empty)'}")
    segments = result.speaker_segments or []
    print(f"Speaker segments: {len(segments)}")
    for segment in segments[:10]:
        print(
            f"  - speaker={segment.speaker_id} start={segment.start_ms} end={segment.end_ms} text={segment.text}"
        )
    if len(segments) > 10:
        print(f"  ... {len(segments) - 10} more")
    return 0


async def main_async(args: argparse.Namespace) -> int:
    targets = resolve_targets(args)
    if args.list_files:
        print_file_list(targets)
        return 0

    service = DashScopeSTTService(api_key=args.api_key)
    service.diarization_enabled = not args.no_diarization
    if args.speaker_count is not None:
        service.speaker_count = max(0, args.speaker_count)

    print(f"Uploads dir: {Path(args.uploads_dir).resolve()}")
    print(f"Model: {service.model}")
    print(f"Diarization: {service.diarization_enabled}")
    print(f"Speaker count: {service.speaker_count}")
    print(f"Language hint: {args.language}")
    print(f"Files to test: {len(targets)}")

    failures = 0
    for audio_path in targets:
        failures += await transcribe_file(service, audio_path, args.language)

    return 1 if failures else 0


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not args.list_files and not args.api_key and not settings.DASHSCOPE_API_KEY:
        print("缺少 DASHSCOPE_API_KEY。请先设置环境变量，或通过 --api-key 传入。", file=sys.stderr)
        return 2

    try:
        return asyncio.run(main_async(args))
    except FileNotFoundError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\n已中断")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
