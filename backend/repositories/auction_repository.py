"""Auction repository for data access operations."""
from typing import Optional, Dict, Any, List
from sqlite3 import Connection
from backend.db import get_connection
from backend.utils.helpers import row_to_dict
import logging

logger = logging.getLogger(__name__)


class AuctionRepository:
    """Repository for auction data access."""
    
    @staticmethod
    def find_all(filters: List[str] = None, params: List[Any] = None,
                 order_by: str = "au.end_time", connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Find all auctions with optional filters."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            filters = filters or []
            params = params or []
            where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
            
            # 3NF compliant: current_bid and highest_bidder_id computed from bids table
            query = f"""
                SELECT au.id, au.artwork_id, au.start_price,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                       au.end_time, au.status, ar.title, ar.image_url,
                       u.display_name AS seller_name,
                       COALESCE(
                           (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1),
                           au.start_price
                       ) AS price
                FROM auctions au
                JOIN artworks ar ON au.artwork_id = ar.id
                JOIN users u ON ar.owner_id = u.id
                {where_clause}
                ORDER BY {order_by}
            """
            rows = conn.execute(query, params).fetchall()
            return [dict(row) for row in rows]
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_by_id(auction_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find auction by ID with current_bid and highest_bidder_id computed from bids (3NF compliant)."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # 3NF compliant: compute current_bid and highest_bidder_id from bids table
            row = conn.execute(
                """
                SELECT au.*,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                       (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                        ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
                FROM auctions au
                WHERE au.id = ?
                """,
                (auction_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_by_artwork_id(artwork_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find auction by artwork ID with current_bid and highest_bidder_id computed from bids (3NF compliant)."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # 3NF compliant: compute current_bid and highest_bidder_id from bids table
            row = conn.execute(
                """
                SELECT au.*,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                       (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                        ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
                FROM auctions au
                WHERE au.artwork_id = ?
                """,
                (artwork_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_open_by_artwork_id(artwork_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find open auction by artwork ID with current_bid and highest_bidder_id computed from bids (3NF compliant)."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # 3NF compliant: compute current_bid and highest_bidder_id from bids table
            row = conn.execute(
                """
                SELECT au.*,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                       (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                        ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
                FROM auctions au
                WHERE au.artwork_id = ? AND au.status = 'open'
                """,
                (artwork_id,)
            ).fetchone()
            return row_to_dict(row)
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_ended_auctions(connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Find all ended auctions that need processing (3NF compliant)."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            from datetime import datetime
            now = datetime.utcnow().isoformat()
            # 3NF compliant: compute current_bid and highest_bidder_id from bids table
            rows = conn.execute(
                """
                SELECT au.*,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                       (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                        ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
                FROM auctions au
                WHERE au.status = 'open' AND au.end_time <= ?
                """,
                (now,)
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def create(data: Dict[str, Any], connection: Optional[Connection] = None) -> int:
        """Create a new auction. Returns auction ID."""
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
                INSERT INTO auctions (artwork_id, seller_id, start_price, reserve_price, end_time)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    data["artwork_id"],
                    data["seller_id"],
                    data["start_price"],
                    data.get("reserve_price"),
                    data["end_time"],
                )
            )
            auction_id = cursor.lastrowid
            
            if not connection:
                conn.commit()
            
            return auction_id
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error creating auction: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def update(auction_id: int, data: Dict[str, Any], connection: Optional[Connection] = None) -> None:
        """Update auction information."""
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
                params.append(auction_id)
                conn.execute(
                    f"UPDATE auctions SET {', '.join(updates)} WHERE id = ?",
                    params
                )
                if not connection:
                    conn.commit()
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error updating auction {auction_id}: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()

