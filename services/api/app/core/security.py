from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"
TOKEN_HOURS = 8
_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2, hash_len=32, salt_len=16)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    try:
        return _hasher.verify(encoded, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_access_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": user_id, "exp": expires}, settings.app_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str | None:
    try:
        subject = jwt.decode(token, settings.app_secret, algorithms=[ALGORITHM]).get("sub")
        return str(subject) if subject else None
    except JWTError:
        return None
