"""用户认证模块：注册 / 登录 / JWT 签发与全局校验。"""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["认证 Auth"])

# auto_error=False：缺少 Authorization 头时由我们统一返回 401（而非默认 403）
security = HTTPBearer(auto_error=False)


# ---------- Pydantic 请求 / 响应模型 ----------


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50, description="用户名")
    password: str = Field(min_length=6, max_length=72, description="密码（6-72 字节）")
    email: str | None = Field(default=None, max_length=100, description="邮箱（可选）")


class LoginRequest(BaseModel):
    username: str = Field(description="用户名")
    password: str = Field(description="密码")


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # Token 有效期（秒）


# ---------- 密码工具 ----------

BCRYPT_MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    """使用 bcrypt 对明文密码加盐哈希。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """校验明文密码与 bcrypt 哈希是否匹配。"""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        return False


# ---------- JWT 工具 ----------


def create_access_token(user_id: int) -> str:
    """签发 JWT，有效期由 ACCESS_TOKEN_EXPIRE_MINUTES 控制（默认 2 小时）。"""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """全局 JWT 校验依赖：解析 Bearer Token 并返回当前登录用户。

    在 main.py 中挂载到所有受保护路由；无效 / 过期 Token 一律返回 401。
    """
    unauthorized = HTTPException(
        status_code=401,
        detail="未提供有效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token 已过期，请重新登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise unauthorized

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise unauthorized

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ---------- 路由 ----------


@router.post("/register", response_model=UserOut, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """注册新用户：密码经 bcrypt 哈希后写入 users 表。"""
    # bcrypt 硬性限制：密码 UTF-8 编码后不能超过 72 字节
    if len(request.password.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise HTTPException(status_code=400, detail="密码长度不能超过 72 字节")

    if db.scalar(select(User).where(User.username == request.username)) is not None:
        raise HTTPException(status_code=400, detail="用户名已被注册")

    if request.email:
        if db.scalar(select(User).where(User.email == request.email)) is not None:
            raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = User(
        username=request.username,
        email=request.email,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """登录：校验密码，成功后返回有效期 2 小时的 JWT access_token。"""
    user = db.scalar(select(User).where(User.username == request.username))
    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    return TokenResponse(
        access_token=create_access_token(user.id),
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
