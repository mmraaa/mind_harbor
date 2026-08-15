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

    # 认证
    jwt_secret: str = "dev-change-me-0123456789abcdefghij"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

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

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
