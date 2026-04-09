from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import CurrentUserContext, get_current_user, require_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.auth import Role, User, UserRole
from app.models.enums import UserStatus
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserProfileResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def build_user_profile(user: User) -> UserProfileResponse:
    role_codes = [user_role.role.role_code for user_role in user.user_roles if user_role.role is not None]
    return UserProfileResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        roles=role_codes,
    )


def load_user_with_roles(db: Session, user_id: int) -> User | None:
    return db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(User.id == user_id)
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing_user = db.scalar(
        select(User).where(
            or_(User.username == payload.username, User.email == payload.email)
        )
    )
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists.",
        )

    default_role = db.scalar(select(Role).where(Role.role_code == "user"))
    if default_role is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Default user role is not initialized.",
        )

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        status=UserStatus.ACTIVE.value,
    )
    db.add(user)
    db.flush()

    db.add(
        UserRole(
            user_id=user.id,
            role_id=default_role.id,
        )
    )
    db.commit()

    user = load_user_with_roles(db, user.id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load the registered user.",
        )

    profile = build_user_profile(user)
    token, expires_in = create_access_token(
        user_id=user.id,
        username=user.username,
        roles=profile.roles,
    )
    return TokenResponse(access_token=token, expires_in=expires_in, user=profile)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .where(or_(User.username == payload.account, User.email == payload.account))
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account or password.",
        )

    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled.",
        )

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    profile = build_user_profile(user)
    token, expires_in = create_access_token(
        user_id=user.id,
        username=user.username,
        roles=profile.roles,
    )
    return TokenResponse(access_token=token, expires_in=expires_in, user=profile)


@router.get("/me", response_model=UserProfileResponse)
def me(current_user: CurrentUserContext = Depends(get_current_user)) -> UserProfileResponse:
    return build_user_profile(current_user.user)


@router.get("/admin-check")
def admin_check(
    current_user: CurrentUserContext = Depends(require_roles("admin")),
) -> dict[str, object]:
    return {
        "status": "ok",
        "message": "Admin permission check passed.",
        "user_id": current_user.user.id,
        "roles": current_user.role_codes,
    }
