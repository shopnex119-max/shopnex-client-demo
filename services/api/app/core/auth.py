from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.core.permissions import ADMIN_ROLES, enforce_request_permission, is_admin_role
from app.db.models import User
from app.db.session import get_db

_bearer = HTTPBearer(auto_error=False)
def require_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in to access local business data")
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Session expired; sign in again")
    user = db.get(User, user_id)
    if user is None or not user.active:
        raise HTTPException(status_code=401, detail="User session is no longer valid")
    enforce_request_permission(request, user)
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if not is_admin_role(user.role):
        raise HTTPException(status_code=403, detail="Administrator permission is required")
    return user
