from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, description="用户名 3-32 字符")
    password: str = Field(min_length=6, max_length=64, description="密码至少 6 位")
    name: str = Field(default="", max_length=64, description="昵称")


class UserOut(BaseModel):
    id: int
    username: str
    name: str
    role: str
    display_username: str = ""
    gender: str = ""

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    """修改基础资料:当前仅支持昵称 name;role/username 固定不可改。

    email/phone 为后续功能,暂不提供字段。
    `model_config["extra"]="allow"` 仅为让 handler 能探测到显式传入的
    role/username 并返回 400,而不是被 pydantic 静默忽略。
    """

    name: str | None = Field(default=None, min_length=1, max_length=64, description="昵称 1-64 字符")

    model_config = {"extra": "allow"}


class AccountUpdate(BaseModel):
    """学生账户资料；username 是登录账号，永远不可修改。"""

    username: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=64)
    gender: str | None = Field(default=None, max_length=16)
    display_username: str | None = Field(default=None, min_length=1, max_length=64)
    model_config = {"extra": "forbid"}


class PasswordChange(BaseModel):
    """修改密码:须携带旧密码校验;新密码长度在 handler 校验以确保 400 语义。"""

    old_password: str = Field(max_length=64)
    new_password: str = Field(max_length=64)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
