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

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
