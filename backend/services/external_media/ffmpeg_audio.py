from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from core.exceptions import AppException
from core.logging_config import get_logger

logger = get_logger(__name__)


class FfmpegAudioExtractor:
    def __init__(self, executable: str = "ffmpeg") -> None:
        self.executable = executable

    def extract_from_url(self, *, media_url: str, output_stem: str) -> str:
        """调用 ffmpeg 从远端媒体流提取音频文件。"""
        if shutil.which(self.executable) is None:
            logger.warning("external_media_ffmpeg_missing", executable=self.executable)
            raise AppException(
                message="服务器缺少 ffmpeg，无法提取音频",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"tool": "ffmpeg"},
            )

        temp_dir = Path(tempfile.mkdtemp(prefix="external-media-"))
        output_path = temp_dir / f"{output_stem}.m4a"
        logger.info("external_media_ffmpeg_extract_start", output_stem=output_stem, output_path=str(output_path))
        command = [
            self.executable,
            "-y",
            "-loglevel",
            "error",
            "-i",
            media_url,
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(output_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0 or not output_path.exists():
            logger.warning(
                "external_media_ffmpeg_extract_failed",
                output_stem=output_stem,
                returncode=result.returncode,
                stderr=(result.stderr or result.stdout or "").strip()[:500],
            )
            raise AppException(
                message="外部媒体音频提取失败",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"stderr": (result.stderr or result.stdout or "").strip()[:500]},
            )
        logger.info("external_media_ffmpeg_extract_succeeded", output_stem=output_stem, output_path=str(output_path))
        return str(output_path)
