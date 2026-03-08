from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from core.exceptions import AppException


class FfmpegAudioExtractor:
    def __init__(self, executable: str = "ffmpeg") -> None:
        self.executable = executable

    def extract_from_url(self, *, media_url: str, output_stem: str) -> str:
        if shutil.which(self.executable) is None:
            raise AppException(
                message="服务器缺少 ffmpeg，无法提取音频",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"tool": "ffmpeg"},
            )

        temp_dir = Path(tempfile.mkdtemp(prefix="external-media-"))
        output_path = temp_dir / f"{output_stem}.m4a"
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
            raise AppException(
                message="外部媒体音频提取失败",
                code="EXTERNAL_MEDIA_IMPORT_FAILED",
                status_code=502,
                details={"stderr": (result.stderr or result.stdout or "").strip()[:500]},
            )
        return str(output_path)
