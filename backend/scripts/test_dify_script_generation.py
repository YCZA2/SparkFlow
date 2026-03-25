#!/usr/bin/env python3
"""通过真实后端接口触发一次脚本生成联调。"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import httpx


DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_POLL_INTERVAL_SECONDS = 2.0
DEFAULT_POLL_TIMEOUT_SECONDS = 180.0


class ScriptGenerationCheckError(RuntimeError):
    """标记真实联调过程中的可读失败。"""


@dataclass
class CreatedResources:
    """记录联调过程中创建的资源，便于按需清理。"""

    fragment_ids: list[str]
    script_id: str | None = None


def normalize_backend_base_url(raw_value: str) -> str:
    """把后端地址标准化为不带尾斜杠的基址。"""
    value = (raw_value or "").strip().rstrip("/")
    if not value:
        raise ScriptGenerationCheckError("缺少后端地址，请传入 --backend-base-url")
    return value


def extract_response_data(payload: dict[str, Any]) -> Any:
    """从标准响应包裹中提取 data 字段。"""
    if not isinstance(payload, dict) or "data" not in payload:
        raise ScriptGenerationCheckError(f"后端返回结构无效: {json.dumps(payload, ensure_ascii=False)}")
    return payload["data"]


def request_json(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """执行一次 HTTP 请求，并把异常统一映射为可读错误。"""
    try:
        response = client.request(method, url, headers=headers, json=json_body)
    except httpx.HTTPError as exc:
        raise ScriptGenerationCheckError(f"请求失败: {exc}") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise ScriptGenerationCheckError(f"后端返回了非 JSON 响应: {response.text[:500]}") from exc
    if response.status_code >= 400:
        raise ScriptGenerationCheckError(
            f"后端请求失败 {response.status_code}: {json.dumps(payload, ensure_ascii=False)}"
        )
    if not isinstance(payload, dict):
        raise ScriptGenerationCheckError("后端返回结构无效")
    return payload


def issue_test_token(client: httpx.Client, *, backend_base_url: str) -> str:
    """向后端申请测试用户 token。"""
    payload = request_json(client, "POST", f"{backend_base_url}/api/auth/token", json_body={})
    data = extract_response_data(payload)
    token = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token.strip():
        raise ScriptGenerationCheckError(f"签发 token 返回结构异常: {json.dumps(payload, ensure_ascii=False)}")
    return token


def build_auth_headers(token: str) -> dict[str, str]:
    """构造统一的 Bearer 鉴权请求头。"""
    return {"Authorization": f"Bearer {token}"}


def create_fragment(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    body_html: str,
) -> str:
    """通过备份接口写入一条手动测试碎片快照，供真实脚本生成使用。"""
    fragment_id = str(uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    payload = request_json(
        client,
        "POST",
        f"{backend_base_url}/api/backups/batch",
        headers=headers,
        json_body={
            "items": [
                {
                    "entity_type": "fragment",
                    "entity_id": fragment_id,
                    "entity_version": 1,
                    "operation": "upsert",
                    "modified_at": now,
                    "payload": {
                        "id": fragment_id,
                        "folder_id": None,
                        "source": "manual",
                        "audio_source": None,
                        "created_at": now,
                        "updated_at": now,
                        "summary": None,
                        "tags": [],
                        "transcript": None,
                        "body_html": body_html,
                        "plain_text_snapshot": body_html.removeprefix("<p>").removesuffix("</p>"),
                        "deleted_at": None,
                    },
                }
            ]
        },
    )
    data = extract_response_data(payload)
    if not isinstance(data, dict) or int(data.get("accepted_count") or 0) != 1:
        raise ScriptGenerationCheckError(f"写入碎片快照失败: {json.dumps(payload, ensure_ascii=False)}")
    return fragment_id


def trigger_generation(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    topic: str,
    fragment_ids: list[str],
) -> str:
    """发起一次真实脚本生成任务，并返回 pipeline_run_id。"""
    payload = request_json(
        client,
        "POST",
        f"{backend_base_url}/api/scripts/generation",
        headers=headers,
        json_body={
            "topic": topic,
            "fragment_ids": fragment_ids,
        },
    )
    data = extract_response_data(payload)
    run_id = data.get("pipeline_run_id") if isinstance(data, dict) else None
    if not isinstance(run_id, str) or not run_id.strip():
        raise ScriptGenerationCheckError(f"生成任务返回缺少 pipeline_run_id: {json.dumps(payload, ensure_ascii=False)}")
    return run_id


def is_terminal_status(status: str) -> bool:
    """判断流水线是否已经进入终态。"""
    return status in {"succeeded", "failed", "cancelled"}


def poll_pipeline(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    run_id: str,
    poll_interval_seconds: float,
    poll_timeout_seconds: float,
) -> dict[str, Any]:
    """轮询后台流水线，直到脚本生成进入终态。"""
    deadline = time.monotonic() + poll_timeout_seconds
    while time.monotonic() < deadline:
        payload = request_json(client, "GET", f"{backend_base_url}/api/pipelines/{run_id}", headers=headers)
        data = extract_response_data(payload)
        if not isinstance(data, dict):
            raise ScriptGenerationCheckError(f"流水线返回结构无效: {json.dumps(payload, ensure_ascii=False)}")
        status = str(data.get("status") or "")
        if is_terminal_status(status):
            return data
        time.sleep(poll_interval_seconds)
    raise ScriptGenerationCheckError(f"流水线轮询超时: run_id={run_id}")


def fetch_script_detail(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    script_id: str,
) -> dict[str, Any]:
    """读取生成完成后的脚本详情。"""
    payload = request_json(client, "GET", f"{backend_base_url}/api/scripts/{script_id}", headers=headers)
    data = extract_response_data(payload)
    if not isinstance(data, dict):
        raise ScriptGenerationCheckError(f"脚本详情返回结构无效: {json.dumps(payload, ensure_ascii=False)}")
    return data


def delete_script(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    script_id: str,
) -> None:
    """删除联调中创建的脚本，避免污染测试数据。"""
    request_json(client, "DELETE", f"{backend_base_url}/api/scripts/{script_id}", headers=headers)


def delete_fragment(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    fragment_id: str,
) -> None:
    """把联调中创建的测试碎片标记为已删除快照。"""
    now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    request_json(
        client,
        "POST",
        f"{backend_base_url}/api/backups/batch",
        headers=headers,
        json_body={
            "items": [
                {
                    "entity_type": "fragment",
                    "entity_id": fragment_id,
                    "entity_version": 2,
                    "operation": "delete",
                    "modified_at": now,
                    "payload": None,
                }
            ]
        },
    )


def cleanup_resources(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    resources: CreatedResources,
) -> None:
    """按倒序清理联调过程中创建的资源。"""
    if resources.script_id:
        try:
            delete_script(client, backend_base_url=backend_base_url, headers=headers, script_id=resources.script_id)
        except ScriptGenerationCheckError as exc:
            print(f"[cleanup] 删除脚本失败: {exc}")
    for fragment_id in reversed(resources.fragment_ids):
        try:
            delete_fragment(client, backend_base_url=backend_base_url, headers=headers, fragment_id=fragment_id)
        except ScriptGenerationCheckError as exc:
            print(f"[cleanup] 删除碎片失败: {exc}")


def build_default_fragments() -> list[str]:
    """提供一组可直接跑通生成链路的默认碎片文本。"""
    return [
        "我想做一期关于时间管理误区的短视频，重点讲忙不等于有效产出。",
        "很多人把日程塞满当成自律，但没有优先级就只是在被任务推着走。",
    ]


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(description="通过真实后端接口触发一次脚本生成联调")
    parser.add_argument("--backend-base-url", default=DEFAULT_BACKEND_BASE_URL, help="后端基址，例如 http://127.0.0.1:8000")
    parser.add_argument("--topic", default="写一篇关于时间管理误区的短视频口播稿", help="本次生成的主题")
    parser.add_argument(
        "--fragment-text",
        action="append",
        default=[],
        help="要用于生成的碎片正文；可重复传入，不传时使用内置默认样例",
    )
    parser.add_argument("--poll-interval-seconds", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS, help="轮询间隔秒数")
    parser.add_argument("--poll-timeout-seconds", type=float, default=DEFAULT_POLL_TIMEOUT_SECONDS, help="轮询超时秒数")
    parser.add_argument("--cleanup", action="store_true", help="完成后删除本次联调创建的碎片和脚本")
    parser.add_argument("--timeout", type=float, default=30.0, help="单次 HTTP 请求超时秒数")
    return parser.parse_args()


def main() -> int:
    """执行真实脚本生成联调并输出结果摘要。"""
    args = parse_args()
    backend_base_url = normalize_backend_base_url(args.backend_base_url)
    fragment_texts = args.fragment_text or build_default_fragments()
    resources = CreatedResources(fragment_ids=[])
    with httpx.Client(timeout=args.timeout, follow_redirects=True) as client:
        token = issue_test_token(client, backend_base_url=backend_base_url)
        headers = build_auth_headers(token)
        try:
            for fragment_text in fragment_texts:
                resources.fragment_ids.append(
                    create_fragment(
                        client,
                        backend_base_url=backend_base_url,
                        headers=headers,
                        body_html=f"<p>{fragment_text}</p>",
                    )
                )
            run_id = trigger_generation(
                client,
                backend_base_url=backend_base_url,
                headers=headers,
                topic=args.topic,
                fragment_ids=resources.fragment_ids,
            )
            pipeline = poll_pipeline(
                client,
                backend_base_url=backend_base_url,
                headers=headers,
                run_id=run_id,
                poll_interval_seconds=args.poll_interval_seconds,
                poll_timeout_seconds=args.poll_timeout_seconds,
            )
            if pipeline.get("status") != "succeeded":
                raise ScriptGenerationCheckError(f"脚本生成失败: {json.dumps(pipeline, ensure_ascii=False)}")
            output = pipeline.get("output") if isinstance(pipeline.get("output"), dict) else {}
            script_id = output.get("script_id")
            if not isinstance(script_id, str) or not script_id.strip():
                raise ScriptGenerationCheckError(f"生成成功但缺少 script_id: {json.dumps(pipeline, ensure_ascii=False)}")
            resources.script_id = script_id
            script_detail = fetch_script_detail(
                client,
                backend_base_url=backend_base_url,
                headers=headers,
                script_id=script_id,
            )
            print(json.dumps(
                {
                    "pipeline_run_id": run_id,
                    "script_id": script_id,
                    "title": script_detail.get("title"),
                    "mode": script_detail.get("mode"),
                    "body_html_preview": (script_detail.get("body_html") or "")[:300],
                },
                ensure_ascii=False,
                indent=2,
            ))
        finally:
            if args.cleanup:
                cleanup_resources(client, backend_base_url=backend_base_url, headers=headers, resources=resources)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ScriptGenerationCheckError as exc:
        print(f"[test-dify-script-generation] {exc}")
        raise SystemExit(1)
