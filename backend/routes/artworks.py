"""Artwork routes."""
from flask import Blueprint, jsonify, request, session, g
from backend.config import Config
from backend.services.artwork_service import ArtworkService
from backend.services.notification_service import NotificationService
from backend.repositories.artwork_repository import ArtworkRepository
from backend.repositories.bid_repository import BidRepository
from backend.repositories.auction_repository import AuctionRepository
from backend.middleware.auth import require_auth
from backend.middleware.rate_limit import rate_limit
from backend.middleware.request_validator import validate_request
from backend.utils.exceptions import NotFoundError, PermissionError
import logging

logger = logging.getLogger(__name__)

artworks_bp = Blueprint('artworks', __name__)
artwork_service = ArtworkService()
artwork_repo = ArtworkRepository()
bid_repo = BidRepository()
auction_repo = AuctionRepository()
notification_service = NotificationService()


def fetch_activity_records(artwork_id: int):
    """Fetch activity records for artwork."""
    rows = g.db.execute(
        """
        SELECT a.*, 
               fu.username AS from_username, fu.display_name AS from_display_name,
               tu.username AS to_username, tu.display_name AS to_display_name
        FROM activity a
        LEFT JOIN users fu ON a.from_user_id = fu.id
        LEFT JOIN users tu ON a.to_user_id = tu.id
        WHERE a.artwork_id = ?
        ORDER BY a.created_at DESC
        """,
        (artwork_id,),
    ).fetchall()
    activity = []
    for row in rows:
        record = dict(row)
        record["from_user"] = {
            "username": row["from_username"],
            "display_name": row["from_display_name"],
        } if row["from_username"] else None
        record["to_user"] = {
            "username": row["to_username"],
            "display_name": row["to_display_name"],
        } if row["to_username"] else None
        activity.append(record)
    return activity


@artworks_bp.get("/api/artworks")
@rate_limit(max_requests=100, window_seconds=60, per_user=False)  # 100 requests per minute
def list_artworks():
    """List all artworks with optional filters."""
    try:
        # Check if trending is requested
        if request.args.get("trending") == "true":
            limit = int(request.args.get("limit", 20))
            artworks = artwork_service.get_trending_artworks(limit=limit, connection=g.db)
            return jsonify(artworks)
        
        filters = {
            "listed": request.args.get("listed"),
            "category": request.args.get("category"),
            "include_unlisted": request.args.get("include_unlisted", "true") == "true",
        }
        artworks = artwork_service.list_artworks(filters, connection=g.db)
        return jsonify(artworks)
    except Exception as e:
        logger.error(f"List artworks error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


def validate_title(title: str):
    """Validate title is not empty."""
    if not title or len(title.strip()) == 0:
        raise ValidationError("Title cannot be empty")
    return None

def validate_description(description: str):
    """Validate description is not empty."""
    if not description or len(description.strip()) == 0:
        raise ValidationError("Description cannot be empty")
    return None

def validate_category(category: str):
    """Validate category is provided."""
    if not category:
        raise ValidationError("Category is required")
    return None

@artworks_bp.post("/api/artworks")
@require_auth()
@rate_limit(max_requests=20, window_seconds=60, per_user=True)  # 20 creations per minute per user
@validate_request(
    required_fields=["title", "description", "category", "image_url"],
    field_validators={
        "title": validate_title,
        "description": validate_description,
        "category": validate_category,
    }
)
def create_artwork():
    """Create a new artwork."""
    try:
        data = request.get_json() or {}
        artwork_id = artwork_service.create_artwork(session["user_id"], data, connection=g.db)
        g.db.commit()
        logger.info(f"Artwork created: {data.get('title')} (ID: {artwork_id}) by user {session['user_id']}")
        return jsonify({"status": "created", "artwork_id": artwork_id}), 201
    except Exception as e:
        g.db.rollback()
        logger.error(f"Create artwork error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 400


@artworks_bp.get("/api/artworks/<int:artwork_id>")
@rate_limit(max_requests=200, window_seconds=60, per_user=False)  # 200 views per minute
def artwork_detail(artwork_id: int):
    """Get artwork detail."""
    try:
        from flask import request
        viewer_id = session.get("user_id") if session else None
        # Get IP address for anonymous user tracking (only needed if user is not logged in)
        ip_address = None
        if not viewer_id:
            ip_address = request.remote_addr or (request.headers.get('X-Forwarded-For', '').split(',')[0].strip() if request.headers.get('X-Forwarded-For') else None)
        artwork = artwork_service.get_artwork_detail(artwork_id, viewer_id=viewer_id, ip_address=ip_address, connection=g.db)
        g.db.commit()  # For view increment
        
        # Get activity records
        rows = g.db.execute(
            """
            SELECT a.*, 
                   fu.username AS from_username, fu.display_name AS from_display_name,
                   tu.username AS to_username, tu.display_name AS to_display_name
            FROM activity a
            LEFT JOIN users fu ON a.from_user_id = fu.id
            LEFT JOIN users tu ON a.to_user_id = tu.id
            WHERE a.artwork_id = ?
            ORDER BY a.created_at DESC
            """,
            (artwork_id,),
        ).fetchall()
        activity = []
        for row in rows:
            record = dict(row)
            record["from_user"] = {
                "username": row["from_username"],
                "display_name": row["from_display_name"],
            } if row["from_username"] else None
            record["to_user"] = {
                "username": row["to_username"],
                "display_name": row["to_display_name"],
            } if row["to_username"] else None
            activity.append(record)
        artwork["activity"] = activity
        
        # Get user state (favorite, watchlist, active bid, balance, username)
        user_state = {}
        if session.get("user_id"):
            uid = session["user_id"]
            fav = g.db.execute(
                "SELECT 1 FROM favorites WHERE user_id = ? AND artwork_id = ?",
                (uid, artwork_id),
            ).fetchone()
            watch = g.db.execute(
                "SELECT 1 FROM watchlist WHERE user_id = ? AND artwork_id = ?",
                (uid, artwork_id),
            ).fetchone()
            active_bid = g.db.execute(
                """
                SELECT b.id, b.amount, b.expires_at FROM bids b
                JOIN auctions au ON b.auction_id = au.id
                WHERE au.artwork_id = ? AND b.bidder_id = ? AND b.is_active = 1
                """,
                (artwork_id, uid),
            ).fetchone()
            
            # Get user balance
            balance_row = g.db.execute(
                "SELECT available_balance FROM balances WHERE user_id = ?",
                (uid,),
            ).fetchone()
            
            # Get username
            user_row = g.db.execute(
                "SELECT username FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
            
            user_state = {
                "favorited": bool(fav),  # Frontend expects "favorited" not "is_favorite"
                "watching": bool(watch),  # Frontend expects "watching" not "is_watching"
                "active_bid": dict(active_bid) if active_bid else None,  # None serializes to null in JSON
                "available_balance": balance_row["available_balance"] if balance_row else 0,
                "username": user_row["username"] if user_row else None,
            }
        
        # Return in format expected by frontend: { artwork: {...}, user_state: {...} }
        return jsonify({
            "artwork": artwork,
            "user_state": user_state
        })
    except NotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.error(f"Artwork detail error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
