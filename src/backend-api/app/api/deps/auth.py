from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.auth import User, UserRole
from app.models.enums import UserStatus

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUserContext:
    user: User
    role_codes: list[str]


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUserContext:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (KeyError, ValueError, jwt.InvalidTokenError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
        ) from exc

    user = db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(User.id == user_id)
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user does not exist.",
        )

    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled.",
        )

    role_codes = [user_role.role.role_code for user_role in user.user_roles if user_role.role is not None]
    return CurrentUserContext(user=user, role_codes=role_codes)


def require_roles(*required_roles: str):
    def dependency(current_user: CurrentUserContext = Depends(get_current_user)) -> CurrentUserContext:
        if not set(required_roles).intersection(current_user.role_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource.",
            )
        return current_user

    return dependency
