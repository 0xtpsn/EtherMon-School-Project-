"""User repository for data access operations."""
from typing import Optional, Dict, Any
from sqlite3 import Row
from backend.db import get_connection
from backend.utils.helpers import row_to_dict
import logging

logger = logging.getLogger(__name__)

PROFILE_COLUMNS = (
    "id, username, email, role, display_name, bio, avatar_url, banner_url, "
    "twitter_handle, instagram_handle, website_url, contact_email, show_contact_email, "
    "notification_email, notification_bid, notification_sale, notification_like, "
    "notification_watchlist_outbid, notification_watchlist_ending, notification_auction_sold"
)


class UserRepository:
    """Repository for user data access."""
    
    @staticmethod
    def find_by_id(user_id: int, connection=None) -> Optional[Dict[str, Any]]:
        """Find user by ID."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                f"SELECT {PROFILE_COLUMNS} FROM users WHERE id = ?",
                (user_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_by_username(username: str) -> Optional[Dict[str, Any]]:
        """Find user by username."""
        conn = get_connection()
        try:
            row = conn.execute(
                f"SELECT {PROFILE_COLUMNS} FROM users WHERE username = ?",
                (username,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            conn.close()
    
    @staticmethod
    def find_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Find user by email."""
        conn = get_connection()
        try:
            row = conn.execute(
                f"SELECT {PROFILE_COLUMNS} FROM users WHERE email = ?",
                (email,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            conn.close()
    
    @staticmethod
    def find_by_identifier(identifier: str) -> Optional[Dict[str, Any]]:
        """Find user by username or email."""
        conn = get_connection()
        try:
            row = conn.execute(
                """
                SELECT id, username, role, password_hash, display_name, email, avatar_url
                FROM users
                WHERE username = ? OR email = ?
                """,
                (identifier, identifier)
            ).fetchone()
            return row_to_dict(row)
        finally:
            conn.close()
    
    @staticmethod
    def find_existing(username: str, email: str) -> Optional[Dict[str, Any]]:
        """Check if username or email already exists."""
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT username, email FROM users WHERE username = ? OR email = ?",
                (username, email)
            ).fetchone()
            return row_to_dict(row)
        finally:
            conn.close()
    
    @staticmethod
    def create(data: Dict[str, Any], connection=None) -> int:
        """Create a new user. Returns user ID."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            cursor = conn.cursor()
            # Build dynamic INSERT query based on provided fields
            fields = ["username", "email", "role", "display_name"]
            values = [
                data["username"],
                data["email"],
                data["role"],
                data.get("display_name", data["username"]),
            ]
            
            # Add optional fields if provided
            # password_hash is required for all users (even Google users get a default password)
            if "password_hash" in data:
                fields.append("password_hash")
                values.append(data["password_hash"])
            if "google_id" in data and data["google_id"] is not None:
                fields.append("google_id")
                values.append(data["google_id"])
            if "avatar_url" in data and data["avatar_url"] is not None:
                fields.append("avatar_url")
                values.append(data["avatar_url"])
            
            placeholders = ",".join(["?"] * len(fields))
            field_names = ",".join(fields)
            
            cursor.execute(
                f"""
                INSERT INTO users ({field_names})
                VALUES ({placeholders})
                """,
                tuple(values)
            )
            user_id = cursor.lastrowid
            
            if not connection:
                conn.commit()
            
            return user_id
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error creating user: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def update(user_id: int, data: Dict[str, Any], connection=None) -> None:
        """Update user information."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            updates = []
            params = []
            for key, value in data.items():
                updates.append(f"{key} = ?")
                params.append(value)
            
            if updates:
                params.append(user_id)
                conn.execute(
                    f"UPDATE users SET {', '.join(updates)} WHERE id = ?",
                    params
                )
                if not connection:
                    conn.commit()
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error updating user {user_id}: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def get_password_reset_info(email: str) -> Optional[Dict[str, Any]]:
        """Get password reset token and expiration for email."""
        conn = get_connection()
        try:
            row = conn.execute(
                "SELECT id, password_reset_token, password_reset_expires FROM users WHERE email = ?",
                (email,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            conn.close()

