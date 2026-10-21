import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import require_admin
from app.core.permissions import (
    PERMISSION_CATALOG,
    ROLE_NAMES,
    is_admin_role,
    permissions_for_role,
    permissions_for_user,
    validate_permissions,
)
from app.core.security import hash_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/admin/users", tags=["User administration"])
SUPPORTED_ROLES = frozenset(ROLE_NAMES)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=120)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=256)
    role: str = Field(default="Cashier", min_length=1, max_length=60)
    permissions: list[str] | None = None


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    password: str | None = Field(default=None, min_length=12, max_length=256)
    role: str | None = Field(default=None, min_length=1, max_length=60)
    permissions: list[str] | None = None
    active: bool | None = None


def _clean_role(role: str) -> str:
    value = role.strip()
    if value not in SUPPORTED_ROLES:
        raise HTTPException(status_code=422, detail=f"Unsupported role. Choose one of: {', '.join(sorted(SUPPORTED_ROLES))}")
    return value


def _serialize(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": "Administrator" if is_admin_role(user.role) else user.role,
        "active": user.active,
        "permissions": sorted(permissions_for_user(user)),
        "created_at": user.created_at.isoformat() if isinstance(user.created_at, datetime) else user.created_at,
    }


@router.get("/meta")
def user_management_metadata(_admin: User = Depends(require_admin)) -> dict:
    roles = [
        {"name": role, "permissions": permissions_for_role(role)}
        for role in ROLE_NAMES
    ]
    return {"roles": roles, "permissions": PERMISSION_CATALOG}


@router.get("")
def list_users(db: Session = Depends(get_db), _admin: User = Depends(require_admin)) -> list[dict]:
    users = db.scalars(select(User).order_by(User.created_at.asc(), User.username.asc())).all()
    return [_serialize(user) for user in users]


@router.post("", status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), _admin: User = Depends(require_admin)) -> dict:
    role = _clean_role(payload.role)
    username = payload.username.strip().lower()
    display_name = payload.display_name.strip()
    if not username or not display_name:
        raise HTTPException(status_code=422, detail="Username and display name are required")
    if db.scalar(select(User.id).where(func.lower(User.username) == username)):
        raise HTTPException(status_code=409, detail="That username is already in use")
    grants = validate_permissions(payload.permissions if payload.permissions is not None else permissions_for_role(role))
    user = User(
        username=username,
        display_name=display_name,
        password_hash=hash_password(payload.password),
        role=role,
        permissions_json=json.dumps(grants, separators=(",", ":")),
        active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is already in use") from exc
    db.refresh(user)
    return _serialize(user)


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    changed = payload.model_fields_set
    next_role = _clean_role(payload.role) if "role" in changed and payload.role is not None else user.role
    next_active = payload.active if "active" in changed and payload.active is not None else user.active
    demotes_active_admin = user.active and is_admin_role(user.role) and (not next_active or not is_admin_role(next_role))
    if demotes_active_admin:
        active_admin_count = db.scalar(select(func.count()).select_from(User).where(User.active.is_(True), func.lower(User.role).in_(sorted({role for role in ["super admin", "company admin", "admin", "owner", "administrator"]})))) or 0
        if active_admin_count <= 1:
            raise HTTPException(status_code=409, detail="The last active administrator cannot be disabled or demoted")
    if user.id == admin.id and not next_active:
        raise HTTPException(status_code=409, detail="You cannot disable your own active session")

    if "display_name" in changed and payload.display_name is not None:
        display_name = payload.display_name.strip()
        if not display_name:
            raise HTTPException(status_code=422, detail="Display name cannot be empty")
        user.display_name = display_name
    if "password" in changed and payload.password:
        user.password_hash = hash_password(payload.password)
    if "role" in changed and payload.role is not None:
        user.role = next_role
    if "active" in changed and payload.active is not None:
        user.active = payload.active
    if "permissions" in changed:
        user.permissions_json = json.dumps(validate_permissions(payload.permissions or []), separators=(",", ":"))
    elif "role" in changed and payload.role is not None:
        user.permissions_json = json.dumps(permissions_for_role(next_role), separators=(",", ":"))

    db.commit()
    db.refresh(user)
    return _serialize(user)
