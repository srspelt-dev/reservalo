from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.ratelimit import RateLimiter
from app.dependencies import get_current_user
from app.models import Plan, Subscription, Tenant, User, UserRole
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    VerifyEmailRequest,
)
from app.security import (
    REFRESH,
    RESET,
    VERIFY,
    create_access_token,
    create_refresh_token,
    create_reset_token,
    create_verify_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.email import send_email

router = APIRouter(prefix="/auth", tags=["auth"])

login_limiter = RateLimiter(settings.login_max_attempts, settings.login_window_seconds)


def _tokens_for(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(
            user.id, user.tenant_id, user.role.value, user.token_version
        ),
        refresh_token=create_refresh_token(user.id, user.token_version),
    )


def _send_verification(background: BackgroundTasks, user: User, tenant_name: str) -> None:
    token = create_verify_token(user.id)
    link = f"{settings.public_base_url}/verify-email?token={token}"
    body = (
        f"Hola {user.name},\n\n"
        f"Confirmá tu email para {tenant_name} entrando a:\n{link}\n\n"
        f"Si no creaste esta cuenta, ignorá este mensaje."
    )
    background.add_task(send_email, user.email, f"Verificá tu email — {tenant_name}", body)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest, background: BackgroundTasks, db: Session = Depends(get_db)
) -> TokenResponse:
    """Create a new tenant (business) and its owner account."""
    if db.scalar(select(Tenant).where(Tenant.slug == payload.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already in use")

    tenant = Tenant(
        name=payload.business_name,
        slug=payload.slug,
        timezone=payload.timezone,
        booking_mode=payload.booking_mode,
    )
    db.add(tenant)
    db.flush()  # assign tenant.id

    owner = User(
        tenant_id=tenant.id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.owner,
    )
    db.add(owner)
    db.flush()

    # Every new business starts on the Free plan.
    free = db.scalar(select(Plan).where(Plan.code == "free"))
    if free:
        db.add(Subscription(tenant_id=tenant.id, plan_id=free.id))

    db.commit()
    db.refresh(owner)
    _send_verification(background, owner, tenant.name)
    return _tokens_for(owner)


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest, request: Request, db: Session = Depends(get_db)
) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    if not login_limiter.allow(client_ip):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many login attempts, please try again later",
        )
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is inactive")
    return _tokens_for(user)


@router.post("/login/form", response_model=TokenResponse, include_in_schema=False)
def login_form(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """OAuth2 password-flow login so the Swagger 'Authorize' button works."""
    return login(LoginRequest(email=form.username, password=form.password), request, db)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        data = decode_token(payload.refresh_token, expected_type=REFRESH)
        user_id = int(data["sub"])
        token_version = int(data["tv"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user = db.get(User, user_id)
    if not user or not user.active or token_version != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    return _tokens_for(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    """Server-side logout: invalidate all existing tokens for this user."""
    current_user.token_version += 1
    db.commit()


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict:
    """Issue a password-reset token.

    In production this token would be emailed. For the MVP it is returned directly in
    development so the flow is testable end-to-end without an email provider.
    """
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    response: dict = {"message": "If the email exists, a reset link has been sent"}
    if user:
        token = create_reset_token(user.id)
        if settings.environment == "development":
            response["reset_token"] = token
    return response


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict:
    try:
        data = decode_token(payload.token, expected_type=RESET)
        user_id = int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/verify-email")
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict:
    try:
        data = decode_token(payload.token, expected_type=VERIFY)
        user_id = int(data["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification token")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification token")
    user.email_verified = True
    db.commit()
    return {"message": "Email verified"}


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.email_verified:
        return {"message": "Email already verified"}
    _send_verification(background, current_user, current_user.tenant.name)
    return {"message": "Verification email sent"}
