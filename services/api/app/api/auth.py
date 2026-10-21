from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import require_user
from app.core.permissions import permissions_for_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=12, max_length=256)
    display_name: str | None = Field(default=None, max_length=200)


def _auth_result(user: User) -> dict:
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "permissions": sorted(permissions_for_user(user)),
    }


@router.get("/status")
def auth_status(db: Session = Depends(get_db)) -> dict:
    has_users = db.scalar(select(func.count()).select_from(User)) or 0
    return {"initialized": has_users > 0, "setup_required": has_users == 0}


@router.post("/setup", status_code=201)
def setup_owner(payload: Credentials, db: Session = Depends(get_db)) -> dict:
    has_users = db.scalar(select(func.count()).select_from(User)) or 0
    if has_users:
        raise HTTPException(status_code=409, detail="The local owner account has already been initialized")
    username = payload.username.strip().lower()
    if not username:
        raise HTTPException(status_code=422, detail="Username is required")
    user = User(
        username=username,
        display_name=(payload.display_name or username).strip(),
        password_hash=hash_password(payload.password),
        role="Super Admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_result(user)


@router.post("/login")
def login(payload: Credentials, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.username == payload.username.strip().lower(), User.active.is_(True)))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return _auth_result(user)


@router.get("/me")
def current_user(user: User = Depends(require_user)) -> dict:
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "permissions": sorted(permissions_for_user(user)),
    }
