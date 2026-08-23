from typing import Dict

from pydantic import BaseModel, Field


class ProfileConsentUpdate(BaseModel):
    enabled: bool


class ProfileQuestionnaireSubmit(BaseModel):
    # 新契约为 30 题；保留旧三项答案以兼容已部署的前端。
    answers: Dict[str, str] = Field(min_length=3, max_length=30)


class ProfileSelfEdit(BaseModel):
    updates: Dict[str, str] = Field(min_length=1, max_length=30)
