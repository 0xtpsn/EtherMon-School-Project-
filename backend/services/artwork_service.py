"""Artwork service for business logic."""
from typing import Dict, Any, List, Optional
from sqlite3 import Connection
from backend.repositories.artwork_repository import ArtworkRepository
from backend.repositories.auction_repository import AuctionRepository
from backend.repositories.bid_repository import BidRepository
from backend.utils.exceptions import NotFoundError, PermissionError, ValidationError
from backend.utils.validators import validate_artwork_create
import logging

logger = logging.getLogger(__name__)


class ArtworkService:
    """Service for artwork business logic."""
    
    def __init__(self):
        self.artwork_repo = ArtworkRepository()
        self.auction_repo = AuctionRepository()
        self.bid_repo = BidRepository()
    
    def list_artworks(self, filters: Dict[str, Any] = None, connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """List artworks with optional filters."""
        from datetime import datetime
        
        filters_list = []
        params = []
        
        if filters:
            if filters.get("listed") is not None:
                filters_list.append("ar.is_listed = ?")
                params.append(1 if filters["listed"] else 0)
            if filters.get("category") and filters["category"].lower() != "all":
                filters_list.append("ar.category = ?")
                params.append(filters["category"])
            if not filters.get("include_unlisted", True):
                filters_list.append("ar.is_listed = 1")
        
        artworks = self.artwork_repo.find_all(filters_list, params, connection=connection)
        
        # Filter out expired fixed price listings (no auction)
        now = datetime.utcnow().isoformat()
        filtered_artworks = []
        for artwork in artworks:
            # Check if it's an expired fixed price listing
            if artwork.get("is_listed") and not artwork.get("auction"):
                expires_at = artwork.get("listing_expires_at")
                # Only filter out if expiry is set and has passed (None means never expires)
                if expires_at and expires_at < now:
                    # Skip expired listings
                    continue
            filtered_artworks.append(artwork)
        
        return filtered_artworks
    
    def get_artwork_detail(self, artwork_id: int, viewer_id: Optional[int] = None, ip_address: Optional[str] = None, connection: Optional[Connection] = None) -> Dict[str, Any]:
        """Get artwork detail with related data."""
        artwork = self.artwork_repo.find_by_id(artwork_id, connection=connection)
        if not artwork:
            raise NotFoundError("Artwork not found")
        
        # Increment view counter (only if viewer is not the owner, and only once per user per day)
        self.artwork_repo.increment_views(artwork_id, viewer_id=viewer_id, ip_address=ip_address, connection=connection)
        
        # Get favorites count
        artwork["favorites"] = self.artwork_repo.get_favorites_count(artwork_id, connection=connection)
        
        # Get bids if auction exists
        auction = self.auction_repo.find_open_by_artwork_id(artwork_id, connection=connection)
        if auction:
            artwork["bids"] = self.bid_repo.find_by_auction_id(auction["id"], connection=connection)
        else:
            artwork["bids"] = []
        
        return artwork
    
    def create_artwork(self, user_id: int, data: Dict[str, Any], connection: Optional[Connection] = None) -> int:
        """Create a new artwork."""
        validate_artwork_create(data)
        
        artwork_id = self.artwork_repo.create({
            "artist_id": user_id,
            "owner_id": user_id,
            "title": data["title"],
            "description": data.get("description"),
            "category": data.get("category"),
            "image_url": data.get("image_url"),
            "price": data.get("price"),
            "is_listed": 1 if data.get("is_listed", True) else 0,
        }, connection=connection)
        
        logger.info(f"Artwork created: {data.get('title')} (ID: {artwork_id}) by user {user_id}")
        return artwork_id
    
    def update_artwork(self, artwork_id: int, user_id: int, data: Dict[str, Any], connection: Optional[Connection] = None):
        """Update artwork (owner only)."""
        artwork = self.artwork_repo.find_by_id(artwork_id, connection=connection)
        if not artwork:
            raise NotFoundError("Artwork not found")
        
        if artwork["owner_id"] != user_id:
            raise PermissionError("Only the owner can update this artwork")
        
        allowed_fields = ["title", "description", "category", "price", "image_url"]
        updates = {field: data[field] for field in allowed_fields if field in data}
        
        if updates:
            self.artwork_repo.update(artwork_id, updates, connection=connection)
            logger.info(f"Artwork {artwork_id} updated by user {user_id}")
        
        return {"status": "updated"}
    
    def get_trending_artworks(self, limit: int = 20, connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Get trending artworks based on views, favorites, and recent activity.
        
        Trending score calculation:
        - Views: weighted by recency (recent views count more)
        - Favorites: direct count
        - Recent bids: weighted by recency
        - Recent purchases: weighted by recency
        - Time decay: older artworks get lower scores
        """
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # Calculate trending score using multiple factors
            rows = conn.execute(
                """
                SELECT 
                    ar.*,
                    artist.id AS artist_id,
                    artist.username AS artist_username,
                    artist.display_name AS artist_display_name,
                    artist.avatar_url AS artist_avatar_url,
                    owner.id AS owner_id,
                    owner.username AS owner_username,
                    owner.display_name AS owner_display_name,
                    owner.avatar_url AS owner_avatar_url,
                    -- Trending score calculation
                    (
                        -- Views (weighted by recency - views in last 7 days count more)
                        COALESCE(ar.views, 0) * 1.0 +
                        -- Favorites count (calculated from favorites table for 3NF compliance)
                        (SELECT COUNT(*) * 3.0 
                         FROM favorites f
                         WHERE f.artwork_id = ar.id) +
                        -- Recent bids (last 7 days)
                        (SELECT COUNT(*) * 5.0 
                         FROM bids b
                         JOIN auctions au ON b.auction_id = au.id
                         WHERE au.artwork_id = ar.id 
                         AND b.created_at > datetime('now', '-7 days')
                         AND b.is_active = 1) +
                        -- Recent purchases (last 7 days)
                        (SELECT COUNT(*) * 10.0 
                         FROM activity a
                         WHERE a.artwork_id = ar.id 
                         AND a.activity_type = 'purchase'
                         AND a.created_at > datetime('now', '-7 days')) +
                        -- Recent views activity (last 7 days) - bonus for recent engagement
                        (SELECT COUNT(*) * 2.0 
                         FROM activity a
                         WHERE a.artwork_id = ar.id 
                         AND a.activity_type IN ('view', 'favorite')
                         AND a.created_at > datetime('now', '-7 days'))
                    ) * 
                    -- Time decay: newer artworks get a boost
                    (1.0 + (1.0 / (1.0 + (julianday('now') - julianday(ar.created_at)) / 30.0))) AS trending_score
                FROM artworks ar
                JOIN users artist ON ar.artist_id = artist.id
                JOIN users owner ON ar.owner_id = owner.id
                WHERE ar.is_listed = 1
                AND ar.id NOT IN (
                    -- Exclude artworks with active auctions (they're in Live Auctions)
                    SELECT artwork_id FROM auctions WHERE status = 'open' 
                    AND end_time > datetime('now')
                )
                ORDER BY trending_score DESC, ar.created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
            
            # Format results similar to find_all
            artwork_ids = [row["id"] for row in rows]
            auction_map = {}
            if artwork_ids:
                placeholders = ",".join(["?"] * len(artwork_ids))
                # 3NF compliant: compute current_bid and highest_bidder_id from bids table
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
                    WHERE au.artwork_id IN ({placeholders})
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
                # Remove the raw ID fields that were used for joining
                for key in ["artist_id", "artist_username", "artist_display_name", "artist_avatar_url",
                           "owner_id", "owner_username", "owner_display_name", "owner_avatar_url", "trending_score"]:
                    artwork.pop(key, None)
                result.append(artwork)
            
            return result
        finally:
            if should_close:
                conn.close()
    
    def get_recommendations(self, user_id: int, connection: Optional[Connection] = None) -> List[Dict[str, Any]]:
        """Get recommendations based on user's watchlist.
        
        Algorithm: 
        1. Get user's watchlist items
        2. Extract preferences: categories, price ranges, auction vs fixed preference
        3. Recommend artworks based on:
           - Category matches (but not same artworks)
           - Similar price ranges
           - Same listing type (auction vs fixed)
           - Mix of all factors
           - Some random ones
        """
        import random
        
        if connection:
            conn = connection
            should_close = False
        else:
            conn = get_connection()
            should_close = True
        
        try:
            # Get user's watchlist items
            watchlist_rows = conn.execute(
                """
                SELECT ar.id, ar.category, ar.price, ar.is_listed,
                       au.id AS auction_id, au.start_price,
                       au.status AS auction_status, au.end_time,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid
                FROM watchlist w
                JOIN artworks ar ON w.artwork_id = ar.id
                LEFT JOIN auctions au ON ar.id = au.artwork_id
                WHERE w.user_id = ?
                """,
                (user_id,),
            ).fetchall()
            
            watchlist_ids = [row["id"] for row in watchlist_rows]
            
            # If no watchlist, fallback to recent artworks
            if not watchlist_rows:
                return self.artwork_repo.find_all(
                    filters=["ar.owner_id != ?", "ar.is_listed = 1"],
                    params=[user_id],
                    order_by="ar.created_at DESC",
                    limit=12,
                    connection=conn
                )
            
            # Extract preferences from watchlist
            categories = [row["category"] for row in watchlist_rows if row["category"]]
            category_counts = {}
            for cat in categories:
                category_counts[cat] = category_counts.get(cat, 0) + 1
            
            # Get price ranges from watchlist
            prices = []
            auction_count = 0
            fixed_count = 0
            
            for row in watchlist_rows:
                # For auctions, use current_bid or start_price
                if row["auction_id"] and row["auction_status"] == "open":
                    auction_count += 1
                    price = row["current_bid"] or row["start_price"] or row["price"] or 0
                else:
                    fixed_count += 1
                    price = row["price"] or 0
                if price > 0:
                    prices.append(price)
            
            # Calculate price range (with some flexibility)
            min_price = min(prices) if prices else 0
            max_price = max(prices) if prices else 0
            avg_price = sum(prices) / len(prices) if prices else 0
            price_range_low = max(0, min_price * 0.5)  # 50% below min
            price_range_high = max_price * 1.5  # 50% above max
            
            # Determine listing type preference
            prefers_auctions = auction_count > fixed_count
            
            # Build recommendation queries
            recommendations = []
            seen_ids = set(watchlist_ids)
            
            # 1. Category-based recommendations (40% of results)
            if category_counts:
                top_categories = sorted(category_counts.items(), key=lambda x: x[1], reverse=True)[:3]
                category_placeholders = ",".join(["?"] * len(top_categories))
                category_params = [cat for cat, _ in top_categories]
                
                category_recs = conn.execute(
                    f"""
                    SELECT DISTINCT ar.*,
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
                    WHERE ar.category IN ({category_placeholders})
                    AND ar.id NOT IN ({",".join(["?"] * len(watchlist_ids))})
                    AND ar.is_listed = 1
                    AND ar.owner_id != ?
                    ORDER BY ar.created_at DESC
                    LIMIT 5
                    """,
                    category_params + watchlist_ids + [user_id],
                ).fetchall()
                
                for row in category_recs:
                    if row["id"] not in seen_ids:
                        recommendations.append(row)
                        seen_ids.add(row["id"])
            
            # 2. Price-based recommendations (30% of results)
            if prices and price_range_low < price_range_high:
                price_recs = conn.execute(
                    """
                    SELECT DISTINCT ar.*,
                           artist.id AS artist_id,
                           artist.username AS artist_username,
                           artist.display_name AS artist_display_name,
                           artist.avatar_url AS artist_avatar_url,
                           owner.id AS owner_id,
                           owner.username AS owner_username,
                           owner.display_name AS owner_display_name,
                           owner.avatar_url AS owner_avatar_url,
                           COALESCE(
                               (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1),
                               au.start_price,
                               ar.price,
                               0
                           ) AS effective_price
                    FROM artworks ar
                    JOIN users artist ON ar.artist_id = artist.id
                    JOIN users owner ON ar.owner_id = owner.id
                    LEFT JOIN auctions au ON ar.id = au.artwork_id AND au.status = 'open'
                    WHERE ar.id NOT IN ({})
                    AND ar.is_listed = 1
                    AND ar.owner_id != ?
                    AND (COALESCE(
                        (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1),
                        au.start_price,
                        ar.price,
                        0
                    ) BETWEEN ? AND ?)
                    ORDER BY ABS(COALESCE(
                        (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1),
                        au.start_price,
                        ar.price,
                        0
                    ) - ?)
                    LIMIT 4
                    """.format(",".join(["?"] * len(watchlist_ids))),
                    watchlist_ids + [user_id, price_range_low, price_range_high, avg_price],
                ).fetchall()
                
                for row in price_recs:
                    if row["id"] not in seen_ids:
                        recommendations.append(row)
                        seen_ids.add(row["id"])
            
            # 3. Listing type-based recommendations (20% of results)
            if prefers_auctions:
                listing_type_recs = conn.execute(
                    """
                    SELECT DISTINCT ar.*,
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
                    JOIN auctions au ON ar.id = au.artwork_id
                    WHERE ar.id NOT IN ({})
                    AND ar.is_listed = 1
                    AND ar.owner_id != ?
                    AND au.status = 'open'
                    AND au.end_time > datetime('now')
                    ORDER BY ar.created_at DESC
                    LIMIT 3
                    """.format(",".join(["?"] * len(watchlist_ids))),
                    watchlist_ids + [user_id],
                ).fetchall()
            else:
                listing_type_recs = conn.execute(
                    """
                    SELECT DISTINCT ar.*,
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
                    LEFT JOIN auctions au ON ar.id = au.artwork_id
                    WHERE ar.id NOT IN ({})
                    AND ar.is_listed = 1
                    AND ar.owner_id != ?
                    AND au.id IS NULL
                    ORDER BY ar.created_at DESC
                    LIMIT 3
                    """.format(",".join(["?"] * len(watchlist_ids))),
                    watchlist_ids + [user_id],
                ).fetchall()
            
            for row in listing_type_recs:
                if row["id"] not in seen_ids:
                    recommendations.append(row)
                    seen_ids.add(row["id"])
            
            # 4. Random recommendations to fill up to 12 items (10% of results)
            if len(recommendations) < 12:
                # Get a larger pool and randomly select from it
                random_pool = conn.execute(
                """
                SELECT DISTINCT ar.*,
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
                    WHERE ar.id NOT IN ({})
                AND ar.is_listed = 1
                AND ar.owner_id != ?
                ORDER BY ar.created_at DESC
                    LIMIT 50
                    """.format(",".join(["?"] * len(watchlist_ids))),
                    watchlist_ids + [user_id],
            ).fetchall()
            
                # Randomly select from the pool
                needed = 12 - len(recommendations)
                random_recs = random.sample(random_pool, min(needed, len(random_pool))) if random_pool else []
                
                for row in random_recs:
                    if row["id"] not in seen_ids:
                        recommendations.append(row)
                        seen_ids.add(row["id"])
            
            # Shuffle recommendations for variety
            random.shuffle(recommendations)
            
            # Limit to 12 items
            recommendations = recommendations[:12]
            
            # Format results similar to find_all
            artwork_ids = [row["id"] for row in recommendations]
            auction_map = {}
            if artwork_ids:
                placeholders = ",".join(["?"] * len(artwork_ids))
                # 3NF compliant: compute current_bid and highest_bidder_id from bids table
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
                    WHERE au.artwork_id IN ({placeholders})
                    """,
                    artwork_ids,
                ).fetchall()
                auction_map = {row["artwork_id"]: dict(row) for row in auctions}
            
            result = []
            for row in recommendations:
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

