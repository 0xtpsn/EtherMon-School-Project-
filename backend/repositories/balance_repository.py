"""Balance repository for data access operations."""
from typing import Optional, Dict, Any
from sqlite3 import Connection
from backend.db import get_connection
from backend.utils.helpers import row_to_dict
import logging

logger = logging.getLogger(__name__)


class BalanceRepository:
    """Repository for balance data access."""
    
    @staticmethod
    def find_by_user_id(user_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find balance for a user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                "SELECT * FROM balances WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def create(user_id: int, connection: Optional[Connection] = None) -> None:
        """Create balance record for a user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            conn.execute(
                "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
                (user_id,)
            )
            if not connection:
                conn.commit()
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def update(user_id: int, updates: Dict[str, Any], connection: Optional[Connection] = None) -> None:
        """Update balance for a user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            if not updates:
                return
            
            set_clauses = []
            params = []
            for key, value in updates.items():
                if isinstance(value, (int, float)):
                    set_clauses.append(f"{key} = {key} + ?")
                    params.append(value)
                else:
                    set_clauses.append(f"{key} = ?")
                    params.append(value)
            
            params.append(user_id)
            conn.execute(
                f"UPDATE balances SET {', '.join(set_clauses)} WHERE user_id = ?",
                params
            )
            if not connection:
                conn.commit()
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error updating balance for user {user_id}: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def get_available_balance(user_id: int, connection: Optional[Connection] = None) -> float:
        """Get available balance for a user."""
        balance = BalanceRepository.find_by_user_id(user_id, connection)
        return balance["available_balance"] if balance else 0.0

