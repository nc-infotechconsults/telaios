"""Authentication: password hashing, JWT, internal API key, FastAPI deps."""

from telaios.auth.dependencies import (
    SERVICE_PRINCIPAL_ID,
    CurrentPrincipal,
    Principal,
    UserLoader,
    current_principal,
    require_admin,
    require_role,
    set_user_loader,
)
from telaios.auth.internal_api_key import is_internal_api_key
from telaios.auth.jwt import TokenClaims, issue_token, verify_token
from telaios.auth.password import hash_password, verify_password

__all__ = [
    "SERVICE_PRINCIPAL_ID",
    "CurrentPrincipal",
    "Principal",
    "TokenClaims",
    "UserLoader",
    "current_principal",
    "hash_password",
    "is_internal_api_key",
    "issue_token",
    "require_admin",
    "require_role",
    "set_user_loader",
    "verify_password",
    "verify_token",
]
