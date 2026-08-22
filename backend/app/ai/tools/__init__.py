"""工具包:import 本包即完成全部 6 个工具注册到 registry。"""

from app.ai.tools import (  # noqa: F401  导入即注册
    create_reminder,
    generate_breathing,
    query_emotion_stats,
    recommend_resources,
    record_emotion,
    search_knowledge,
)
