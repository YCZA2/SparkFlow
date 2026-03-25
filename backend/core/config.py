"""
应用程序配置管理模块

从环境变量加载配置，提供合理的默认值
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


FALSEY_DEBUG_VALUES = {"0", "false", "off", "no", "release", "prod", "production"}
TRUTHY_DEBUG_VALUES = {"1", "true", "on", "yes", "debug", "dev", "development"}
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_ENV_FILE = os.path.join(BACKEND_DIR, ".env")
DEFAULT_POSTGRES_URL = "postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow"


class Settings(BaseSettings):
    """
    从环境变量加载的应用程序配置

    所有敏感值应通过环境变量或 .env 文件设置（.env 文件已被 gitignore 忽略）
    """

    # 应用程序配置
    APP_NAME: str = Field(default="SparkFlow API", description="应用名称")
    APP_VERSION: str = Field(default="0.1.0", description="应用版本")
    DEBUG: bool = Field(default=False, description="调试模式")
    APP_TIMEZONE: str = Field(default="Asia/Shanghai", description="应用业务时区")
    LOG_LEVEL: str = Field(default="INFO", description="日志级别")
    LOG_JSON: bool = Field(default=False, description="是否输出 JSON 结构化日志")
    ENABLE_DAILY_PUSH_SCHEDULER: bool = Field(
        default=False,
        description="是否启用服务端 daily push 定时任务；local-first 第一阶段默认关闭",
    )
    ENABLE_WRITING_CONTEXT_SCHEDULER: bool = Field(
        default=True,
        description="是否启用每日写作上下文维护任务；用于静默刷新碎片方法论",
    )
    WRITING_CONTEXT_SCHEDULER_HOUR: int = Field(
        default=4,
        description="每日写作上下文维护任务执行小时",
    )
    WRITING_CONTEXT_SCHEDULER_MINUTE: int = Field(
        default=0,
        description="每日写作上下文维护任务执行分钟",
    )
    WRITING_CONTEXT_MIN_FRAGMENTS: int = Field(
        default=8,
        description="触发碎片方法论首轮提炼所需的最小碎片数",
    )
    WRITING_CONTEXT_MIN_INCREMENTAL_FRAGMENTS: int = Field(
        default=3,
        description="触发碎片方法论增量重算所需的最小新增碎片数",
    )

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
    ENABLE_TEST_AUTH: bool = Field(
        default=False,
        description="是否启用仅本地开发使用的测试令牌入口"
    )
    PHONE_VERIFICATION_CODE_TTL_SECONDS: int = Field(
        default=300,
        description="手机验证码有效期（秒）"
    )
    PHONE_VERIFICATION_CODE_RESEND_SECONDS: int = Field(
        default=60,
        description="手机验证码发送冷却时间（秒）"
    )
    PHONE_VERIFICATION_CODE_MAX_SENDS: int = Field(
        default=5,
        description="单个手机号在验证码有效窗口内允许发送的最大次数"
    )

    # 数据库配置
    DATABASE_URL: str = Field(
        default=DEFAULT_POSTGRES_URL,
        description="SQLAlchemy 数据库 URL"
    )
    SQLALCHEMY_ECHO: bool = Field(
        default=False,
        description="是否打印 SQLAlchemy SQL 日志"
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
    DOUYIN_COOKIE: Optional[str] = Field(
        default=None,
        description="抖音 Web Cookie，用于外部媒体导入时提高解析成功率"
    )

    # STT 配置
    STT_PROVIDER: str = Field(
        default="dashscope",
        description="STT 提供商: dashscope, aliyun, xunfei, baidu"
    )
    # 阿里云百炼/灵积平台 (推荐，仅需一个 API Key)
    # DASHSCOPE_API_KEY 已在上面的 LLM 配置中定义，可复用
    # 如需单独配置 STT 的 API Key，可添加: DASHSCOPE_STT_API_KEY
    STT_DIARIZATION_ENABLED: bool = Field(
        default=True,
        description="是否启用说话人分离（仅对支持模型生效）"
    )
    STT_DIARIZATION_SPEAKER_COUNT: int = Field(
        default=0,
        description="说话人数，0 表示自动识别"
    )
    STT_FILE_URL_MODE: str = Field(
        default="temp",
        description="录音文件识别的文件 URL 模式: temp | oss"
    )
    STT_DASHSCOPE_STRATEGY: str = Field(
        default="realtime",
        description="DashScope 转写策略: realtime | file | auto"
    )
    STT_REALTIME_TIMEOUT_SECONDS: int = Field(
        default=300,
        description="DashScope 实时识别超时时间（秒）"
    )
    STT_FILE_TRANSCRIPTION_TIMEOUT_SECONDS: int = Field(
        default=300,
        description="DashScope 录音文件识别超时时间（秒）"
    )

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
        default=os.path.join(BACKEND_DIR, "chroma_data"),
        description="ChromaDB 持久化存储路径"
    )

    # 存储配置
    FILE_STORAGE_PROVIDER: str = Field(
        default="local",
        description="文件存储提供方: local | oss"
    )
    UPLOAD_DIR: str = Field(
        default=os.path.join(BACKEND_DIR, "uploads"),
        description="上传音频文件的存储目录"
    )
    OSS_ENDPOINT: Optional[str] = Field(
        default=None,
        description="阿里云 OSS endpoint，例如 oss-cn-hangzhou.aliyuncs.com"
    )
    OSS_BUCKET: Optional[str] = Field(
        default=None,
        description="阿里云 OSS bucket 名称"
    )
    OSS_ACCESS_KEY_ID: Optional[str] = Field(
        default=None,
        description="阿里云 OSS Access Key ID"
    )
    OSS_ACCESS_KEY_SECRET: Optional[str] = Field(
        default=None,
        description="阿里云 OSS Access Key Secret"
    )
    OSS_URL_EXPIRE_SECONDS: int = Field(
        default=3600,
        description="OSS 签名下载地址有效期（秒）"
    )
    OSS_PUBLIC_BASE_URL: Optional[str] = Field(
        default=None,
        description="可选的 OSS 下载域名；未配置时使用 SDK 签名 URL"
    )
    RUNTIME_LOG_DIR: str = Field(
        default=os.path.join(BACKEND_DIR, "runtime_logs"),
        description="运行时日志目录"
    )
    MOBILE_DEBUG_LOG_PATH: str = Field(
        default=os.path.join(BACKEND_DIR, "runtime_logs", "mobile-debug.log"),
        description="移动端调试日志文件路径"
    )
    BACKEND_LOG_PATH: str = Field(
        default=os.path.join(BACKEND_DIR, "runtime_logs", "backend.log"),
        description="后端全量业务日志文件路径"
    )
    BACKEND_ERROR_LOG_PATH: str = Field(
        default=os.path.join(BACKEND_DIR, "runtime_logs", "backend-error.log"),
        description="后端错误日志文件路径"
    )
    MAX_UPLOAD_SIZE: int = Field(
        default=50 * 1024 * 1024,  # 50MB
        description="最大上传文件大小（字节）"
    )

    # 每日推盘配置
    DAILY_PUSH_HOUR: int = Field(default=8, description="每日推盘生成小时")
    DAILY_PUSH_MINUTE: int = Field(default=0, description="每日推盘生成分钟")
    DAILY_PUSH_MIN_FRAGMENTS: int = Field(default=3, description="触发每日推盘的最小碎片数")
    DAILY_PUSH_SIMILARITY_THRESHOLD: float = Field(
        default=0.72,
        description="判定碎片主题相关的相似度阈值"
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug_value(cls, value):
        """允许历史上的 release/debug 字符串配置。"""
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in FALSEY_DEBUG_VALUES:
                return False
            if normalized in TRUTHY_DEBUG_VALUES:
                return True
        return value

    @field_validator("FILE_STORAGE_PROVIDER", mode="before")
    @classmethod
    def normalize_file_storage_provider(cls, value):
        """归一化文件存储 provider 枚举。"""
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"local", "oss"}:
                return normalized
        return value

    @field_validator(
        "CHROMADB_PATH",
        "UPLOAD_DIR",
        "RUNTIME_LOG_DIR",
        "MOBILE_DEBUG_LOG_PATH",
        "BACKEND_LOG_PATH",
        "BACKEND_ERROR_LOG_PATH",
        mode="before",
    )
    @classmethod
    def normalize_backend_relative_path(cls, value):
        """将本地相对路径统一锚定到 backend 目录，避免受启动 cwd 影响。"""
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return normalized
            if os.path.isabs(normalized):
                return normalized
            return os.path.abspath(os.path.join(BACKEND_DIR, normalized))
        return value

    def ensure_directories(self):
        """确保所需目录存在"""
        directories = [
            self.UPLOAD_DIR,
            self.CHROMADB_PATH,
            self.RUNTIME_LOG_DIR,
            os.path.dirname(os.path.abspath(self.MOBILE_DEBUG_LOG_PATH)),
            os.path.dirname(os.path.abspath(self.BACKEND_LOG_PATH)),
            os.path.dirname(os.path.abspath(self.BACKEND_ERROR_LOG_PATH)),
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
