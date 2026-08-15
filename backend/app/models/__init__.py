"""模型注册:导入本模块即可让 Base.metadata 包含全部表。"""

from app.models.emotion import Emotion, Journal
from app.models.knowledge import KnowledgeChunk, KnowledgeDoc
from app.models.memory import UserMemory
from app.models.resource import Reminder, Resource
from app.models.session import ChatSession, Favorite, Message
from app.models.user import Counselor, User

__all__ = [
    "User",
    "Counselor",
    "ChatSession",
    "Message",
    "Favorite",
    "Emotion",
    "Journal",
    "Resource",
    "Reminder",
    "KnowledgeDoc",
    "KnowledgeChunk",
    "UserMemory",
]
