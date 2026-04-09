from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, BigIntIdMixin, CreatedAtMixin, TimestampMixin
from app.models.enums import UserStatus


class User(BigIntIdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=UserStatus.ACTIVE.value,
        server_default=text("'ACTIVE'"),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user_roles: Mapped[list["UserRole"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    research_tasks: Mapped[list["ResearchTask"]] = relationship(back_populates="user")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")


class Role(BigIntIdMixin, CreatedAtMixin, Base):
    __tablename__ = "roles"

    role_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    role_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    user_roles: Mapped[list["UserRole"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )


class UserRole(BigIntIdMixin, CreatedAtMixin, Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False, index=True)

    user: Mapped["User"] = relationship(back_populates="user_roles")
    role: Mapped["Role"] = relationship(back_populates="user_roles")
