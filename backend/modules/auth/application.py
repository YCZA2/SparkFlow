from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from core import settings
from core.auth import create_access_token
from core.exceptions import AuthenticationError, ValidationError
from domains.device_sessions import repository as device_session_repository
from models import PhoneVerificationCode, User

from .schemas import (
    AuthenticatedUserPayload,
    CurrentUserResponse,
    LoginResponse,
    TokenPayload,
    VerificationCodeResponse,
)

TEST_USER_ID = "test-user-001"
TEST_USER_ROLE = "user"
TEST_USER_NICKNAME = "测试博主"
DEFAULT_PHONE_COUNTRY_CODE = "+86"
PHONE_NUMBER_PATTERN = re.compile(r"^1\d{10}$")


class AuthUseCase:
    """封装手机号验证码登录、设备会话和开发测试认证逻辑。"""

    @staticmethod
    def _now() -> datetime:
        """统一生成认证链路中的当前时间。"""
        return datetime.now(timezone.utc)

    @staticmethod
    def _normalize_phone(phone_number: str) -> str:
        """把手机号规整为后端统一处理格式。"""
        normalized = re.sub(r"\D+", "", phone_number or "")
        if not PHONE_NUMBER_PATTERN.match(normalized):
            raise ValidationError("请输入有效的 11 位中国大陆手机号", {"phone_number": "invalid"})
        return normalized

    @staticmethod
    def _normalize_country_code(phone_country_code: str | None) -> str:
        """首版只支持中国大陆手机号国家码。"""
        normalized = (phone_country_code or DEFAULT_PHONE_COUNTRY_CODE).strip() or DEFAULT_PHONE_COUNTRY_CODE
        if normalized != DEFAULT_PHONE_COUNTRY_CODE:
            raise ValidationError("当前仅支持 +86 中国大陆手机号登录", {"phone_country_code": "unsupported"})
        return normalized

    @staticmethod
    def _hash_code(phone_country_code: str, phone_number: str, code: str) -> str:
        """对验证码做一次稳定哈希，避免明文持久化。"""
        return hashlib.sha256(f"{phone_country_code}:{phone_number}:{code}".encode("utf-8")).hexdigest()

    @staticmethod
    def _build_user_payload(user: User, *, device_id: str | None = None, session_version: int | None = None) -> AuthenticatedUserPayload:
        """把用户模型映射为认证返回载荷。"""
        return AuthenticatedUserPayload(
            user_id=user.id,
            role=user.role,
            nickname=user.nickname,
            phone_country_code=user.phone_country_code or DEFAULT_PHONE_COUNTRY_CODE,
            phone_number=user.phone_number,
            status=user.status,
            device_id=device_id,
            session_version=session_version,
        )

    def _activate_device_session(self, *, db: Session, user_id: str, device_id: str) -> int:
        """为当前设备开启会话，并撤销其它在线设备。"""
        now = self._now()
        current = device_session_repository.get_by_user_and_device(
            db=db,
            user_id=user_id,
            device_id=device_id,
        )
        next_version = (current.session_version + 1) if current else 1
        device_session_repository.revoke_active_for_user(
            db=db,
            user_id=user_id,
            revoked_at=now,
            keep_device_id=device_id,
        )
        device_session_repository.create_or_replace_active_session(
            db=db,
            user_id=user_id,
            device_id=device_id,
            session_version=next_version,
            created_at=now,
        )
        db.flush()
        return next_version

    def ensure_test_user(self, *, db: Session) -> User:
        """确保本地联调用的测试用户在数据库中存在。"""
        if not inspect(db.bind).has_table("users"):
            return User(id=TEST_USER_ID, role=TEST_USER_ROLE, nickname=TEST_USER_NICKNAME)

        existing_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        if existing_user:
            if existing_user.role != TEST_USER_ROLE or existing_user.nickname != TEST_USER_NICKNAME:
                existing_user.role = TEST_USER_ROLE
                existing_user.nickname = TEST_USER_NICKNAME
                existing_user.phone_country_code = DEFAULT_PHONE_COUNTRY_CODE
                existing_user.status = "active"
                db.commit()
                db.refresh(existing_user)
            return existing_user

        test_user = User(
            id=TEST_USER_ID,
            role=TEST_USER_ROLE,
            nickname=TEST_USER_NICKNAME,
            phone_country_code=DEFAULT_PHONE_COUNTRY_CODE,
            status="active",
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        return test_user

    def issue_test_token(self, *, db: Session, device_id: str) -> TokenPayload:
        """仅在本地开发开启时签发测试令牌。"""
        if not settings.ENABLE_TEST_AUTH:
            raise AuthenticationError("测试登录入口已关闭")
        self.ensure_test_user(db=db)
        session_version = self._activate_device_session(db=db, user_id=TEST_USER_ID, device_id=device_id)
        db.commit()
        access_token = create_access_token(
            user_id=TEST_USER_ID,
            role=TEST_USER_ROLE,
            device_id=device_id,
            session_version=session_version,
        )
        return TokenPayload(
            access_token=access_token,
            token_type="bearer",
            device_id=device_id,
            session_version=session_version,
        )

    def request_verification_code(
        self,
        *,
        db: Session,
        phone_number: str,
        phone_country_code: str = DEFAULT_PHONE_COUNTRY_CODE,
    ) -> VerificationCodeResponse:
        """创建或更新手机号验证码记录，并返回发送冷却信息。"""
        normalized_phone = self._normalize_phone(phone_number)
        normalized_country_code = self._normalize_country_code(phone_country_code)
        now = self._now()
        latest = (
            db.query(PhoneVerificationCode)
            .filter(
                PhoneVerificationCode.phone_country_code == normalized_country_code,
                PhoneVerificationCode.phone_number == normalized_phone,
                PhoneVerificationCode.is_latest.is_(True),
            )
            .order_by(PhoneVerificationCode.created_at.desc())
            .first()
        )
        if latest and latest.last_sent_at:
            seconds_since_sent = int((now - latest.last_sent_at).total_seconds())
            if seconds_since_sent < settings.PHONE_VERIFICATION_CODE_RESEND_SECONDS:
                raise ValidationError(
                    "验证码发送过于频繁，请稍后再试",
                    {"resend_after_seconds": str(settings.PHONE_VERIFICATION_CODE_RESEND_SECONDS - seconds_since_sent)},
                )
            if latest.expires_at > now and latest.send_count >= settings.PHONE_VERIFICATION_CODE_MAX_SENDS:
                raise ValidationError("验证码发送次数已达上限，请稍后再试", {"send_count": "limit_reached"})
            latest.is_latest = False
            db.flush()

        raw_code = "123456" if settings.DEBUG else "".join(secrets.choice("0123456789") for _ in range(6))
        expires_at = now + timedelta(seconds=settings.PHONE_VERIFICATION_CODE_TTL_SECONDS)
        next_send_count = 1
        if latest and latest.expires_at > now:
            next_send_count = latest.send_count + 1
        record = PhoneVerificationCode(
            phone_country_code=normalized_country_code,
            phone_number=normalized_phone,
            code_hash=self._hash_code(normalized_country_code, normalized_phone, raw_code),
            expires_at=expires_at,
            consumed_at=None,
            last_sent_at=now,
            send_count=next_send_count,
            is_latest=True,
        )
        db.add(record)
        db.commit()
        return VerificationCodeResponse(
            sent=True,
            resend_after_seconds=settings.PHONE_VERIFICATION_CODE_RESEND_SECONDS,
            expires_in_seconds=settings.PHONE_VERIFICATION_CODE_TTL_SECONDS,
            debug_code=raw_code if settings.DEBUG else None,
        )

    def _consume_verification_code(
        self,
        *,
        db: Session,
        phone_number: str,
        phone_country_code: str,
        verification_code: str,
    ) -> None:
        """校验并核销最新验证码。"""
        now = self._now()
        record = (
            db.query(PhoneVerificationCode)
            .filter(
                PhoneVerificationCode.phone_country_code == phone_country_code,
                PhoneVerificationCode.phone_number == phone_number,
                PhoneVerificationCode.is_latest.is_(True),
            )
            .order_by(PhoneVerificationCode.created_at.desc())
            .first()
        )
        if record is None:
            raise AuthenticationError("请先获取验证码")
        if record.consumed_at is not None:
            raise AuthenticationError("验证码已使用，请重新获取")
        if record.expires_at <= now:
            raise AuthenticationError("验证码已过期，请重新获取")
        if record.code_hash != self._hash_code(phone_country_code, phone_number, verification_code):
            raise AuthenticationError("验证码错误")
        record.consumed_at = now
        record.is_latest = False
        db.flush()

    def _get_or_create_user_by_phone(self, *, db: Session, phone_number: str, phone_country_code: str) -> User:
        """按手机号查找或创建正式用户。"""
        user = (
            db.query(User)
            .filter(User.phone_country_code == phone_country_code, User.phone_number == phone_number)
            .first()
        )
        if user is not None:
            if user.status != "active":
                raise AuthenticationError("当前账号不可用，请联系管理员")
            return user
        user = User(
            role="user",
            nickname=f"用户{phone_number[-4:]}",
            phone_country_code=phone_country_code,
            phone_number=phone_number,
            status="active",
        )
        db.add(user)
        db.flush()
        return user

    def login_with_phone_code(
        self,
        *,
        db: Session,
        phone_number: str,
        verification_code: str,
        device_id: str,
        phone_country_code: str = DEFAULT_PHONE_COUNTRY_CODE,
    ) -> LoginResponse:
        """使用手机号验证码完成登录或注册。"""
        normalized_phone = self._normalize_phone(phone_number)
        normalized_country_code = self._normalize_country_code(phone_country_code)
        normalized_code = str(verification_code or "").strip()
        if not normalized_code:
            raise ValidationError("请输入验证码", {"verification_code": "required"})
        self._consume_verification_code(
            db=db,
            phone_number=normalized_phone,
            phone_country_code=normalized_country_code,
            verification_code=normalized_code,
        )
        user = self._get_or_create_user_by_phone(
            db=db,
            phone_number=normalized_phone,
            phone_country_code=normalized_country_code,
        )
        now = self._now()
        user.last_login_at = now
        session_version = self._activate_device_session(db=db, user_id=user.id, device_id=device_id)
        db.commit()
        db.refresh(user)
        access_token = create_access_token(
            user_id=user.id,
            role=user.role,
            device_id=device_id,
            session_version=session_version,
        )
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            device_id=device_id,
            session_version=session_version,
            user=self._build_user_payload(user, device_id=device_id, session_version=session_version),
        )

    def refresh_token(self, *, db: Session, user_id: str, role: str, device_id: str | None, session_version: int | None) -> TokenPayload:
        """为当前有效设备会话刷新访问令牌。"""
        resolved_device_id = str(device_id or "sparkflow-default-device")
        session = device_session_repository.get_by_user_and_device(
            db=db,
            user_id=user_id,
            device_id=resolved_device_id,
        )
        if session is None or session.status != "active":
            raise AuthenticationError("当前设备会话已失效，请重新登录")
        resolved_session_version = int(session_version if session_version is not None else session.session_version)
        if int(session.session_version) != resolved_session_version:
            raise AuthenticationError("当前设备会话已失效，请重新登录")
        access_token = create_access_token(
            user_id=user_id,
            role=role,
            device_id=resolved_device_id,
            session_version=resolved_session_version,
        )
        return TokenPayload(
            access_token=access_token,
            token_type="bearer",
            device_id=resolved_device_id,
            session_version=resolved_session_version,
        )

    def logout(self, *, db: Session, user_id: str, device_id: str | None) -> None:
        """撤销当前设备会话，让当前 token 立即失效。"""
        if not device_id:
            return
        session = device_session_repository.get_by_user_and_device(db=db, user_id=user_id, device_id=str(device_id))
        if session is None:
            return
        now = self._now()
        session.status = "revoked"
        session.revoked_at = now
        session.updated_at = now
        db.commit()

    def build_current_user_response(self, *, db: Session, current_user: dict) -> CurrentUserResponse:
        """读取当前用户资料并返回给客户端。"""
        user = db.query(User).filter(User.id == current_user["user_id"]).first()
        if user is None:
            raise AuthenticationError("当前用户不存在，请重新登录")
        payload = self._build_user_payload(
            user,
            device_id=current_user.get("device_id"),
            session_version=current_user.get("session_version"),
        )
        return CurrentUserResponse(**payload.model_dump())
