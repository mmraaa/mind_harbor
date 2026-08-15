"""工具注册表:Agent 的 7 个可调用工具统一在此登记。

每个工具:
- `name`:function-calling 工具名;
- `description`:LLM 决定是否调用时的依据(写清何时该用);
- `parameters`:JSON Schema 入参;
- `handler(db, user_id, session_id, **kwargs) -> dict`:执行并返回结构化结果。

handler 返回的 dict 即 tool_card 事件的 payload 基础(前端渲染卡片)。
"""

from dataclasses import dataclass
from typing import Callable

Handler = Callable[..., dict]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict
    handler: Handler


class ToolRegistry:
    """进程内工具注册表;由各工具模块在 import 时注册。"""

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        if spec.name in self._tools:
            raise ValueError(f"工具重名: {spec.name}")
        self._tools[spec.name] = spec

    def get(self, name: str) -> ToolSpec:
        if name not in self._tools:
            raise KeyError(f"未注册的工具: {name}")
        return self._tools[name]

    def names(self) -> list[str]:
        return sorted(self._tools)

    def openai_tools(self) -> list[dict]:
        """转成 OpenAI function-calling 的 tools 数组。"""
        return [
            {
                "type": "function",
                "function": {
                    "name": spec.name,
                    "description": spec.description,
                    "parameters": spec.parameters,
                },
            }
            for spec in sorted(self._tools.values(), key=lambda s: s.name)
        ]


registry = ToolRegistry()
