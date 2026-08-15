"""陪伴 Agent:function-calling 工具决策循环。

职责:判断用户意图是否需要调用工具(知识检索/呼吸练习/提醒/资源/
情绪统计/语音/情绪记录),执行并回填结果;最终回复的流式输出由
`dialogue.py` 负责(避免双流式出口)。

`run()` 返回 (tool_cards, tool_context):
- tool_cards:tool_card 事件 payload 列表(前端渲染卡片);
- tool_context:工具结果文本,注入最终回复的上下文(LLM 基于它作答)。
"""

import json
import logging

from sqlalchemy.orm import Session

from app.adapters import llm as llm_adapter
from app.ai.tools import registry as tools_registry

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 3

TOOL_SYSTEM_PROMPT = (
    "你是陪伴助手,可以调用工具帮助用户。"
    "规则:"
    "1. 当用户询问心理常识、校园咨询流程、压力应对、自助练习、求助渠道等知识类问题时,"
    "   **必须调用 search_knowledge 工具检索知识库**,不得跳过、不得凭记忆编造作答;"
    "2. 用户提及书籍/文章/游戏/求助渠道等资源需求,或可能受益于心理资源时,"
    "   **主动调用 recommend_resources** 推荐资源卡片;"
    "3. 用户感到孤单/难过、希望被安抚,或回复内容适合用声音陪伴时,"
    "   **调用 speak_voice** 把一段安抚/鼓励的话合成为语音推给前端(可与其他工具组合);"
    "4. 调用 search_knowledge 时,query 参数请提炼为简短的核心检索词(如'心理咨询 预约'、'考试焦虑 缓解'),不要传整段口语;"
    "5. **可在一次对话中依次/同时调用多个工具**(例如:先 search_knowledge 获取知识引用,"
    "   再用 speak_voice 将安抚语生成语音;或 recommend_resources + speak_voice 组合);"
    "   工具结果会返回给你,请据实使用,不要编造工具没有给出的内容。"
)


def _dispatch(db: Session, user_id: int, session_id: int, name: str, arguments: str) -> dict:
    """执行单个工具调用;未知工具/参数解析失败返回错误结果而非崩溃。"""
    try:
        spec = tools_registry.registry.get(name)
    except KeyError:
        return {"error": f"未知工具: {name}"}
    try:
        kwargs = json.loads(arguments) if arguments else {}
        if not isinstance(kwargs, dict):
            kwargs = {}
    except json.JSONDecodeError:
        kwargs = {}
    try:
        return spec.handler(db, user_id, session_id, **kwargs)
    except Exception as exc:  # noqa: BLE001  工具失败不中断循环,交给 LLM 转述
        logger.exception("工具执行失败(name=%s)", name)
        return {"error": f"工具执行失败:{type(exc).__name__}"}


def run(
    db: Session,
    user_id: int,
    session_id: int,
    user_content: str,
    system_prompt: str,
    context: str,
) -> tuple[list[dict], str]:
    """工具决策循环(最多 MAX_TOOL_ROUNDS 轮)。

    Returns:
        (tool_cards, tool_context):卡片 payload 列表;工具结果文本(可为空串)。
    """
    tools = tools_registry.registry.openai_tools()
    messages: list[dict] = [
        {"role": "system", "content": system_prompt + "\n\n" + TOOL_SYSTEM_PROMPT},
        {"role": "user", "content": f"【对话上下文】\n{context}\n\n【用户本轮消息】\n{user_content}"},
    ]

    cards: list[dict] = []
    results: list[str] = []

    for _ in range(MAX_TOOL_ROUNDS):
        content, tool_calls = llm_adapter.chat_with_tools(messages, tools)
        # 先把 LLM 响应消息入列(tool 消息必须以带 tool_calls 的消息为前提)
        messages.append(
            {
                "role": "assistant",
                "content": content or None,
                "tool_calls": tool_calls or None,
            }
        )
        if not tool_calls:
            break

        # 支持一轮返回多个 tool_call(如 search_knowledge + speak_voice 组合)
        for call in tool_calls:
            fn = call.get("function") or {}
            name = fn.get("name") or ""
            arguments = fn.get("arguments") or "{}"

            result = _dispatch(db, user_id, session_id, name, arguments)
            call_id = call.get("id") or "0"
            messages.append(
                {"role": "tool", "tool_call_id": call_id, "content": json.dumps(result, ensure_ascii=False)}
            )
            if "error" in result:
                continue  # 不把错误结果当成功卡片

            cards.append(result)
            results.append(json.dumps(result, ensure_ascii=False))

    tool_context = ""
    if results:
        tool_context = "【工具结果】\n" + "\n".join(results)
    return cards, tool_context
