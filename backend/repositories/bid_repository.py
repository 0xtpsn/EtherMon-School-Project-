"""Bid repository for data access operations."""
from typing import Optional, Dict, Any, List
from sqlite3 import Connection
from backend.db import get_connection
from backend.utils.helpers import row_to_dict
import logging

logger = logging.getLogger(__name__)


class BidRepository:
    """Repository for bid data access."""
    
    @staticmethod
    def find_by_auction_id(auction_id: int, connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Find all active bids for an auction, showing only the highest bid per user."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # Get only active bids
            rows = conn.execute(
                """
                SELECT b.*, u.username AS bidder_username, u.display_name AS bidder_display_name, u.avatar_url AS bidder_avatar_url
                FROM bids b
                JOIN users u ON b.bidder_id = u.id
                WHERE b.auction_id = ? AND b.is_active = 1
                ORDER BY b.bidder_id, b.amount DESC, b.created_at DESC
                """,
                (auction_id,)
            ).fetchall()
            
            # Filter to show only the highest bid per user
            bids_by_user = {}
            for row in rows:
                bid = dict(row)
                bidder_id = bid["bidder_id"]
                if bidder_id not in bids_by_user:
                    bids_by_user[bidder_id] = bid
                else:
                    # Keep the highest bid for this user
                    if bid["amount"] > bids_by_user[bidder_id]["amount"]:
                        bids_by_user[bidder_id] = bid
            
            # Convert back to list and sort by amount
            result = list(bids_by_user.values())
            result.sort(key=lambda x: (x["amount"], x["created_at"]), reverse=True)
            return result
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_by_id(bid_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find bid by ID."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                "SELECT * FROM bids WHERE id = ?",
                (bid_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_active_by_bidder(auction_id: int, bidder_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find active bid by bidder for an auction."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                "SELECT id, amount FROM bids WHERE auction_id = ? AND bidder_id = ? AND is_active = 1",
                (auction_id, bidder_id)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_winning_bid(auction_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find winning bid for an auction."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                """
                SELECT bidder_id, amount FROM bids
                WHERE auction_id = ? AND is_active = 1
                ORDER BY amount DESC LIMIT 1
                """,
                (auction_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def create(data: Dict[str, Any], connection: Optional[Connection] = None) -> int:
        """Create a new bid. Returns bid ID."""
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
                INSERT INTO bids (auction_id, bidder_id, amount, expires_at, is_active)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    data["auction_id"],
                    data["bidder_id"],
                    data["amount"],
                    data.get("expires_at"),
                    data.get("is_active", 1),
                )
            )
            bid_id = cursor.lastrowid
            
            if not connection:
                conn.commit()
            
            return bid_id
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error creating bid: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def update(bid_id: int, data: Dict[str, Any], connection: Optional[Connection] = None) -> None:
        """Update bid information."""
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
                params.append(bid_id)
                conn.execute(
                    f"UPDATE bids SET {', '.join(updates)} WHERE id = ?",
                    params
                )
                if not connection:
                    conn.commit()
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error updating bid {bid_id}: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def deactivate_by_auction(auction_id: int, connection: Optional[Connection] = None) -> None:
        """Deactivate all bids for an auction."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            conn.execute(
                "UPDATE bids SET is_active = 0 WHERE auction_id = ?",
                (auction_id,)
            )
            if not connection:
                conn.commit()
        finally:
            if should_close:
                conn.close()

