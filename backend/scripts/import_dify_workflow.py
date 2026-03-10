#!/usr/bin/env python3
"""导入 Dify DSL、提取工作流标识并回填 SparkFlow 后端环境变量。"""

from __future__ import annotations

import argparse
import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx


DEFAULT_DSL_PATH = Path(__file__).resolve().parent.parent / "dify_dsl" / "sparkflow_script_generation.workflow.yml"
DEFAULT_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
DEFAULT_TIMEOUT = 30.0


class DifyImportError(RuntimeError):
    """标记导入流程中的可读失败。"""


@dataclass
class ConsoleSession:
    """保存调用 Dify console API 所需的会话信息。"""

    client: httpx.Client
    csrf_token: str
    console_api_base: str


@dataclass
class ImportResult:
    """收敛脚本导入后需要回填的关键信息。"""

    app_id: str
    workflow_id: str
    api_key: str
    runtime_api_base: str


def normalize_runtime_api_base(raw_value: str) -> str:
    """把运行时地址标准化为 Dify `/v1` API 基址。"""
    value = (raw_value or "").strip().rstrip("/")
    if not value:
        raise DifyImportError("缺少 Dify 地址，请传入 --dify-base-url 或先在 backend/.env 配置 DIFY_BASE_URL")
    if value.endswith("/console/api"):
        value = value[: -len("/console/api")]
    if value.endswith("/v1"):
        return value
    return f"{value}/v1"


def normalize_console_api_base(raw_value: str) -> str:
    """把输入地址标准化为 Dify `/console/api` 基址。"""
    value = (raw_value or "").strip().rstrip("/")
    if not value:
        raise DifyImportError("缺少 Dify console 地址")
    if value.endswith("/console/api"):
        return value
    if value.endswith("/v1"):
        value = value[: -len("/v1")]
    return f"{value}/console/api"


def build_origin(console_api_base: str) -> str:
    """从 console API 地址恢复浏览器 Origin，兼容 Dify 的同源校验。"""
    parsed = urlparse(console_api_base)
    if not parsed.scheme or not parsed.netloc:
        raise DifyImportError(f"Dify console 地址无效: {console_api_base}")
    return f"{parsed.scheme}://{parsed.netloc}"


def load_env_map(env_file: Path) -> dict[str, str]:
    """读取环境文件中的简单键值，供默认参数回退使用。"""
    if not env_file.exists():
        return {}
    result: dict[str, str] = {}
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip()
    return result


def update_env_text(content: str, updates: dict[str, str]) -> str:
    """更新 `.env` 文本中的目标键，缺失时自动追加。"""
    lines = content.splitlines()
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        replaced = False
        for key, value in updates.items():
            if line.startswith(f"{key}="):
                output.append(f"{key}={value}")
                seen.add(key)
                replaced = True
                break
        if not replaced:
            output.append(line)
    if output and output[-1] != "":
        output.append("")
    for key, value in updates.items():
        if key not in seen:
            output.append(f"{key}={value}")
    return "\n".join(output).rstrip() + "\n"


def write_env_updates(env_file: Path, updates: dict[str, str]) -> None:
    """把导入结果稳定写回 backend `.env`。"""
    existing = env_file.read_text(encoding="utf-8") if env_file.exists() else ""
    env_file.write_text(update_env_text(existing, updates), encoding="utf-8")


def extract_cookie_value(cookies: httpx.Cookies, suffix: str) -> str | None:
    """从 Dify cookie jar 中提取 access/csrf token，兼容 __Host- 前缀。"""
    for name, value in cookies.items():
        if name == suffix or name.endswith(suffix):
            return value
    return None


def build_common_headers(origin: str, csrf_token: str | None = None) -> dict[str, str]:
    """构造 console API 需要的基础请求头。"""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": origin,
        "Referer": f"{origin}/",
    }
    if csrf_token:
        headers["X-CSRF-Token"] = csrf_token
    return headers


def login_console(
    *,
    console_api_base: str,
    email: str,
    password: str,
    timeout: float,
) -> ConsoleSession:
    """使用邮箱密码登录 Dify console，并提取后续调用所需 cookie。"""
    origin = build_origin(console_api_base)
    client = httpx.Client(timeout=timeout, follow_redirects=True)
    encoded_password = base64.b64encode(password.encode("utf-8")).decode("utf-8")
    response = client.post(
        f"{console_api_base}/login",
        json={"email": email, "password": encoded_password, "remember_me": True},
        headers=build_common_headers(origin),
    )
    if response.status_code >= 400:
        raise DifyImportError(f"Dify 登录失败: {response.status_code} {response.text}")
    access_token = extract_cookie_value(client.cookies, "access_token")
    csrf_token = extract_cookie_value(client.cookies, "csrf_token")
    if not access_token or not csrf_token:
        raise DifyImportError("Dify 登录成功，但未拿到 access_token/csrf_token cookie")
    return ConsoleSession(client=client, csrf_token=csrf_token, console_api_base=console_api_base)


def attach_existing_session(
    *,
    console_api_base: str,
    access_token: str,
    csrf_token: str,
    timeout: float,
) -> ConsoleSession:
    """基于已有 token 组装可复用的 console 会话。"""
    origin = build_origin(console_api_base)
    client = httpx.Client(timeout=timeout, follow_redirects=True)
    parsed = urlparse(origin)
    secure = parsed.scheme == "https"
    client.cookies.set("access_token", access_token, domain=parsed.hostname, path="/", secure=secure)
    client.cookies.set("csrf_token", csrf_token, domain=parsed.hostname, path="/", secure=secure)
    return ConsoleSession(client=client, csrf_token=csrf_token, console_api_base=console_api_base)


def request_json(
    session: ConsoleSession,
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """执行一次带 CSRF 的 console API 请求并返回 JSON。"""
    origin = build_origin(session.console_api_base)
    response = session.client.request(
        method,
        f"{session.console_api_base}{path}",
        json=json_body,
        headers=build_common_headers(origin, session.csrf_token),
    )
    try:
        payload = response.json()
    except ValueError as exc:
        raise DifyImportError(f"Dify 返回了非 JSON 响应: {response.text[:300]}") from exc
    if response.status_code >= 400:
        message = payload.get("message") or payload.get("error") or response.text
        raise DifyImportError(f"Dify 请求失败: {response.status_code} {message}")
    if not isinstance(payload, dict):
        raise DifyImportError("Dify 返回结构无效")
    return payload


def import_dsl(
    session: ConsoleSession,
    *,
    dsl_content: str,
    app_id: str | None,
) -> dict[str, Any]:
    """导入 DSL，并在需要时自动确认版本兼容提示。"""
    payload: dict[str, Any] = {"mode": "yaml-content", "yaml_content": dsl_content}
    if app_id:
        payload["app_id"] = app_id
    result = request_json(session, "POST", "/apps/imports", json_body=payload)
    status = str(result.get("status") or "")
    if status == "pending":
        import_id = result.get("id")
        if not isinstance(import_id, str) or not import_id:
            raise DifyImportError("Dify 导入返回 pending，但缺少 import id")
        result = request_json(session, "POST", f"/apps/imports/{import_id}/confirm", json_body={})
        status = str(result.get("status") or "")
    if status not in {"completed", "completed-with-warnings"}:
        raise DifyImportError(f"Dify DSL 导入失败: {json.dumps(result, ensure_ascii=False)}")
    return result


def import_dsl_with_fallback(
    session: ConsoleSession,
    *,
    dsl_content: str,
    app_id: str | None,
) -> dict[str, Any]:
    """优先更新目标 app，不存在时自动回退为新建。"""
    if not app_id:
        return import_dsl(session, dsl_content=dsl_content, app_id=None)
    try:
        return import_dsl(session, dsl_content=dsl_content, app_id=app_id)
    except DifyImportError as exc:
        # 中文注释：当历史 app 已被删除时，自动改走新建，避免人工先清理 env。
        if "not found" not in str(exc).lower() and "404" not in str(exc):
            raise
        return import_dsl(session, dsl_content=dsl_content, app_id=None)


def publish_workflow(session: ConsoleSession, *, app_id: str) -> None:
    """发布当前 app 的 draft workflow，确保运行态可见。"""
    request_json(
        session,
        "POST",
        f"/apps/{app_id}/workflows/publish",
        json_body={"marked_name": "", "marked_comment": ""},
    )


def fetch_app_detail(session: ConsoleSession, *, app_id: str) -> dict[str, Any]:
    """读取应用详情，用于提取 workflow id。"""
    return request_json(session, "GET", f"/apps/{app_id}")


def fetch_workflow_detail(session: ConsoleSession, *, app_id: str, draft: bool) -> dict[str, Any]:
    """读取草稿或已发布 workflow，兼容不同版本 Dify 的返回结构。"""
    path = f"/apps/{app_id}/workflows/draft" if draft else f"/apps/{app_id}/workflows/publish"
    return request_json(session, "GET", path)


def resolve_workflow_id(session: ConsoleSession, *, app_id: str, app_detail: dict[str, Any]) -> str:
    """优先从 app detail 读取 workflow id，缺失时回退到 workflow 专用接口。"""
    workflow = app_detail.get("workflow") if isinstance(app_detail.get("workflow"), dict) else {}
    workflow_id = workflow.get("id")
    if isinstance(workflow_id, str) and workflow_id.strip():
        return workflow_id
    for draft in (False, True):
        detail = fetch_workflow_detail(session, app_id=app_id, draft=draft)
        workflow_id = detail.get("id")
        if isinstance(workflow_id, str) and workflow_id.strip():
            return workflow_id
    raise DifyImportError(f"Dify 未返回可用 workflow id: {json.dumps(app_detail, ensure_ascii=False)}")


def fetch_existing_api_keys(session: ConsoleSession, *, app_id: str) -> list[dict[str, Any]]:
    """列出应用 API key，优先复用已有 token。"""
    payload = request_json(session, "GET", f"/apps/{app_id}/api-keys")
    items = payload.get("data")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def create_api_key(session: ConsoleSession, *, app_id: str) -> dict[str, Any]:
    """为导入后的应用创建一枚新的 API key。"""
    payload = request_json(session, "POST", f"/apps/{app_id}/api-keys", json_body={})
    if "token" not in payload:
        raise DifyImportError(f"Dify 创建 API key 返回缺少 token: {json.dumps(payload, ensure_ascii=False)}")
    return payload


def ensure_api_key(session: ConsoleSession, *, app_id: str, reuse_existing: bool) -> str:
    """复用现有 API key，必要时再创建。"""
    if reuse_existing:
        existing = fetch_existing_api_keys(session, app_id=app_id)
        for item in existing:
            token = item.get("token")
            if isinstance(token, str) and token.strip():
                return token
    created = create_api_key(session, app_id=app_id)
    token = created.get("token")
    if not isinstance(token, str) or not token.strip():
        raise DifyImportError("Dify 创建 API key 成功，但 token 为空")
    return token


def resolve_runtime_api_base(args: argparse.Namespace, env_map: dict[str, str]) -> str:
    """按 CLI、环境和 `.env` 的顺序解析 Dify 运行时地址。"""
    value = args.dify_base_url or os.getenv("DIFY_BASE_URL") or env_map.get("DIFY_BASE_URL") or ""
    if not value:
        value = "http://127.0.0.1:18080/v1"
    return normalize_runtime_api_base(value)


def resolve_target_app_id(args: argparse.Namespace, env_map: dict[str, str]) -> str | None:
    """按 CLI、环境和 `.env` 的顺序解析要更新的 Dify app_id。"""
    value = (
        args.app_id
        or os.getenv("DIFY_SCRIPT_APP_ID")
        or env_map.get("DIFY_SCRIPT_APP_ID")
        or ""
    ).strip()
    return value or None


def resolve_console_api_base(args: argparse.Namespace, runtime_api_base: str) -> str:
    """按 CLI 优先级解析 Dify console API 地址。"""
    return normalize_console_api_base(args.console_base_url or runtime_api_base)


def resolve_session(args: argparse.Namespace, *, console_api_base: str) -> ConsoleSession:
    """根据传入凭据建立 console API 会话。"""
    access_token = args.console_access_token or os.getenv("DIFY_CONSOLE_ACCESS_TOKEN")
    csrf_token = args.console_csrf_token or os.getenv("DIFY_CONSOLE_CSRF_TOKEN")
    if access_token and csrf_token:
        return attach_existing_session(
            console_api_base=console_api_base,
            access_token=access_token,
            csrf_token=csrf_token,
            timeout=args.timeout,
        )
    email = args.console_email or os.getenv("DIFY_CONSOLE_EMAIL")
    password = args.console_password or os.getenv("DIFY_CONSOLE_PASSWORD")
    if email and password:
        return login_console(
            console_api_base=console_api_base,
            email=email,
            password=password,
            timeout=args.timeout,
        )
    raise DifyImportError(
        "缺少 Dify console 凭据。请提供邮箱密码（--console-email/--console-password）"
        "或提供 token 对（--console-access-token/--console-csrf-token）。"
    )


def build_import_result(args: argparse.Namespace) -> ImportResult:
    """执行完整导入流程，并提取 SparkFlow 需要回填的值。"""
    env_map = load_env_map(args.env_file)
    runtime_api_base = resolve_runtime_api_base(args, env_map)
    console_api_base = resolve_console_api_base(args, runtime_api_base)
    target_app_id = resolve_target_app_id(args, env_map)
    dsl_content = args.dsl.read_text(encoding="utf-8")
    session = resolve_session(args, console_api_base=console_api_base)
    try:
        imported = import_dsl_with_fallback(session, dsl_content=dsl_content, app_id=target_app_id)
        app_id = imported.get("app_id")
        if not isinstance(app_id, str) or not app_id.strip():
            raise DifyImportError(f"Dify 导入成功，但缺少 app_id: {json.dumps(imported, ensure_ascii=False)}")
        if not args.skip_publish:
            publish_workflow(session, app_id=app_id)
        detail = fetch_app_detail(session, app_id=app_id)
        workflow_id = resolve_workflow_id(session, app_id=app_id, app_detail=detail)
        api_key = ensure_api_key(session, app_id=app_id, reuse_existing=not args.create_new_api_key)
        return ImportResult(
            app_id=app_id,
            workflow_id=workflow_id,
            api_key=api_key,
            runtime_api_base=runtime_api_base,
        )
    finally:
        session.client.close()


def parse_args() -> argparse.Namespace:
    """解析 CLI 参数。"""
    parser = argparse.ArgumentParser(description="导入 Dify workflow DSL 并回填 SparkFlow backend/.env")
    parser.add_argument("--dsl", type=Path, default=DEFAULT_DSL_PATH, help="要导入的 DSL 文件路径")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="要回填的后端环境文件")
    parser.add_argument("--dify-base-url", help="Dify 运行时 API 地址，例如 http://127.0.0.1:18080/v1")
    parser.add_argument("--console-base-url", help="Dify console API 地址或根地址，例如 http://127.0.0.1:18080")
    parser.add_argument("--console-email", help="Dify console 登录邮箱")
    parser.add_argument("--console-password", help="Dify console 登录密码")
    parser.add_argument("--console-access-token", help="已有 Dify console access token")
    parser.add_argument("--console-csrf-token", help="与 access token 配套的 csrf token")
    parser.add_argument("--app-id", help="已有 app_id；传入后会在该应用上执行 DSL 导入")
    parser.add_argument("--create-new-api-key", action="store_true", help="忽略已有 API key，强制新建一枚")
    parser.add_argument("--skip-publish", action="store_true", help="导入后不自动发布 workflow，仅保留 draft")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT, help="HTTP 超时时间，单位秒")
    return parser.parse_args()


def main() -> int:
    """执行命令行入口，并把结果写回后端环境变量。"""
    args = parse_args()
    if not args.dsl.exists():
        raise DifyImportError(f"DSL 文件不存在: {args.dsl}")
    result = build_import_result(args)
    updates = {
        "DIFY_BASE_URL": result.runtime_api_base,
        "DIFY_SCRIPT_APP_ID": result.app_id,
        "DIFY_API_KEY": result.api_key,
        "DIFY_SCRIPT_WORKFLOW_ID": result.workflow_id,
    }
    write_env_updates(args.env_file, updates)
    print(f"Imported app_id={result.app_id}")
    print(f"Resolved workflow_id={result.workflow_id}")
    print(f"Updated env_file={args.env_file}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DifyImportError as exc:
        print(f"[import-dify-workflow] {exc}")
        raise SystemExit(1)
