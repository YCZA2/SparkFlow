from __future__ import annotations

from collections.abc import Mapping
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests

from core.exceptions import AppException
from core.logging_config import get_logger

logger = get_logger(__name__)


class FfmpegAudioExtractor:
    def __init__(self, executable: str = "ffmpeg") -> None:
        self.executable = executable

    def extract_from_url(
        self,
        *,
        media_url: str,
        output_stem: str,
        request_headers: Mapping[str, str] | None = None,
    ) -> str:
        """调用 ffmpeg 从远端媒体流提取音频文件。"""
        self._ensure_ffmpeg_available()
        normalized_headers = self._normalize_headers(request_headers)
        temp_dir = Path(tempfile.mkdtemp(prefix="external-media-"))
        output_path = temp_dir / f"{output_stem}.m4a"
        logger.info("external_media_ffmpeg_extract_start", output_stem=output_stem, output_path=str(output_path))

        result = self._run_ffmpeg(
            input_source=media_url,
            output_path=output_path,
            request_headers=normalized_headers,
        )
        if self._should_fallback_to_local_download(result):
            logger.info("external_media_ffmpeg_remote_forbidden_fallback", output_stem=output_stem)
            downloaded_media_path = self._download_media_to_temp(
                media_url=media_url,
                temp_dir=temp_dir,
                output_stem=output_stem,
                request_headers=normalized_headers,
            )
            try:
                result = self._run_ffmpeg(input_source=str(downloaded_media_path), output_path=output_path)
            finally:
                downloaded_media_path.unlink(missing_ok=True)

        if result.returncode != 0 or not output_path.exists():
            stderr = (result.stderr or result.stdout or "").strip()[:500]
            logger.warning(
                "external_media_ffmpeg_extract_failed",
                output_stem=output_stem,
                returncode=result.returncode,
                stderr=stderr,
            )
            raise AppException(
                message="外部媒体音频提取失败",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"stderr": stderr},
            )
        logger.info("external_media_ffmpeg_extract_succeeded", output_stem=output_stem, output_path=str(output_path))
        return str(output_path)

    def _ensure_ffmpeg_available(self) -> None:
        """中文注释：在真正开始解析前先校验 ffmpeg 是否可用。"""
        if shutil.which(self.executable) is None:
            logger.warning("external_media_ffmpeg_missing", executable=self.executable)
            raise AppException(
                message="服务器缺少 ffmpeg，无法提取音频",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"tool": "ffmpeg"},
            )

    def _run_ffmpeg(
        self,
        *,
        input_source: str,
        output_path: Path,
        request_headers: Mapping[str, str] | None = None,
    ) -> subprocess.CompletedProcess[str]:
        """中文注释：远端流地址需要补齐请求头，否则抖音 CDN 会直接拒绝 ffmpeg。"""
        command = [
            self.executable,
            "-y",
            "-loglevel",
            "error",
        ]
        if request_headers:
            ffmpeg_headers = self._ffmpeg_safe_headers(request_headers)
            header_blob = "".join(f"{key}: {value}\r\n" for key, value in ffmpeg_headers.items() if value)
            if header_blob:
                command.extend(["-headers", header_blob])
            user_agent = ffmpeg_headers.get("User-Agent")
            if user_agent:
                command.extend(["-user_agent", user_agent])
        command.extend(
            [
                "-i",
                input_source,
                "-vn",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                str(output_path),
            ]
        )
        return subprocess.run(command, capture_output=True, text=True)

    def probe_stream_types(
        self,
        *,
        media_url: str,
        request_headers: Mapping[str, str] | None = None,
    ) -> list[str]:
        """中文注释：在真正抽音频前探测远端流类型，用来跳过只有视频轨的链接。"""
        ffprobe_executable = shutil.which("ffprobe")
        if ffprobe_executable is None:
            logger.warning("external_media_ffprobe_missing")
            return []

        ffprobe_headers = self._ffmpeg_safe_headers(self._normalize_headers(request_headers))
        command = [
            ffprobe_executable,
            "-v",
            "error",
        ]
        if ffprobe_headers:
            header_blob = "".join(f"{key}: {value}\r\n" for key, value in ffprobe_headers.items() if value)
            if header_blob:
                command.extend(["-headers", header_blob])
        command.extend(
            [
                "-show_entries",
                "stream=codec_type",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                media_url,
            ]
        )
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            logger.warning(
                "external_media_ffprobe_failed",
                returncode=result.returncode,
                stderr=(result.stderr or result.stdout or "").strip()[:300],
            )
            return []

        stream_types = [line.strip() for line in (result.stdout or "").splitlines() if line.strip()]
        logger.info("external_media_ffprobe_succeeded", stream_types=stream_types)
        return stream_types

    def _download_media_to_temp(
        self,
        *,
        media_url: str,
        temp_dir: Path,
        output_stem: str,
        request_headers: Mapping[str, str] | None = None,
    ) -> Path:
        """中文注释：ffmpeg 直连被封时先用浏览器头下载到本地，再从本地文件抽音频。"""
        response = None
        try:
            response = requests.get(media_url, headers=dict(request_headers or {}), stream=True, timeout=30)
            response.raise_for_status()
            suffix = self._detect_source_suffix(media_url=media_url, content_type=response.headers.get("content-type"))
            local_source_path = temp_dir / f"{output_stem}.source{suffix}"
            with local_source_path.open("wb") as file_obj:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        file_obj.write(chunk)
            logger.info("external_media_http_download_succeeded", output_stem=output_stem, local_source_path=str(local_source_path))
            return local_source_path
        except requests.RequestException as exc:
            logger.warning(
                "external_media_http_download_failed",
                output_stem=output_stem,
                error=str(exc),
            )
            raise AppException(
                message="外部媒体下载失败",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"error": str(exc)},
            )
        finally:
            if response is not None:
                response.close()

    @staticmethod
    def _normalize_headers(request_headers: Mapping[str, str] | None) -> dict[str, str]:
        """中文注释：去掉空 header，避免把无效值传给 ffmpeg 或 requests。"""
        return {key: value for key, value in (request_headers or {}).items() if value}

    @staticmethod
    def _ffmpeg_safe_headers(request_headers: Mapping[str, str]) -> dict[str, str]:
        """中文注释：ffmpeg 对超长 Cookie 头兼容性很差，远端拉流只保留必要浏览器头。"""
        return {key: value for key, value in request_headers.items() if key.lower() != "cookie"}

    @staticmethod
    def _should_fallback_to_local_download(result: subprocess.CompletedProcess[str]) -> bool:
        """中文注释：仅在远端访问被拒时走下载降级，避免掩盖其他真实 ffmpeg 错误。"""
        stderr = f"{result.stderr or ''}\n{result.stdout or ''}".lower()
        return result.returncode != 0 and (
            "403 forbidden" in stderr or "access denied" in stderr or "overlong headers" in stderr
        )

    @staticmethod
    def _detect_source_suffix(*, media_url: str, content_type: str | None) -> str:
        """中文注释：给临时源文件补扩展名，避免 ffmpeg 误判输入格式。"""
        if content_type:
            normalized = content_type.split(";")[0].strip().lower()
            if normalized == "video/mp4":
                return ".mp4"
            if normalized in {"video/quicktime", "video/mov"}:
                return ".mov"
            if normalized == "audio/mpeg":
                return ".mp3"
        suffix = Path(urlparse(media_url).path).suffix
        return suffix if suffix else ".mp4"
