from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def _password_not_whitespace_only(self):
        # Password may include spaces, but whitespace-only is always invalid.
        if not self.password or not self.password.strip():
            raise ValueError("password must not be empty")
        return self


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None = None


class ChangePasswordRequest(BaseModel):
    """Body for POST /auth/change-password. Strength rules enforced server-side (generic errors)."""

    current_password: str = Field(min_length=1, max_length=200)
    # Max length only here; minimum length / strength return generic 400 from the route (no 422 detail).
    new_password: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def _passwords_not_blank(self):
        if not self.current_password.strip():
            raise ValueError("current_password must not be empty")
        if not self.new_password.strip():
            raise ValueError("new_password must not be empty")
        return self


class ChangePasswordResponse(BaseModel):
    detail: str = "Password updated"

