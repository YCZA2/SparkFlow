#!/usr/bin/env python3
"""直接调试抖音分享链接解析与音频提取。"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.config import settings
from core.exceptions import AppException
from services.base import STTError
from services.dashscope_stt import DashScopeSTTService
from services.external_media.douyin.abogus import ABogus
from services.external_media.douyin.provider import DouyinProvider
from services.external_media.douyin.parser import DouyinVideoParser, XBogus
from services.external_media.ffmpeg_audio import FfmpegAudioExtractor

DEFAULT_SHARE_URL = "https://v.douyin.com/dixQYlJxVsg/"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="调试单条抖音分享链接的解析与音频下载")
    parser.add_argument("share_url", nargs="?", default=DEFAULT_SHARE_URL, help="抖音分享链接")
    parser.add_argument("--skip-download", action="store_true", help="只测试解析详情，不执行 ffmpeg 抽音频")
    parser.add_argument("--skip-transcribe", action="store_true", help="下载成功后跳过 DashScope 转写")
    parser.add_argument("--language", default="zh-CN", help="转写语言提示，默认 zh-CN")
    parser.add_argument(
        "--dump-response",
        action="store_true",
        help="打印 aweme detail 响应体前 500 字符，便于确认是否命中风控页",
    )
    return parser


def clip(value: str | None, length: int = 500) -> str:
    text = (value or "").strip()
    if len(text) <= length:
        return text
    return f"{text[:length]}..."


def summarize_detail_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    if not payload:
        return {"has_payload": False}

    aweme = payload.get("aweme_detail") or {}
    return {
        "has_payload": True,
        "top_level_keys": sorted(payload.keys()),
        "has_aweme_detail": bool(aweme),
        "aweme_id": aweme.get("aweme_id"),
        "aweme_type": aweme.get("aweme_type"),
        "desc": aweme.get("desc"),
    }


def build_aweme_detail_params(video_id: str) -> dict[str, str]:
    return {
        "device_platform": "webapp",
        "aid": "6383",
        "channel": "channel_pc_web",
        "aweme_id": video_id,
        "pc_client_type": "1",
        "version_code": "290100",
        "version_name": "29.1.0",
        "cookie_enabled": "true",
        "browser_language": "zh-CN",
        "browser_platform": "Win32",
        "browser_name": "Chrome",
        "browser_version": "130.0.0.0",
        "browser_online": "true",
        "engine_name": "Blink",
        "engine_version": "130.0.0.0",
        "os_name": "Windows",
        "os_version": "10",
        "platform": "PC",
        "msToken": "",
    }


def build_headers(parser: DouyinVideoParser, referer: str) -> dict[str, str]:
    headers = {
        "User-Agent": parser.user_agent,
        "Referer": referer,
        "Accept": "application/json, text/plain, */*",
    }
    if parser.cookie:
        headers["Cookie"] = parser.cookie
    return headers


def request_aweme_detail_debug(
    *,
    parser: DouyinVideoParser,
    video_id: str,
    referer: str,
    mode: str,
) -> dict[str, Any]:
    api_url = "https://www.douyin.com/aweme/v1/web/aweme/detail/"
    params = build_aweme_detail_params(video_id)
    headers = build_headers(parser, referer)

    if mode == "a_bogus":
        if ABogus is None:
            return {"mode": mode, "error": "ABogus unavailable"}
        a_bogus = ABogus().get_value(params)
        params["a_bogus"] = quote(a_bogus, safe="")
        response = requests.get(api_url, params=params, headers=headers, timeout=10)
    elif mode == "x_bogus":
        if XBogus is None:
            return {"mode": mode, "error": "XBogus unavailable"}
        param_str = "&".join([f"{key}={value}" for key, value in params.items()])
        xb_value = XBogus(parser.user_agent).getXBogus(param_str)
        url = f"{api_url}?{param_str}&X-Bogus={xb_value[1]}"
        response = requests.get(url, headers=headers, timeout=10)
    else:
        raise ValueError(f"unsupported mode: {mode}")

    text = response.text or ""
    json_body = None
    try:
        json_body = response.json() if text else None
    except Exception:
        json_body = None

    return {
        "mode": mode,
        "status_code": response.status_code,
        "content_type": response.headers.get("content-type"),
        "text_preview": clip(text),
        "json_summary": summarize_detail_payload(json_body if isinstance(json_body, dict) else None),
    }


def pick_audio_source_url(parsed: dict[str, Any]) -> str | None:
    qualities = parsed.get("qualities") or []
    if qualities:
        return qualities[0].get("url")
    return parsed.get("nwm_url")


async def transcribe_audio(audio_path: str, language: str) -> int:
    print("\n=== DashScope Transcription ===")
    if not settings.DASHSCOPE_API_KEY:
        print("跳过转写：未配置 DASHSCOPE_API_KEY")
        return 0

    try:
        service = DashScopeSTTService()
        result = await service.transcribe(audio_path, language_hint=language)
    except STTError as exc:
        print(f"transcribe failed: {exc.message}")
        return 5
    except Exception as exc:
        print(f"transcribe unexpected error: {exc}")
        return 5

    transcript = (result.text or "").strip()
    print(f"Language: {result.language}")
    print(f"Speaker segments: {len(result.speaker_segments or [])}")
    print("Transcript:")
    print(transcript or "(empty)")
    return 0


def main() -> int:
    args = build_parser().parse_args()
    share_url = args.share_url.strip()
    parser = DouyinVideoParser()

    print("=== Douyin Download Debug ===")
    print(f"Share URL: {share_url}")
    print(f"Backend env: {Path(settings.model_config.get('env_file') or '').resolve()}")
    print(f"Cookie loaded: {'yes' if parser.cookie else 'no'}")
    if parser.cookie:
        print(f"Cookie preview: {clip(parser.cookie, 120)}")

    video_id = parser.get_video_id(share_url)
    print(f"Video ID: {video_id or '(not found)'}")
    if not video_id:
        return 1

    referers = [
        f"https://www.douyin.com/video/{video_id}",
        f"https://www.douyin.com/note/{video_id}",
    ]
    print("\n=== Aweme Detail Debug ===")
    for referer in referers:
        print(f"\nReferer: {referer}")
        for mode in ("a_bogus", "x_bogus"):
            try:
                result = request_aweme_detail_debug(
                    parser=parser,
                    video_id=video_id,
                    referer=referer,
                    mode=mode,
                )
            except Exception as exc:
                print(json.dumps({"mode": mode, "exception": str(exc)}, ensure_ascii=False, indent=2))
                continue

            print(json.dumps(result, ensure_ascii=False, indent=2))
            if not args.dump_response:
                continue
            print(f"{mode} response preview:\n{result.get('text_preview')}\n")

    print("\n=== Parser.parse_video ===")
    parsed = parser.parse_video(share_url)
    if not parsed:
        print("parse_video: FAILED")
        return 2

    print(json.dumps(parsed, ensure_ascii=False, indent=2, default=str))

    if args.skip_download:
        return 0

    audio_source_url = pick_audio_source_url(parsed)
    if not audio_source_url:
        print("未找到可用音频源 URL")
        return 3

    print("\n=== ffmpeg Extract ===")
    extractor = FfmpegAudioExtractor()
    provider = DouyinProvider(parser=parser, extractor=extractor)
    try:
        output_path = extractor.extract_from_url(
            media_url=audio_source_url,
            output_stem=str(parsed.get("aweme_id") or video_id),
            request_headers=provider._build_media_request_headers(media_id=str(parsed.get("aweme_id") or video_id)),
        )
    except AppException as exc:
        print(f"ffmpeg extract failed: {exc.message}")
        if exc.details:
            print(json.dumps(exc.details, ensure_ascii=False, indent=2))
        return 4

    print(f"Audio extracted to: {output_path}")
    if args.skip_transcribe:
        return 0

    return asyncio.run(transcribe_audio(output_path, args.language))


if __name__ == "__main__":
    raise SystemExit(main())
