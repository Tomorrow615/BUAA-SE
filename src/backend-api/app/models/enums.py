from enum import StrEnum


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


class ObjectType(StrEnum):
    COMPANY = "COMPANY"
    STOCK = "STOCK"
    COMMODITY = "COMMODITY"


class TaskStatus(StrEnum):
    CREATED = "CREATED"
    QUEUED = "QUEUED"
    COLLECTING = "COLLECTING"
    PROCESSING = "PROCESSING"
    ANALYZING = "ANALYZING"
    REPORTING = "REPORTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class StageLogStatus(StrEnum):
    STARTED = "STARTED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class OperatorType(StrEnum):
    SYSTEM = "SYSTEM"
    USER = "USER"
    ADMIN = "ADMIN"
    WORKER = "WORKER"


class AuthorityLevel(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class SourceType(StrEnum):
    API = "API"
    WEB = "WEB"
    FILE = "FILE"
    MANUAL = "MANUAL"


class SceneType(StrEnum):
    GENERAL = "GENERAL"
    COMPANY_RESEARCH = "COMPANY_RESEARCH"
    STOCK_RESEARCH = "STOCK_RESEARCH"
    COMMODITY_RESEARCH = "COMMODITY_RESEARCH"


class ReportType(StrEnum):
    BRIEF = "BRIEF"
    FULL = "FULL"


class ReportStatus(StrEnum):
    DRAFT = "DRAFT"
    READY = "READY"
    FAILED = "FAILED"
