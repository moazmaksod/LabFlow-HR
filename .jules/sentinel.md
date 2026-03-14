## 2025-03-01 - Hardcoded JWT Secret Fallback
**Vulnerability:** Found a hardcoded fallback JWT secret in authController.ts and authMiddleware.ts (`fallback_secret_do_not_use_in_prod`).
**Learning:** The application could silently fallback to a known secret if `JWT_SECRET` is not set in production, allowing attackers to forge auth tokens.
**Prevention:** Never use hardcoded fallbacks for cryptographic secrets. Explicitly require them via environment variables and throw an error if missing.
