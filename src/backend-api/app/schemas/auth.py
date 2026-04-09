from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    account: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserProfileResponse(BaseModel):
    id: int
    username: str
    email: str
    display_name: str | None
    status: str
    roles: list[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfileResponse
