"""Helper functions used across the application."""
import base64
import secrets
from typing import Optional, Dict, Any
from sqlite3 import Row


def row_to_dict(row: Optional[Row]) -> Optional[Dict[str, Any]]:
    """Convert SQLite Row to dictionary."""
    return dict(row) if row else None


def generate_totp_secret() -> str:
    """Generate a TOTP secret for 2FA."""
    return base64.b32encode(secrets.token_bytes(20)).decode("utf-8").strip("=")


def secure_filename(filename: str) -> str:
    """Get secure filename (wrapper for werkzeug's secure_filename)."""
    from werkzeug.utils import secure_filename as werkzeug_secure_filename
    return werkzeug_secure_filename(filename)

