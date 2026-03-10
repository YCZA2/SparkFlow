from __future__ import annotations

from pathlib import Path

from core.exceptions import ValidationError


class PromptLoader:
    """按需从磁盘读取 prompt 模板。"""

    def __init__(self, prompts_dir: Path) -> None:
        """记录 prompt 模板根目录。"""
        self.prompts_dir = prompts_dir

    def load(self, filename: str) -> str:
        """读取指定 prompt 文件内容。"""
        prompt_path = self.prompts_dir / filename
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {filename}")
        return prompt_path.read_text(encoding="utf-8")

    def load_script_prompt(self, mode: str) -> str:
        """按脚本模式读取对应 prompt 模板。"""
        mapping = {
            "mode_a": "mode_a_boom.txt",
            "mode_b": "mode_b_brain.txt",
        }
        filename = mapping.get((mode or "").strip())
        if filename is None:
            raise ValidationError(message="无效的脚本生成模式", field_errors={"mode": "必须是 mode_a 或 mode_b"})
        return self.load(filename)


def create_prompt_loader(prompts_dir: Path) -> PromptLoader:
    """构造 prompt 加载器。"""
    return PromptLoader(prompts_dir)
