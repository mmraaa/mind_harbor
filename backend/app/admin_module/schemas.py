from pydantic import BaseModel, Field


class CounselorCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=64)
    name: str = Field(min_length=1, max_length=64)
    title: str = Field(default="", max_length=64)
    specialty: str = Field(default="", max_length=256)
    bio: str = Field(default="", max_length=1024)
    availability: str = Field(default="", max_length=256)


class CounselorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    password: str | None = Field(default=None, min_length=6, max_length=64)
    title: str | None = Field(default=None, max_length=64)
    specialty: str | None = Field(default=None, max_length=256)
    bio: str | None = Field(default=None, max_length=1024)
    availability: str | None = Field(default=None, max_length=256)
    is_enabled: bool | None = None


class StudentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    risk_tags: list[str] | None = Field(default=None, max_length=12)
    is_enabled: bool | None = None


class ResourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    type: str = Field(default="article", min_length=1, max_length=32)
    content: str = Field(default="")
    url: str | None = Field(default=None, max_length=256)
    is_active: bool = True


class ResourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=128)
    type: str | None = Field(default=None, min_length=1, max_length=32)
    content: str | None = None
    url: str | None = Field(default=None, max_length=256)
    is_active: bool | None = None


class ApiFallbackConfig(BaseModel):
    enabled: bool = False
    base_url: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=128)
    api_key: str | None = Field(default=None, max_length=4096)


class ApiServiceConfigUpdate(BaseModel):
    enabled: bool | None = None
    base_url: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=128)
    # 空值表示保持原值，避免前端刷新时意外清空密钥。
    api_key: str | None = Field(default=None, max_length=4096)
    context_window: int | None = Field(default=None, ge=256, le=2_000_000)
    max_tokens: int | None = Field(default=None, ge=1, le=1_000_000)
    timeout_seconds: int | None = Field(default=None, ge=1, le=600)
    token_budget: int | None = Field(default=None, ge=0, le=2_000_000_000)
    fallback: ApiFallbackConfig | None = None
