from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── App ──────────────────────────────────────
    APP_TITLE: str = "AutoQA Gen API"
    APP_VERSION: str = "1.0.0"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # ── Security / JWT ───────────────────────────
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── MongoDB ──────────────────────────────────
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "autoqa_gen"

    # ── Elasticsearch ─────────────────────────────
    ELASTICSEARCH_URL: str = "http://localhost:9200"

    # ── Email / SMTP ─────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "AutoQA Gen <no-reply@autoqa.gen>"
    FRONTEND_URL: str = "http://localhost:5173"

    # ── LLM Providers ────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-5"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
