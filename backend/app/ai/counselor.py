"""咨询师端 Agent:帮助学生管理、情绪日记检索、异常学生识别、统计报表。

与客户端共享 `agent.run` 编排,但使用**独立工具注册表**(counselor_registry),
避免把「查任意学生数据」的能力暴露给学生端。

工具:
- `query_student_stats`:SQL Agent(自然语言→只读 SQL→表格结果),查指定学生或全体;
- `search_student_journals`:按学生查情绪日记(含情绪);
- `find_at_risk_students`:识别情绪异常学生(高强度负面情绪 / 高风险会话)。

所有查询只读 + SQL 白名单(AST 校验),权限由 API 层 require_roles("counselor","admin") 保证。
"""

from dataclasses import dataclass

from app.ai.tools.registry import ToolRegistry

counselor_registry = ToolRegistry()

COUNSELOR_SYSTEM_PROMPT = (
    "你是 MindHarbor 的咨询师端助手,帮助咨询师分析学生心理健康数据。"
    "可以调用工具查询学生情绪、日记与统计。"
    "规则:"
    "1. 咨询师想了解情绪统计/趋势/分布时,**必须调用 query_student_stats**(自然语言查询);"
    "2. 咨询师要查看某学生情绪日记时,调用 search_student_journals;"
    "3. 咨询师想排查情绪异常/高风险学生时,调用 find_at_risk_students;"
    "4. 查询只读,结果请如实转述,不要编造数据;回答用简洁专业的中文。"
    "5. 当学生触及到专业知识或需要调节压力时,调用search_knowledge"
    "5. 当学生需要安慰和推荐资源时,调用recommend_resources"
    "6. 可在一次对话中依次调用多个工具。"
)


@dataclass
class CounselorRun:
    """咨询师 Agent 一次运行的结果。"""

    cards: list[dict]
    reply: str
