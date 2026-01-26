"""Notification repository for data access operations."""
from typing import Optional, Dict, Any, List
from sqlite3 import Connection
from backend.db import get_connection
from backend.utils.helpers import row_to_dict
import logging

logger = logging.getLogger(__name__)


class NotificationRepository:
    """Repository for notification data access."""
    
    @staticmethod
    def find_by_user_id(user_id: int, limit: int = 10, connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Find notifications for a user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            rows = conn.execute(
                """
                SELECT id, title, message, artwork_id, is_read, created_at
                FROM notifications
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, limit)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def get_unread_count(user_id: int, connection: Optional[Connection] = None) -> int:
        """Get unread notification count for a user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                "SELECT COUNT(1) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0",
                (user_id,)
            ).fetchone()
            return row["cnt"] if row else 0
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def create(data: Dict[str, Any], connection: Optional[Connection] = None) -> int:
        """Create a new notification. Returns notification ID."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO notifications (user_id, title, message, artwork_id)
                VALUES (?, ?, ?, ?)
                """,
                (
                    data["user_id"],
                    data["title"],
                    data["message"],
                    data.get("artwork_id"),
                )
            )
            notification_id = cursor.lastrowid
            
            if not connection:
                conn.commit()
            
            return notification_id
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error creating notification: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def mark_read(notification_ids: List[int], user_id: int, connection: Optional[Connection] = None) -> None:
        """Mark notifications as read."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            if not notification_ids:
                return
            
            placeholders = ",".join(["?"] * len(notification_ids))
            params = notification_ids + [user_id]
            conn.execute(
                f"""
                UPDATE notifications
                SET is_read = 1
                WHERE id IN ({placeholders}) AND user_id = ?
                """,
                params
            )
            if not connection:
                conn.commit()
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def mark_all_read(user_id: int, connection: Optional[Connection] = None) -> None:
        """Mark all notifications as read for a user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            conn.execute(
                "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
                (user_id,)
            )
            if not connection:
                conn.commit()
        finally:
            if should_close:
                conn.close()

