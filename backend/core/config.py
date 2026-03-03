"""
Application configuration management.

Loads configuration from environment variables with sensible defaults.
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    All sensitive values should be set via environment variables
    or a .env file (which is gitignored).
    """

    # Application
    APP_NAME: str = Field(default="SparkFlow API", description="Application name")
    APP_VERSION: str = Field(default="0.1.0", description="Application version")
    DEBUG: bool = Field(default=False, description="Debug mode")

    # Server
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8000, description="Server port")

    # Security
    SECRET_KEY: str = Field(
        default="change-this-in-production",
        description="JWT signing key"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=1440,  # 24 hours
        description="JWT token expiration in minutes"
    )

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./data.db",
        description="SQLAlchemy database URL"
    )

    # LLM Configuration
    LLM_PROVIDER: str = Field(
        default="qwen",
        description="LLM provider: qwen, wenxin, zhipu, openai"
    )
    LLM_MODEL: str = Field(
        default="qwen-turbo",
        description="LLM model name"
    )
    DASHSCOPE_API_KEY: Optional[str] = Field(
        default=None,
        description="Alibaba Cloud DashScope API Key"
    )

    # STT Configuration
    STT_PROVIDER: str = Field(
        default="aliyun",
        description="STT provider: aliyun, xunfei, baidu"
    )
    ALIBABA_CLOUD_ACCESS_KEY_ID: Optional[str] = Field(
        default=None,
        description="Alibaba Cloud Access Key ID"
    )
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: Optional[str] = Field(
        default=None,
        description="Alibaba Cloud Access Key Secret"
    )
    ALIBABA_CLOUD_APP_KEY: Optional[str] = Field(
        default=None,
        description="Alibaba Cloud NLS App Key"
    )

    # Embedding Configuration
    EMBEDDING_PROVIDER: str = Field(
        default="qwen",
        description="Embedding provider: qwen, baidu, zhipu"
    )
    EMBEDDING_MODEL: str = Field(
        default="text-embedding-v2",
        description="Embedding model name"
    )

    # Vector Database Configuration
    VECTOR_DB_PROVIDER: str = Field(
        default="chromadb",
        description="Vector DB provider: chromadb, pinecone, qdrant"
    )
    CHROMADB_PATH: str = Field(
        default="./chroma_data",
        description="ChromaDB persistent storage path"
    )

    # Storage
    UPLOAD_DIR: str = Field(
        default="./uploads",
        description="Directory for uploaded audio files"
    )
    MAX_UPLOAD_SIZE: int = Field(
        default=50 * 1024 * 1024,  # 50MB
        description="Maximum upload file size in bytes"
    )

    class Config:
        """Pydantic config."""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

    def ensure_directories(self):
        """Ensure required directories exist."""
        directories = [
            self.UPLOAD_DIR,
            self.CHROMADB_PATH,
            os.path.dirname(self.DATABASE_URL.replace("sqlite:///", ""))
            if self.DATABASE_URL.startswith("sqlite:///.")
            else None,
        ]
        for directory in directories:
            if directory and not os.path.exists(directory):
                os.makedirs(directory, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Uses lru_cache to avoid reloading settings on every call.
    """
    settings = Settings()
    settings.ensure_directories()
    return settings


# Global settings instance
settings = get_settings()
