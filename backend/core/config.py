"""
应用程序配置管理模块

从环境变量加载配置，提供合理的默认值
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """
    从环境变量加载的应用程序配置

    所有敏感值应通过环境变量或 .env 文件设置（.env 文件已被 gitignore 忽略）
    """

    # 应用程序配置
    APP_NAME: str = Field(default="SparkFlow API", description="应用名称")
    APP_VERSION: str = Field(default="0.1.0", description="应用版本")
    DEBUG: bool = Field(default=False, description="调试模式")

    # 服务器配置
    HOST: str = Field(default="0.0.0.0", description="服务器主机")
    PORT: int = Field(default=8000, description="服务器端口")

    # 安全配置
    SECRET_KEY: str = Field(
        default="change-this-in-production",
        description="JWT 签名密钥"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=1440,  # 24 小时
        description="JWT 令牌过期时间（分钟）"
    )

    # 数据库配置
    DATABASE_URL: str = Field(
        default="sqlite:///./data.db",
        description="SQLAlchemy 数据库 URL"
    )

    # LLM 配置
    LLM_PROVIDER: str = Field(
        default="qwen",
        description="LLM 提供商: qwen, wenxin, zhipu, openai"
    )
    LLM_MODEL: str = Field(
        default="qwen-turbo",
        description="LLM 模型名称"
    )
    DASHSCOPE_API_KEY: Optional[str] = Field(
        default=None,
        description="阿里云 DashScope API Key"
    )

    # STT 配置
    STT_PROVIDER: str = Field(
        default="dashscope",
        description="STT 提供商: dashscope, aliyun, xunfei, baidu"
    )
    # 阿里云百炼/灵积平台 (推荐，仅需一个 API Key)
    # DASHSCOPE_API_KEY 已在上面的 LLM 配置中定义，可复用
    # 如需单独配置 STT 的 API Key，可添加: DASHSCOPE_STT_API_KEY

    # 阿里云 NLS (传统方式，需要三个密钥)
    ALIBABA_CLOUD_ACCESS_KEY_ID: Optional[str] = Field(
        default=None,
        description="阿里云 Access Key ID (NLS 传统方式)"
    )
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: Optional[str] = Field(
        default=None,
        description="阿里云 Access Key Secret (NLS 传统方式)"
    )
    ALIBABA_CLOUD_APP_KEY: Optional[str] = Field(
        default=None,
        description="阿里云 NLS App Key (传统方式)"
    )

    # Embedding 配置
    EMBEDDING_PROVIDER: str = Field(
        default="qwen",
        description="Embedding 提供商: qwen, baidu, zhipu"
    )
    EMBEDDING_MODEL: str = Field(
        default="text-embedding-v2",
        description="Embedding 模型名称"
    )

    # 向量数据库配置
    VECTOR_DB_PROVIDER: str = Field(
        default="chromadb",
        description="向量数据库提供商: chromadb, pinecone, qdrant"
    )
    CHROMADB_PATH: str = Field(
        default="./chroma_data",
        description="ChromaDB 持久化存储路径"
    )

    # 存储配置
    UPLOAD_DIR: str = Field(
        default="./uploads",
        description="上传音频文件的存储目录"
    )
    MAX_UPLOAD_SIZE: int = Field(
        default=50 * 1024 * 1024,  # 50MB
        description="最大上传文件大小（字节）"
    )

    class Config:
        """Pydantic 配置"""
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

    def ensure_directories(self):
        """确保所需目录存在"""
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
    获取缓存的配置实例

    使用 lru_cache 避免每次调用时重新加载配置
    """
    settings = Settings()
    settings.ensure_directories()
    return settings


# 全局配置实例
settings = get_settings()
