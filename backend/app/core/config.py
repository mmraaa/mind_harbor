from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置,统一从环境变量 / .env 读取。"""

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        extra="ignore",
    )

    # 应用
    app_name: str = "MindHarbor"
    api_prefix: str = "/api/v1"

    # 数据库
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "mindharbor"
    postgres_user: str = "mindharbor"
    postgres_password: str = "mindharbor"

    # 局域网镜像库:默认关闭,测试和单机开发不会产生外部写入。
    sync_enabled: bool = False
    sync_postgres_host: str = ""
    sync_postgres_port: int = 5432
    sync_postgres_db: str = ""
    sync_postgres_user: str = ""
    sync_postgres_password: str = ""

    # 认证
    jwt_secret: str = "dev-change-me-0123456789abcdefghij"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # 团队后端身份回查地址：仅随手画本机路由在 JWT 密钥不一致时使用。
    team_backend_base_url: str = ""

    # CORS(团队开发环境放开所有来源,生产请收紧为白名单)
    cors_origins: list[str] = ["*"]

    # 大模型
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = "deepseek-v4-flash"

    # Milvus(向量库,本机 Docker 已部署,端口 19530)
    milvus_host: str = "localhost"
    milvus_port: int = 19530
    milvus_collection: str = "knowledge_chunks"

    # Embedding
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model: str = ""
    embedding_dim: int = 1024  # 向量维度,须与所用 embedding 模型一致

    # TTS
    tts_api_key: str = ""
    tts_base_url: str = ""
    tts_model: str = ""
    tts_voice: str = ""

    # 随手画 AI 审核(管理员 API 配置表优先;环境变量只作首次初始化 fallback)
    doodle_review_api_key: str = ""
    doodle_review_base_url: str = ""
    doodle_review_model: str = ""

    # 独立的每日画像分析服务；不影响学生聊天模型和管理端配置。
    profile_analysis_api_key: str = ""
    profile_analysis_base_url: str = ""
    profile_analysis_model: str = "qwen3.7-plus"
    profile_analysis_timeout_seconds: int = 120

    @property
    def sync_database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.sync_postgres_user}:{self.sync_postgres_password}"
            f"@{self.sync_postgres_host}:{self.sync_postgres_port}/{self.sync_postgres_db}"
        )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
