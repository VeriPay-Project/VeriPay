import hashlib
import bcrypt


def _normalize_password(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes; pre-hash longer secrets for safety.
    data = password.encode("utf-8")
    if len(data) > 72:
        return hashlib.sha256(data).digest()
    return data


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(_normalize_password(password), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_normalize_password(plain), hashed.encode("utf-8"))
