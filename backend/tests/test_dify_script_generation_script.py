"""真实 Dify 联调脚本的纯函数测试。"""

from __future__ import annotations

from scripts.test_dify_script_generation import (
    extract_response_data,
    is_terminal_status,
    normalize_backend_base_url,
)


def test_normalize_backend_base_url_trims_trailing_slash() -> None:
    """后端地址标准化应去掉尾斜杠。"""
    assert normalize_backend_base_url("http://127.0.0.1:8000/") == "http://127.0.0.1:8000"


def test_extract_response_data_reads_standard_response_wrapper() -> None:
    """标准响应包裹应能正确提取 data。"""
    assert extract_response_data({"data": {"id": "x"}}) == {"id": "x"}


def test_is_terminal_status_matches_pipeline_end_states() -> None:
    """终态判断应覆盖成功、失败和取消。"""
    assert is_terminal_status("succeeded") is True
    assert is_terminal_status("failed") is True
    assert is_terminal_status("cancelled") is True
    assert is_terminal_status("running") is False
