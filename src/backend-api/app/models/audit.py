from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, BigIntIdMixin, CreatedAtMixin


class AuditLog(BigIntIdMixin, CreatedAtMixin, Base):
    __tablename__ = "audit_logs"

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped["User | None"] = relationship(back_populates="audit_logs")
