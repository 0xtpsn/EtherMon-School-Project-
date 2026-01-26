"""Artwork repository for data access operations."""
from typing import Optional, Dict, Any, List
from sqlite3 import Connection
import sqlite3
from backend.db import get_connection
from backend.utils.helpers import row_to_dict
import logging

logger = logging.getLogger(__name__)


class ArtworkRepository:
    """Repository for artwork data access."""
    
    @staticmethod
    def find_all(filters: List[str] = None, params: List[Any] = None, 
                 order_by: str = "ar.created_at DESC", limit: Optional[int] = None,
                 connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Find all artworks with optional filters."""
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
            limit_clause = f"LIMIT {limit}" if limit else ""
            
            rows = conn.execute(
                f"""
                SELECT ar.*,
                       artist.id AS artist_id,
                       artist.username AS artist_username,
                       artist.display_name AS artist_display_name,
                       artist.avatar_url AS artist_avatar_url,
                       owner.id AS owner_id,
                       owner.username AS owner_username,
                       owner.display_name AS owner_display_name,
                       owner.avatar_url AS owner_avatar_url
                FROM artworks ar
                JOIN users artist ON ar.artist_id = artist.id
                JOIN users owner ON ar.owner_id = owner.id
                {where_clause}
                ORDER BY {order_by}
                {limit_clause}
                """,
                params,
            ).fetchall()
            
            artwork_ids = [row["id"] for row in rows]
            auction_map = {}
            if artwork_ids:
                placeholders = ",".join(["?"] * len(artwork_ids))
                # 3NF compliant: compute current_bid and highest_bidder_id from bids table
                # Only fetch open auctions (cancelled/ended auctions should not be shown)
                auctions = conn.execute(
                    f"""
                    SELECT au.id, au.artwork_id, au.start_price, au.reserve_price,
                           au.end_time, au.status, au.winner_id, au.created_at,
                           ar.owner_id AS seller_id,
                           (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                           (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                            ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
                    FROM auctions au
                    JOIN artworks ar ON au.artwork_id = ar.id
                    WHERE au.artwork_id IN ({placeholders}) AND au.status = 'open'
                    """,
                    artwork_ids,
                ).fetchall()
                auction_map = {row["artwork_id"]: dict(row) for row in auctions}
            
            result = []
            for row in rows:
                artwork = dict(row)
                artwork["artist"] = {
                    "id": artwork.get("artist_id"),
                    "username": artwork.get("artist_username"),
                    "display_name": artwork.get("artist_display_name"),
                    "avatar_url": artwork.get("artist_avatar_url"),
                }
                artwork["owner"] = {
                    "id": artwork.get("owner_id"),
                    "username": artwork.get("owner_username"),
                    "display_name": artwork.get("owner_display_name"),
                    "avatar_url": artwork.get("owner_avatar_url"),
                }
                artwork["auction"] = auction_map.get(row["id"])
                result.append(artwork)
            
            return result
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def find_by_id(artwork_id: int, connection: Optional[Connection] = None) -> Optional[Dict[str, Any]]:
        """Find artwork by ID."""
        artworks = ArtworkRepository.find_all(
            filters=["ar.id = ?"],
            params=[artwork_id],
            connection=connection
        )
        return artworks[0] if artworks else None
    
    @staticmethod
    def create(data: Dict[str, Any], connection: Optional[Connection] = None) -> int:
        """Create a new artwork. Returns artwork ID."""
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
                INSERT INTO artworks (artist_id, owner_id, title, description, category, image_url, price, is_listed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["artist_id"],
                    data["owner_id"],
                    data["title"],
                    data.get("description"),
                    data.get("category"),
                    data.get("image_url"),
                    data.get("price"),
                    data.get("is_listed", 1),
                )
            )
            artwork_id = cursor.lastrowid
            
            if not connection:
                conn.commit()
            
            return artwork_id
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error creating artwork: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def update(artwork_id: int, data: Dict[str, Any], connection: Optional[Connection] = None) -> None:
        """Update artwork information."""
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
                params.append(artwork_id)
                conn.execute(
                    f"UPDATE artworks SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    params
                )
                if not connection:
                    conn.commit()
        except Exception as e:
            if not connection:
                conn.rollback()
            logger.error(f"Error updating artwork {artwork_id}: {e}", exc_info=True)
            raise
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def increment_views(artwork_id: int, viewer_id: Optional[int] = None, ip_address: Optional[str] = None, connection: Optional[Connection] = None) -> None:
        """Increment artwork view counter. Simple increment without deduplication (artwork_views table removed)."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # If viewer_id is provided, check if viewer is the owner
            if viewer_id is not None:
                owner_row = conn.execute(
                    "SELECT owner_id FROM artworks WHERE id = ?",
                    (artwork_id,)
                ).fetchone()
                if owner_row and owner_row["owner_id"] == viewer_id:
                    # Owner viewing their own artwork - don't increment
                    return
            
            # Simple increment (no deduplication since artwork_views table is removed)
            conn.execute(
                "UPDATE artworks SET views = COALESCE(views, 0) + 1 WHERE id = ?",
                (artwork_id,)
            )
            
            if not connection:
                conn.commit()
        except Exception as e:
            # Log but don't fail the request if view increment fails
            logger.warning(f"Error incrementing views for artwork {artwork_id}: {e}", exc_info=True)
            if not connection:
                try:
                    conn.rollback()
                except:
                    pass
        finally:
            if should_close:
                conn.close()
    
    @staticmethod
    def get_favorites_count(artwork_id: int, connection: Optional[Connection] = None) -> int:
        """Get favorites count for artwork."""
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            row = conn.execute(
                "SELECT COUNT(1) AS cnt FROM favorites WHERE artwork_id = ?",
                (artwork_id,)
            ).fetchone()
            return row["cnt"] if row else 0
        finally:
            if should_close:
                conn.close()

