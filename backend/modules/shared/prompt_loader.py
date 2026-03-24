"""统一的 Prompt 模板加载工具。"""

from __future__ import annotations

from pathlib import Path


def load_prompt_text(path: Path) -> str:
    """读取文本提示词文件，并去掉首尾空白。"""
    return path.read_text(encoding="utf-8").strip()


def render_prompt_template(path: Path, **kwargs: object) -> str:
    """读取模板提示词文件，并用命名参数填充占位符。"""
    return load_prompt_text(path).format(**kwargs)
