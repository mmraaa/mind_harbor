"""从运行中的后端 OpenAPI 生成 API 文档(前端/后端接口契约)。

用法(working dir: backend/,后端需在 http://<host>:8000 运行):
    python scripts/gen_api_docs.py [base_url]

产出:
    ../docs/openapi.json  — 原生 OpenAPI 规格
    ../docs/api.md        — 人读 Markdown(鉴权/端点总览/请求体 schema/响应类型)
"""

import json
import sys
from pathlib import Path

import httpx

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"

API_PREFIX = "/api/v1"
# 接口文档展示基址(团队访问用,可经环境变量覆盖)
DISPLAY_BASE = "http://172.16.2.91:8000/api/v1"


def _summary_for(path: str, method: str, spec: dict) -> str:
    ops = spec["paths"].get(path, {})
    op = ops.get(method) or {}
    return (op.get("summary") or op.get("operationId") or f"{method.upper()} {path}").replace(
        " ", " "
    )


def _payload_fields(schema: dict, components: dict, indent: str = "  ") -> list[str]:
    """展开请求体 schema 的字段行(支持 $ref / object / array)。"""
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        return _payload_fields(components.get("schemas", {}).get(name, {}), components, indent)
    if schema.get("type") == "array":
        return _payload_fields(schema.get("items", {}), components, indent)
    props = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    rows = []
    for name, p in props.items():
        t = p.get("type", "object")
        if t == "array":
            t = f"array<{p.get('items', {}).get('type', '?')}>"
        mark = "*" if name in required else ""
        desc = p.get("description", "")
        rows.append(f"{indent}- `{name}`{mark} ({t}) {desc}".rstrip())
        if t == "object" and "properties" in p:
            rows.extend(_payload_fields(p, components, indent + "  "))
    return rows


def main() -> None:
    DOCS_DIR.mkdir(exist_ok=True)
    spec = httpx.get(f"{BASE}/openapi.json", timeout=10).json()
    (DOCS_DIR / "openapi.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")

    components = spec.get("components", {})
    lines: list[str] = []
    lines.append("# MindHarbor API 文档")
    lines.append("")
    lines.append(f"> 由 `scripts/gen_api_docs.py` 从运行中的后端自动生成(共 {len(spec['paths'])} 个端点)。")
    lines.append(f"> 接口基址:`{DISPLAY_BASE}`")
    lines.append("")
    lines.append("## 鉴权")
    lines.append("")
    lines.append("除 `auth/login`、`auth/register`、`health` 外,所有请求头需携带:")
    lines.append("")
    lines.append("```http")
    lines.append("Authorization: Bearer <access_token>")
    lines.append("```")
    lines.append("")
    lines.append("## 端点总览")
    lines.append("")
    lines.append("| 方法 | 路径 | 说明 |")
    lines.append("|---|---|---|")
    for path, ops in spec["paths"].items():
        for method in ("get", "post", "put", "delete", "patch"):
            if method in ops:
                lines.append(f"| {method.upper()} | `{API_PREFIX}{path}` | {_summary_for(path, method, spec)} |")
    lines.append("")

    for path, ops in spec["paths"].items():
        for method in ("get", "post", "put", "delete", "patch"):
            op = ops.get(method)
            if not op:
                continue
            lines.append(f"## {method.upper()} `{API_PREFIX}{path}`")
            lines.append("")
            if op.get("summary"):
                lines.append(f"**说明**:{op['summary']}")
                lines.append("")
            body = op.get("requestBody") or {}
            content = (body.get("content") or {}).get("application/json") or {}
            schema = content.get("schema")
            if schema:
                lines.append("**请求体**:")
                lines.append("")
                lines.extend(_payload_fields(schema, components))
                lines.append("")
            resp = op.get("responses", {}).get("200", {})
            resp_content = (resp.get("content") or {}).get("application/json") or {}
            lines.append(f"**响应**:`{resp.get('description', '200')}`")
            if resp_content.get("schema"):
                lines.append("")
                lines.extend(_payload_fields(resp_content["schema"], components, indent="  "))
            lines.append("")

    (DOCS_DIR / "api.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"[ok] openapi.json({len(spec['paths'])} paths) + api.md → {DOCS_DIR}")


if __name__ == "__main__":
    main()
