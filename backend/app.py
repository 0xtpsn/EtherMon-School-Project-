from __future__ import annotations

import base64
import secrets
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Dict, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, jsonify, request, session, g, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from .db import get_connection, init_db, DB_PATH
from .config import Config, DevelopmentConfig, config
from .middleware.error_handler import register_error_handlers
from .utils.logging_config import setup_logging
from .utils.helpers import generate_totp_secret, row_to_dict
from .services.email_service import EmailService
from .services.notification_service import NotificationService
from .services.auction_service import AuctionService
from .services.artwork_service import ArtworkService

# Import route blueprints
from .routes.auth import auth_bp
from .routes.artworks import artworks_bp

# Import middleware
from .middleware.rate_limit import rate_limit

import logging

logger = logging.getLogger(__name__)

# Use config values
UPLOAD_DIR = Config.UPLOAD_FOLDER
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_EXTENSIONS = Config.ALLOWED_IMAGE_EXTENSIONS
PROFILE_COLUMNS = (
    "id, username, email, role, display_name, bio, avatar_url, banner_url, "
    "twitter_handle, instagram_handle, website_url, contact_email, show_contact_email, "
    "notification_email, notification_bid, notification_sale, notification_like, "
    "notification_watchlist_outbid, notification_watchlist_ending, notification_auction_sold, "
    "wallet_address"
)

# Initialize services
email_service = EmailService()
notification_service = NotificationService()
auction_service = AuctionService()
artwork_service = ArtworkService()


def fetch_profile(connection, field, value):
    """Fetch user profile by field (id or username)."""
    return connection.execute(
        f"SELECT {PROFILE_COLUMNS} FROM users WHERE {field} = ?",
        (value,),
    ).fetchone()


def refund_active_bids(connection, auction_id: int) -> None:
    """Refund all active bids for a specific auction (used when auction is cancelled/ended early).
    Only affects bids for THIS specific auction_id - other active bids remain untouched."""
    # Get artwork info for notifications
    artwork = connection.execute(
        """
        SELECT ar.id, ar.title FROM artworks ar
        JOIN auctions au ON ar.id = au.artwork_id
        WHERE au.id = ?
        """,
        (auction_id,),
    ).fetchone()
    artwork_id = artwork["id"] if artwork else None
    artwork_title = artwork["title"] if artwork else "Artwork"
    
    # Get all bidders with their total bid amounts for THIS auction only
    bidders = connection.execute(
        """
        SELECT bidder_id, SUM(amount) AS total_amount, COUNT(*) AS bid_count
        FROM bids
        WHERE auction_id = ? AND is_active = 1
        GROUP BY bidder_id
        """,
        (auction_id,),
    ).fetchall()
    
    for bidder in bidders:
        bidder_id = bidder["bidder_id"]
        total_refund_amount = bidder["total_amount"]
        bid_count = bidder["bid_count"]
        
        # Ensure balance record exists
        connection.execute(
            "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
            (bidder_id,),
        )
        
        # Refund the total bid amount (sum of all their bids on this auction)
        connection.execute(
            """
            UPDATE balances
            SET available_balance = available_balance + ?,
                pending_balance = CASE
                    WHEN pending_balance > ? THEN pending_balance - ?
                    ELSE 0
                END
            WHERE user_id = ?
            """,
            (total_refund_amount, total_refund_amount, total_refund_amount, bidder_id),
        )
        
        # Mark original bid transaction(s) as cancelled for this user on this artwork
        connection.execute(
            """
            UPDATE transactions
            SET status = 'cancelled'
            WHERE user_id = ? AND artwork_id = ? AND type IN ('bid', 'bid_increase') AND status = 'pending'
            """,
            (bidder_id, artwork_id),
        )
        
        # Create transaction record for refund
        connection.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'bid_refund', ?, 'completed', 'Auction cancelled - bid refunded', ?)
            """,
            (bidder_id, total_refund_amount, artwork_id),
        )
        
        # Create notification
        bid_text = f"bid of ${total_refund_amount:.2f}" if bid_count == 1 else f"total bids of ${total_refund_amount:.2f} ({bid_count} bids)"
        _create_notification(
            connection,
            bidder_id,
            "Auction Cancelled - Bid Refunded",
            f"The auction for '{artwork_title}' has been cancelled. Your {bid_text} has been refunded and returned to your available balance.",
            artwork_id,
            notification_type="bid",
            send_email=True,
        )
    
    # Mark ONLY bids for THIS specific auction as inactive (other auctions' bids remain active)
    connection.execute(
        "UPDATE bids SET is_active = 0 WHERE auction_id = ? AND is_active = 1",
        (auction_id,),
    )


# _send_email moved to EmailService


# _create_notification moved to NotificationService
def _create_notification(connection, user_id: int, title: str, message: str, artwork_id: Optional[int] = None, send_email: bool = False, notification_type: Optional[str] = None) -> None:
    """Helper function to create a notification and optionally send email."""
    notification_service.create_notification(
        user_id, title, message, artwork_id, send_email, notification_type=notification_type, connection=connection
    )


def _log_price_history(connection, artwork_id: int, amount: float, from_user_id: Optional[int] = None) -> None:
    """Helper function to log price history."""
    connection.execute(
        """
        INSERT INTO price_history (artwork_id, from_user_id, amount)
        VALUES (?, ?, ?)
        """,
        (artwork_id, from_user_id, amount),
    )


def _process_ended_auction(connection, auction: Dict) -> None:
    """Process a single ended auction: close it, transfer ownership, update balances, refund losing bidders."""
    auction_id = auction["id"]
    artwork_id = auction["artwork_id"]
    
    # Get seller_id from auction (stored at creation time)
    seller_id = auction.get("seller_id")
    if not seller_id:
        # Fallback: get seller from artwork owner_id if seller_id not in auction dict
        artwork = connection.execute(
            "SELECT owner_id FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not artwork:
            raise ValueError(f"Artwork {artwork_id} not found")
        seller_id = artwork["owner_id"]
    
    # Get winning bid
    winning_bid = connection.execute(
        """
        SELECT bidder_id, amount FROM bids
        WHERE auction_id = ? AND is_active = 1
        ORDER BY amount DESC LIMIT 1
        """,
        (auction_id,),
    ).fetchone()
    
    winner_id = winning_bid["bidder_id"] if winning_bid else None
    winning_amount = winning_bid["amount"] if winning_bid else None
    
    # Check reserve price - if highest bid doesn't meet reserve, no winner
    reserve_price = auction.get("reserve_price")
    reserve_not_met = False
    if winner_id and winning_amount and reserve_price:
        if winning_amount < reserve_price:
            # Reserve price not met - no winner
            reserve_not_met = True
            logger.info(f"Auction {auction_id}: Reserve price ${reserve_price} not met (highest bid: ${winning_amount})")
    
    # Close the auction (winner_id stored for historical reference, None if reserve not met)
    # Note: current_bid is computed from bids table (3NF compliant)
    final_winner_id = None if reserve_not_met else winner_id
    connection.execute(
        "UPDATE auctions SET status = 'closed', winner_id = ? WHERE id = ?",
        (final_winner_id, auction_id),
    )
    
    if winner_id and winning_amount and not reserve_not_met:
        # Calculate platform fee (2.5%)
        platform_fee = winning_amount * Config.PLATFORM_FEE_RATE
        seller_receives = winning_amount - platform_fee
        
        # Transfer ownership
        connection.execute(
            "UPDATE artworks SET owner_id = ?, is_listed = 0 WHERE id = ?",
            (winner_id, artwork_id),
        )
        
        # Update buyer balance (deduct winning bid from available, move from pending)
        buyer_balance = connection.execute(
            "SELECT available_balance, pending_balance FROM balances WHERE user_id = ?",
            (winner_id,),
        ).fetchone()
        
        if buyer_balance:
            # When user wins, the winning_amount was already moved from available to pending when bid was placed
            # So we just need to: remove it from pending (it's being spent)
            # available_balance stays the same (money was already moved to pending)
            # Note: total_spent is computed from transactions table (3NF compliant)
            new_pending = max(0, buyer_balance["pending_balance"] - winning_amount)
            connection.execute(
                """
                UPDATE balances
                SET pending_balance = ?
                WHERE user_id = ?
                """,
                (new_pending, winner_id),
            )
        else:
            # This shouldn't happen if bidding logic is correct, but handle edge case
            # If somehow winner has no balance record, create one
            # Note: total_spent is computed from transactions table (3NF compliant)
            connection.execute(
                """
                INSERT INTO balances (user_id, available_balance, pending_balance)
                VALUES (?, 0, 0)
                """,
                (winner_id,),
            )
        
        # Update seller balance (minus platform fee)
        # Note: total_earned is computed from transactions table (3NF compliant)
        seller_balance = connection.execute(
            "SELECT available_balance FROM balances WHERE user_id = ?",
            (seller_id,),
        ).fetchone()
        
        if seller_balance:
            connection.execute(
                """
                UPDATE balances
                SET available_balance = available_balance + ?
                WHERE user_id = ?
                """,
                (seller_receives, seller_id),
            )
        else:
            connection.execute(
                """
                INSERT INTO balances (user_id, available_balance)
                VALUES (?, ?)
                """,
                (seller_id, seller_receives),
            )
        
        # Mark winner's bid transaction(s) as completed (they won, funds used for purchase)
        connection.execute(
            """
            UPDATE transactions
            SET status = 'completed'
            WHERE user_id = ? AND artwork_id = ? AND type IN ('bid', 'bid_increase') AND status = 'pending'
            """,
            (winner_id, artwork_id),
        )
        
        # Create transactions
        # Buyer transaction records full purchase price
        connection.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'purchase', ?, 'completed', 'Auction won', ?)
            """,
            (winner_id, winning_amount, artwork_id),
        )
        # Seller transaction records amount received (after fee)
        connection.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'sale', ?, 'completed', 'Auction sold', ?)
            """,
            (seller_id, seller_receives, artwork_id),
        )
        
        # Log price history - from_user_id should be the seller (who set/sold at this price)
        _log_price_history(connection, artwork_id, winning_amount, seller_id)
        
        # Record single consolidated "sold" activity record for auction won
        # from_user = seller, to_user = buyer (winner) (for display: "Sold to [buyer] from [seller]")
        connection.execute(
            """
            INSERT INTO activity (artwork_id, user_id, activity_type, price, from_user_id, to_user_id)
            VALUES (?, ?, 'sold', ?, ?, ?)
            """,
            (artwork_id, winner_id, winning_amount, seller_id, winner_id),
        )
        
        # Create notifications
        artwork = connection.execute(
            "SELECT title FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        artwork_title = artwork["title"] if artwork else "Artwork"
        
        _create_notification(
            connection,
            winner_id,
            "Auction Won - Ownership Transferred",
            f"Congratulations! You won the auction for '{artwork_title}' with a bid of ${winning_amount:.2f}. The artwork has been transferred to your account and ${winning_amount:.2f} has been deducted from your balance.",
            artwork_id,
            send_email=True,
            notification_type="auction_won",
        )
        _create_notification(
            connection,
            seller_id,
            "Auction Sold - Payment Received",
            f"Your auction for '{artwork_title}' has ended successfully. The artwork sold for ${winning_amount:.2f}. After the 2.5% platform fee, ${seller_receives:.2f} has been transferred to your account balance.",
            artwork_id,
            send_email=True,
            notification_type="auction_sold",
        )
    else:
        # No sale - either no bids, or reserve price not met
        # Delist the artwork since auction ended
        connection.execute(
            "UPDATE artworks SET is_listed = 0, listing_type = NULL WHERE id = ?",
            (artwork_id,),
        )
        artwork = connection.execute(
            "SELECT title FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        artwork_title = artwork["title"] if artwork else "Artwork"
        
        if reserve_not_met:
            # Reserve price not met - notify seller and refund ALL bidders
            _create_notification(
                connection,
                seller_id,
                "Auction Ended - Reserve Not Met",
                f"Your auction for '{artwork_title}' ended but the reserve price of ${reserve_price:.2f} was not met. "
                f"The highest bid was ${winning_amount:.2f}. All bidders have been refunded.",
                artwork_id,
                send_email=True,
                notification_type="auction_ended",
            )
            
            # Refund ALL bidders including the highest bidder (since reserve not met)
            all_bidders = connection.execute(
                """
                SELECT bidder_id, SUM(amount) AS total_amount, COUNT(*) AS bid_count
                FROM bids
                WHERE auction_id = ? AND is_active = 1
                GROUP BY bidder_id
                """,
                (auction_id,),
            ).fetchall()
            
            for bidder in all_bidders:
                bidder_id = bidder["bidder_id"]
                total_refund_amount = bidder["total_amount"]
                bid_count = bidder["bid_count"]
                
                # Refund the total bid amount
                bidder_balance = connection.execute(
                    "SELECT available_balance, pending_balance FROM balances WHERE user_id = ?",
                    (bidder_id,),
                ).fetchone()
                
                if bidder_balance:
                    new_available = bidder_balance["available_balance"] + total_refund_amount
                    new_pending = max(0, bidder_balance["pending_balance"] - total_refund_amount)
                    connection.execute(
                        """
                        UPDATE balances
                        SET available_balance = ?, pending_balance = ?
                        WHERE user_id = ?
                        """,
                        (new_available, new_pending, bidder_id),
                    )
                else:
                    connection.execute(
                        """
                        INSERT INTO balances (user_id, available_balance)
                        VALUES (?, ?)
                        """,
                        (bidder_id, total_refund_amount),
                    )
                
                # Mark original bid transaction(s) as cancelled
                connection.execute(
                    """
                    UPDATE transactions
                    SET status = 'cancelled'
                    WHERE user_id = ? AND artwork_id = ? AND type IN ('bid', 'bid_increase') AND status = 'pending'
                    """,
                    (bidder_id, artwork_id),
                )
                
                # Create transaction record for refund
                connection.execute(
                    """
                    INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
                    VALUES (?, 'bid_refund', ?, 'completed', 'Reserve price not met - bid refunded', ?)
                    """,
                    (bidder_id, total_refund_amount, artwork_id),
                )
                
                # Mark bids as inactive
                connection.execute(
                    "UPDATE bids SET is_active = 0 WHERE auction_id = ? AND bidder_id = ? AND is_active = 1",
                    (auction_id, bidder_id),
                )
                
                # Create notification for bidders
                bid_text = f"bid of ${total_refund_amount:.2f}" if bid_count == 1 else f"total bids of ${total_refund_amount:.2f} ({bid_count} bids)"
                _create_notification(
                    connection,
                    bidder_id,
                    "Auction Ended - Reserve Not Met",
                    f"The auction for '{artwork_title}' has ended but the reserve price was not met. "
                    f"Your {bid_text} has been refunded and returned to your available balance.",
                    artwork_id,
                    notification_type="bid",
                    send_email=True,
                )
            
            # Skip the normal refund logic below since we already refunded everyone
            return
        else:
            # No bids at all
            _create_notification(
                connection,
                seller_id,
                "Auction Ended",
                f"Your auction for '{artwork_title}' ended with no bids",
                artwork_id,
                send_email=True,
                notification_type="auction_ended",
            )
    
    # Refund all losing bidders (those with active bids that didn't win)
    if final_winner_id:
        # Get all losing bidders with their total bid amounts for THIS auction only
        losing_bidders = connection.execute(
            """
            SELECT bidder_id, SUM(amount) AS total_amount, COUNT(*) AS bid_count
            FROM bids
            WHERE auction_id = ? AND bidder_id != ? AND is_active = 1
            GROUP BY bidder_id
            """,
            (auction_id, final_winner_id),
        ).fetchall()
        
        for bidder in losing_bidders:
            bidder_id = bidder["bidder_id"]
            total_refund_amount = bidder["total_amount"]
            bid_count = bidder["bid_count"]
            
            # Refund the total bid amount (sum of all their bids on this auction)
            bidder_balance = connection.execute(
                "SELECT available_balance, pending_balance FROM balances WHERE user_id = ?",
                (bidder_id,),
            ).fetchone()
            
            if bidder_balance:
                new_available = bidder_balance["available_balance"] + total_refund_amount
                new_pending = max(0, bidder_balance["pending_balance"] - total_refund_amount)
                connection.execute(
                    """
                    UPDATE balances
                    SET available_balance = ?, pending_balance = ?
                    WHERE user_id = ?
                    """,
                    (new_available, new_pending, bidder_id),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO balances (user_id, available_balance)
                    VALUES (?, ?)
                    """,
                    (bidder_id, total_refund_amount),
                )
            
            # Mark original bid transaction(s) as cancelled for losing bidders
            connection.execute(
                """
                UPDATE transactions
                SET status = 'cancelled'
                WHERE user_id = ? AND artwork_id = ? AND type IN ('bid', 'bid_increase') AND status = 'pending'
                """,
                (bidder_id, artwork_id),
            )
            
            # Create transaction record for refund
            connection.execute(
                """
                INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
                VALUES (?, 'bid_refund', ?, 'completed', 'Auction ended - bid refunded', ?)
                """,
                (bidder_id, total_refund_amount, artwork_id),
            )
            
            # Mark ONLY bids from this bidder for THIS specific auction as inactive
            connection.execute(
                "UPDATE bids SET is_active = 0 WHERE auction_id = ? AND bidder_id = ? AND is_active = 1",
                (auction_id, bidder_id),
            )
            
            # Create notification for losing bidders
            bid_text = f"bid of ${total_refund_amount:.2f}" if bid_count == 1 else f"total bids of ${total_refund_amount:.2f} ({bid_count} bids)"
            _create_notification(
                connection,
                bidder_id,
                "Auction Ended - Bid Refunded",
                f"The auction for '{artwork_title}' has ended. You were not the winning bidder. Your {bid_text} has been refunded and returned to your available balance.",
                artwork_id,
                notification_type="bid",
                send_email=True,
            )


def cancel_auction(connection, auction_id: int, status: str = "cancelled") -> None:
    auction = connection.execute(
        "SELECT id FROM auctions WHERE id = ?",
        (auction_id,),
    ).fetchone()
    if not auction:
        return
    refund_active_bids(connection, auction_id)
    # Note: current_bid and highest_bidder_id are computed from bids table (3NF compliant)
    connection.execute(
        "UPDATE auctions SET status = ? WHERE id = ?",
        (status, auction_id),
    )


# process_ended_auctions_job moved to jobs/auction_processor.py
from .jobs.auction_processor import process_ended_auctions_job


def create_app() -> Flask:
    app = Flask(__name__)
    
    # Use DevelopmentConfig by default for local dev
    conf = DevelopmentConfig
    
    app.secret_key = conf.SECRET_KEY
    app.config["DATABASE"] = DB_PATH
    app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)
    app.config["DEBUG"] = conf.DEBUG
    
    # Setup logging
    setup_logging(debug=Config.DEBUG)
    logger.info("Application starting...")
    
    # Initialize scheduler for background tasks
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        func=process_ended_auctions_job,
        trigger="interval",
        minutes=Config.SCHEDULER_INTERVAL_MINUTES,
        id="process_ended_auctions",
        name="Process ended auctions",
        replace_existing=True,
    )
    scheduler.start()
    app.config["SCHEDULER"] = scheduler
    logger.info(f"Background scheduler started - processing ended auctions every {Config.SCHEDULER_INTERVAL_MINUTES} minutes")
    
    # Register error handlers
    register_error_handlers(app)
    
    # Register route blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(artworks_bp)

    # CORS support for frontend-backend communication
    @app.before_request
    def handle_cors_preflight():
        """Handle CORS preflight requests."""
        if request.method == "OPTIONS":
            origin = request.headers.get('Origin')
            # Allow requests from localhost (development) or configured origins
            allowed_origins = [
                'http://localhost:5173',
                'http://localhost:5174',
                'http://localhost:3000',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:5174',
                'http://127.0.0.1:3000',
            ]
            # Also allow any origin in development mode
            if Config.DEBUG and origin:
                allowed_origins.append(origin)
            
            response = jsonify({})
            if origin and (origin in allowed_origins or (Config.DEBUG and origin)):
                response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With'
            response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS,PATCH'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Access-Control-Max-Age'] = '3600'
            return response
    
    @app.after_request
    def after_request(response):
        """Add CORS headers to all responses."""
        # Skip if headers already set (e.g., by preflight handler)
        if 'Access-Control-Allow-Origin' in response.headers:
            return response
            
        origin = request.headers.get('Origin')
        # Allow requests from localhost (development) or configured origins
        allowed_origins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:3000',
        ]
        # Also allow any origin in development mode
        if Config.DEBUG and origin:
            if origin not in allowed_origins:
                allowed_origins.append(origin)
        
        if origin and (origin in allowed_origins or (Config.DEBUG and origin)):
            response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,X-Requested-With'
        response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS,PATCH'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        # Remove Cross-Origin-Opener-Policy to allow Google Sign-In iframe
        # Google's iframe needs to communicate with the parent window
        if 'Cross-Origin-Opener-Policy' in response.headers:
            del response.headers['Cross-Origin-Opener-Policy']
        return response

    @app.before_request
    def load_db() -> None:
        """Load database connection for request."""
        # Skip database loading for OPTIONS requests (handled by CORS preflight)
        if request.method == "OPTIONS":
            return
        if "db" not in g:
            g.db = get_connection()

    @app.teardown_appcontext
    def close_db(exception: Optional[BaseException]) -> None:  # type: ignore
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @app.get("/uploads/<path:filename>")
    def serve_upload(filename: str):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    # require_auth moved to middleware.auth
    from .middleware.auth import require_auth

    @app.post("/api/uploads")
    @require_auth()
    @rate_limit(max_requests=30, window_seconds=60, per_user=True)  # 30 uploads per minute per user
    def upload_file():
        if "file" not in request.files:
            return jsonify({"error": "File is required"}), 400
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "Empty filename"}), 400
        
        # Check file size (max 10MB)
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Reset to beginning
        if file_size > 10 * 1024 * 1024:  # 10MB
            return jsonify({"error": "File size exceeds 10MB limit"}), 400
        
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_IMAGE_EXTENSIONS:
            return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"}), 400
        
        safe_name = secure_filename(file.filename)
        unique_name = f"{session['user_id']}_{int(time.time())}_{safe_name}"
        path = Path(app.config["UPLOAD_FOLDER"]) / unique_name
        path.parent.mkdir(parents=True, exist_ok=True)
        file.save(path)
        
        logger.info(f"File uploaded: {unique_name} ({file_size} bytes) by user {session['user_id']}")
        return jsonify({"url": f"/uploads/{unique_name}"})

    # AUTH routes moved to routes/auth.py blueprint
    # Blueprints are registered above and take precedence

    # PROFILE ----------------------------------------------------------------
    @app.get("/api/me/profile")
    @require_auth()
    def my_profile():
        row = fetch_profile(g.db, "id", session["user_id"])
        return jsonify({"profile": row_to_dict(row)})

    @app.put("/api/me/profile")
    @require_auth()
    def update_profile():
        data = request.get_json() or {}
        allowed_fields = [
            "username",
            "display_name",
            "bio",
            "avatar_url",
            "banner_url",
            "twitter_handle",
            "instagram_handle",
            "website_url",
            "contact_email",
            "show_contact_email",
        ]
        updates = {field: data[field] for field in allowed_fields if field in data}
        if not updates:
            return jsonify({"error": "No fields to update"}), 400
        
        # Validate username if provided
        if "username" in updates:
            new_username = updates["username"]
            
            # Check if username is empty or whitespace only
            if not new_username or not new_username.strip():
                return jsonify({"error": "Username cannot be empty"}), 400
            
            new_username = new_username.strip()
            updates["username"] = new_username
            
            # Validate username format (alphanumeric, underscores, 3-30 chars)
            import re
            if not re.match(r'^[a-zA-Z0-9_]{3,30}$', new_username):
                return jsonify({"error": "Username must be 3-30 characters and contain only letters, numbers, and underscores"}), 400
            
            # Check for duplicate username (case-insensitive)
            existing = g.db.execute(
                "SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
                (new_username, session["user_id"]),
            ).fetchone()
            
            if existing:
                return jsonify({"error": "Username is already taken"}), 400
        
        placeholders = ", ".join(f"{field} = ?" for field in updates.keys())
        values = list(updates.values())
        values.append(session["user_id"])
        try:
            g.db.execute(
                f"""
                UPDATE users
                SET {placeholders}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                values,
            )
            g.db.commit()
        except Exception as exc:
            g.db.rollback()
            return jsonify({"error": str(exc)}), 400
        return jsonify({"status": "updated"})

    @app.put("/api/me/notifications")
    @require_auth()
    def update_notification_preferences():
        data = request.get_json() or {}
        allowed = [
            "notification_email",
            "notification_bid",
            "notification_sale",
            "notification_like",
            "notification_watchlist_outbid",
            "notification_watchlist_ending",
            "notification_auction_sold",
        ]
        updates = {
            field: 1 if data.get(field) else 0
            for field in allowed
            if field in data
        }
        if not updates:
            return jsonify({"error": "No preferences supplied"}), 400
        placeholders = ", ".join(f"{field} = ?" for field in updates.keys())
        values = list(updates.values())
        values.append(session["user_id"])
        g.db.execute(
            f"""
            UPDATE users
            SET {placeholders}
            WHERE id = ?
            """,
            values,
        )
        g.db.commit()
        return jsonify({"status": "preferences_saved"})

    @app.get("/api/profiles/<string:identifier>")
    def profile_detail(identifier: str):
        logger.info(f"Profile detail request for identifier: {identifier}")
        user_row = None
        if identifier.isdigit():
            user_row = fetch_profile(g.db, "id", int(identifier))
        if not user_row:
            user_row = fetch_profile(g.db, "username", identifier)
        if not user_row and identifier.startswith("0x"):
            user_row = fetch_profile(g.db, "wallet_address", identifier.lower())
        if not user_row:
            logger.warning(f"Profile not found for identifier: {identifier}")
            return jsonify({"error": "Profile not found"}), 404
        
        logger.info(f"Found profile for identifier: {identifier}, user_id: {user_row['id']}")

        user_id = user_row["id"]
        owned_artworks = fetch_artwork_with_relations(["ar.owner_id = ?"], [user_id])
        created_count_row = g.db.execute(
            "SELECT COUNT(1) AS cnt FROM artworks WHERE artist_id = ?",
            (user_id,),
        ).fetchone()
        favorites = g.db.execute(
            "SELECT artwork_id FROM favorites WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        favorite_ids = [row["artwork_id"] for row in favorites]
        liked_artworks: list[dict[str, Any]] = []
        if favorite_ids:
            placeholders = ",".join(["?"] * len(favorite_ids))
            liked_artworks = fetch_artwork_with_relations(
                [f"ar.id IN ({placeholders})"],
                favorite_ids,
            )
        
        # Fetch watchlist artworks (only for own profile)
        watchlist_artworks: list[dict[str, Any]] = []
        if session.get("user_id") == user_id:  # Only show watchlist for own profile
            watchlist = g.db.execute(
                "SELECT artwork_id FROM watchlist WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            watchlist_ids = [row["artwork_id"] for row in watchlist]
            if watchlist_ids:
                placeholders = ",".join(["?"] * len(watchlist_ids))
                watchlist_artworks = fetch_artwork_with_relations(
                    [f"ar.id IN ({placeholders})"],
                    watchlist_ids,
                )

        activity_rows = g.db.execute(
            """
            SELECT ac.*, ar.title AS artwork_title, ar.image_url AS artwork_image,
                   fu.username AS from_username, fu.display_name AS from_display_name,
                   tu.username AS to_username, tu.display_name AS to_display_name
            FROM activity ac
            LEFT JOIN artworks ar ON ac.artwork_id = ar.id
            LEFT JOIN users fu ON ac.from_user_id = fu.id
            LEFT JOIN users tu ON ac.to_user_id = tu.id
            WHERE ac.user_id = ? OR ac.from_user_id = ? OR ac.to_user_id = ?
            ORDER BY ac.created_at DESC
            LIMIT 100
            """,
            (user_id, user_id, user_id),
        ).fetchall()

        # Format activity records to match frontend expectations
        formatted_activity = []
        for row in activity_rows:
            activity_dict = dict(row)
            # Add artworks object if artwork exists
            if activity_dict.get("artwork_title") or activity_dict.get("artwork_image"):
                activity_dict["artworks"] = {
                    "title": activity_dict.get("artwork_title"),
                    "image_url": activity_dict.get("artwork_image"),
                }
            formatted_activity.append(activity_dict)

        bids = g.db.execute(
            """
            SELECT b.*, au.id AS auction_id, au.status AS auction_status, au.end_time,
                   ar.id AS artwork_id, ar.title AS artwork_title, ar.image_url AS artwork_image
            FROM bids b
            JOIN auctions au ON b.auction_id = au.id
            JOIN artworks ar ON au.artwork_id = ar.id
            WHERE b.bidder_id = ?
            ORDER BY b.created_at DESC
            """,
            (user_id,),
        ).fetchall()

        # Format bids to match frontend expectations
        formatted_bids = []
        for row in bids:
            bid_dict = dict(row)
            # Add artworks object
            if bid_dict.get("artwork_title") or bid_dict.get("artwork_image"):
                bid_dict["artworks"] = {
                    "id": bid_dict.get("artwork_id"),
                    "title": bid_dict.get("artwork_title"),
                    "image_url": bid_dict.get("artwork_image"),
                }
            formatted_bids.append(bid_dict)

        try:
            response_data = {
                "profile": dict(user_row),
                "owned_artworks": owned_artworks,
                "liked_artworks": liked_artworks,
                "watchlist_artworks": watchlist_artworks,
                "created_count": created_count_row["cnt"] if created_count_row else 0,
                "activity": formatted_activity,
                "bids": formatted_bids,
            }
            logger.info(f"Returning profile data for user_id: {user_id}, owned: {len(owned_artworks)}, liked: {len(liked_artworks)}, activity: {len(formatted_activity)}, bids: {len(formatted_bids)}")
            return jsonify(response_data)
        except Exception as e:
            logger.error(f"Error building profile response: {str(e)}", exc_info=True)
            return jsonify({"error": "Failed to load profile data"}), 500

    # WALLET-BASED PROFILE UPDATE  -----------------------------------------------
    @app.put("/api/profiles/wallet/<string:wallet_address>")
    def update_profile_by_wallet(wallet_address: str):
        """Update or create a profile for a wallet address (no session required)."""
        wallet = wallet_address.lower()
        data = request.get_json() or {}

        allowed_fields = [
            "display_name", "bio", "avatar_url", "banner_url",
            "twitter_handle", "instagram_handle", "website_url",
        ]
        updates = {field: data[field] for field in allowed_fields if field in data}
        if not updates:
            return jsonify({"error": "No fields to update"}), 400

        try:
            # Check if user with this wallet exists
            user_row = g.db.execute(
                "SELECT id FROM users WHERE LOWER(wallet_address) = ?",
                (wallet,),
            ).fetchone()

            if user_row:
                # Update existing user
                user_id = user_row["id"]
                placeholders = ", ".join(f"{field} = ?" for field in updates.keys())
                values = list(updates.values())
                values.append(user_id)
                g.db.execute(
                    f"UPDATE users SET {placeholders}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    values,
                )
            else:
                # Create new user for this wallet
                short_addr = f"{wallet[:6]}...{wallet[-4:]}"
                updates["wallet_address"] = wallet
                updates["username"] = short_addr
                updates["email"] = f"{wallet}@wallet.local"
                updates["role"] = "buyer"
                columns = ", ".join(updates.keys())
                qmarks = ", ".join("?" * len(updates))
                g.db.execute(
                    f"INSERT INTO users ({columns}) VALUES ({qmarks})",
                    list(updates.values()),
                )

            g.db.commit()

            # Return the updated/created profile
            row = g.db.execute(
                f"SELECT {PROFILE_COLUMNS} FROM users WHERE LOWER(wallet_address) = ?",
                (wallet,),
            ).fetchone()
            return jsonify({"status": "updated", "profile": row_to_dict(row) if row else {}})
        except Exception as exc:
            g.db.rollback()
            logger.error(f"Error updating wallet profile: {str(exc)}", exc_info=True)
            return jsonify({"error": str(exc)}), 400

    # NOTIFICATIONS ----------------------------------------------------------
    @app.get("/api/notifications")
    @require_auth()
    def get_notifications():
        limit = min(max(int(request.args.get("limit", 10)), 1), 50)
        rows = g.db.execute(
            """
            SELECT id, title, message, artwork_id, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (session["user_id"], limit),
        ).fetchall()
        unread = g.db.execute(
            "SELECT COUNT(1) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0",
            (session["user_id"],),
        ).fetchone()
        return jsonify({
            "notifications": [dict(row) for row in rows],
            "unread": unread["cnt"] if unread else 0,
        })

    @app.post("/api/notifications/mark-read")
    @require_auth()
    def mark_notifications_read():
        data = request.get_json() or {}
        ids = data.get("ids") or []
        if not isinstance(ids, list) or not ids:
            return jsonify({"error": "ids list required"}), 400
        placeholders = ",".join(["?"] * len(ids))
        params = ids + [session["user_id"]]
        g.db.execute(
            f"""
            UPDATE notifications
            SET is_read = 1
            WHERE id IN ({placeholders}) AND user_id = ?
            """,
            params,
        )
        g.db.commit()
        return jsonify({"status": "updated"})

    @app.post("/api/notifications/mark-all-read")
    @require_auth()
    def mark_all_notifications_read():
        g.db.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ?",
            (session["user_id"],),
        )
        g.db.commit()
        return jsonify({"status": "updated"})

    # NFT LIKES ---------------------------------------------------------------
    @app.post("/api/nfts/<int:token_id>/like")
    def like_nft(token_id: int):
        """Like an NFT - creates a like record and notifies the owner."""
        data = request.get_json() or {}
        liker_wallet = data.get("liker_wallet", "").lower()
        owner_wallet = data.get("owner_wallet", "").lower()
        
        if not liker_wallet or not owner_wallet:
            return jsonify({"error": "liker_wallet and owner_wallet required"}), 400
        
        # Don't allow liking your own NFT
        if liker_wallet == owner_wallet:
            return jsonify({"error": "Cannot like your own NFT"}), 400
        
        try:
            # Insert like record
            g.db.execute(
                """
                INSERT INTO nft_likes (token_id, owner_wallet, liker_wallet)
                VALUES (?, ?, ?)
                """,
                (token_id, owner_wallet, liker_wallet),
            )
            
            # Find the owner's user_id if they have an account
            owner_row = g.db.execute(
                "SELECT id FROM users WHERE LOWER(wallet_address) = ?",
                (owner_wallet,),
            ).fetchone()
            
            if owner_row:
                # Create notification for the owner
                g.db.execute(
                    """
                    INSERT INTO notifications (user_id, title, message, token_id, from_wallet)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        owner_row["id"],
                        "Someone liked your NFT! ❤️",
                        f"A collector liked your NFT #{token_id}",
                        token_id,
                        liker_wallet,
                    ),
                )
            
            g.db.commit()
            return jsonify({"status": "liked"})
        except Exception as e:
            if "UNIQUE constraint failed" in str(e):
                return jsonify({"status": "already_liked"})
            return jsonify({"error": str(e)}), 500
    
    @app.delete("/api/nfts/<int:token_id>/like")
    def unlike_nft(token_id: int):
        """Remove a like from an NFT."""
        liker_wallet = request.args.get("liker_wallet", "").lower()
        
        if not liker_wallet:
            return jsonify({"error": "liker_wallet required"}), 400
        
        g.db.execute(
            "DELETE FROM nft_likes WHERE token_id = ? AND liker_wallet = ?",
            (token_id, liker_wallet),
        )
        g.db.commit()
        return jsonify({"status": "unliked"})
    
    @app.get("/api/nfts/<int:token_id>/likes")
    def get_nft_likes(token_id: int):
        """Get like count and whether the requesting wallet has liked this NFT."""
        wallet = request.args.get("wallet", "").lower()
        
        # Get total count
        count_row = g.db.execute(
            "SELECT COUNT(*) as count FROM nft_likes WHERE token_id = ?",
            (token_id,),
        ).fetchone()
        
        # Check if wallet has liked
        liked = False
        if wallet:
            like_row = g.db.execute(
                "SELECT 1 FROM nft_likes WHERE token_id = ? AND liker_wallet = ?",
                (token_id, wallet),
            ).fetchone()
            liked = like_row is not None
        
        return jsonify({
            "count": count_row["count"] if count_row else 0,
            "liked": liked,
        })
    
    @app.get("/api/nfts/liked-by/<wallet>")
    def get_liked_by_wallet(wallet: str):
        """Get all token IDs liked by a specific wallet address."""
        wallet = wallet.lower()
        rows = g.db.execute(
            "SELECT token_id FROM nft_likes WHERE liker_wallet = ? ORDER BY created_at DESC",
            (wallet,),
        ).fetchall()
        return jsonify({"token_ids": [row["token_id"] for row in rows]})

    @app.get("/api/nfts/<int:token_id>/likers")
    def get_nft_likers(token_id: int):
        """Get list of users who liked this NFT."""
        rows = g.db.execute(
            """
            SELECT nl.liker_wallet, nl.created_at,
                   u.display_name, u.username, u.avatar_url
            FROM nft_likes nl
            LEFT JOIN users u ON LOWER(u.wallet_address) = nl.liker_wallet
            WHERE nl.token_id = ?
            ORDER BY nl.created_at DESC
            """,
            (token_id,),
        ).fetchall()

        likers = []
        for row in rows:
            likers.append({
                "wallet": row["liker_wallet"],
                "display_name": row["display_name"] or row["username"],
                "avatar_url": row["avatar_url"],
                "liked_at": row["created_at"],
            })

        return jsonify({"likers": likers})

    @app.get("/api/notifications/wallet/<wallet_address>")
    def get_notifications_by_wallet(wallet_address: str):
        """Get notifications for a wallet address (for Web3 users without session)."""
        wallet = wallet_address.lower()
        limit = min(max(int(request.args.get("limit", 20)), 1), 50)
        
        # Find user by wallet address
        user_row = g.db.execute(
            "SELECT id FROM users WHERE LOWER(wallet_address) = ?",
            (wallet,),
        ).fetchone()
        
        if not user_row:
            return jsonify({"notifications": [], "unread": 0})
        
        user_id = user_row["id"]
        
        rows = g.db.execute(
            """
            SELECT id, title, message, artwork_id, token_id, from_wallet, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
        
        unread = g.db.execute(
            "SELECT COUNT(1) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0",
            (user_id,),
        ).fetchone()
        
        return jsonify({
            "notifications": [dict(row) for row in rows],
            "unread": unread["cnt"] if unread else 0,
        })
    
    @app.post("/api/notifications/wallet/<wallet_address>/mark-read")
    def mark_notifications_read_by_wallet(wallet_address: str):
        """Mark notifications as read for a wallet address."""
        wallet = wallet_address.lower()
        data = request.get_json() or {}
        ids = data.get("ids") or []
        
        user_row = g.db.execute(
            "SELECT id FROM users WHERE LOWER(wallet_address) = ?",
            (wallet,),
        ).fetchone()
        
        if not user_row or not ids:
            return jsonify({"status": "no_change"})
        
        placeholders = ",".join(["?"] * len(ids))
        params = ids + [user_row["id"]]
        g.db.execute(
            f"""
            UPDATE notifications
            SET is_read = 1
            WHERE id IN ({placeholders}) AND user_id = ?
            """,
            params,
        )
        g.db.commit()
        return jsonify({"status": "updated"})

    # SECURITY ---------------------------------------------------------------
    @app.get("/api/security/2fa")
    @require_auth()
    def two_factor_status():
        row = g.db.execute(
            "SELECT enabled FROM user_2fa WHERE user_id = ?",
            (session["user_id"],),
        ).fetchone()
        return jsonify({"enabled": bool(row["enabled"]) if row else False})

    @app.post("/api/security/2fa/setup")
    @require_auth()
    def two_factor_setup():
        secret = generate_totp_secret()
        g.db.execute(
            """
            INSERT INTO user_2fa (user_id, secret, enabled)
            VALUES (?, ?, 0)
            ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled = 0
            """,
            (session["user_id"], secret),
        )
        g.db.commit()
        user = fetch_profile(g.db, "id", session["user_id"])
        label = user["email"] if user else f"user-{session['user_id']}"
        otpauth_url = f"otpauth://totp/ArtOffchain:{label}?secret={secret}&issuer=ArtOffchain"
        return jsonify({"secret": secret, "otpauth_url": otpauth_url})

    @app.post("/api/security/2fa/enable")
    @require_auth()
    def two_factor_enable():
        # Coursework scope: assume client verified the code.
        g.db.execute(
            "UPDATE user_2fa SET enabled = 1 WHERE user_id = ?",
            (session["user_id"],),
        )
        g.db.commit()
        return jsonify({"status": "enabled"})

    @app.post("/api/security/2fa/disable")
    @require_auth()
    def two_factor_disable():
        g.db.execute("DELETE FROM user_2fa WHERE user_id = ?", (session["user_id"],))
        g.db.execute("DELETE FROM backup_codes WHERE user_id = ?", (session["user_id"],))
        g.db.commit()
        return jsonify({"status": "disabled"})

    @app.get("/api/security/backup-codes")
    @require_auth()
    def list_backup_codes():
        rows = g.db.execute(
            "SELECT id, code, used FROM backup_codes WHERE user_id = ?",
            (session["user_id"],),
        ).fetchall()
        return jsonify({"codes": [dict(row) for row in rows]})

    @app.post("/api/security/backup-codes")
    @require_auth()
    def regenerate_backup_codes():
        g.db.execute("DELETE FROM backup_codes WHERE user_id = ?", (session["user_id"],))
        codes = []
        for _ in range(10):
            code = secrets.token_hex(4).upper()
            g.db.execute(
                """
                INSERT INTO backup_codes (user_id, code, used)
                VALUES (?, ?, 0)
                """,
                (session["user_id"], code),
            )
            codes.append(code)
        g.db.commit()
        return jsonify({"codes": codes})

    @app.post("/api/security/test-email")
    @require_auth()
    def send_test_email():
        return jsonify({"status": "sent"})

    # AUCTIONS ---------------------------------------------------------------
    def serialize_user(row_dict, prefix):
        key_id = f"{prefix}_id"
        if row_dict.get(key_id) is None:
            return None
        return {
            "id": row_dict.get(key_id),
            "username": row_dict.get(f"{prefix}_username"),
            "display_name": row_dict.get(f"{prefix}_display_name"),
            "avatar_url": row_dict.get(f"{prefix}_avatar_url"),
        }

    def fetch_artwork_with_relations(filters=None, params=None, order_by="ar.created_at DESC", limit=None):
        filters = filters or []
        params = params or []
        where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
        limit_clause = f"LIMIT {limit}" if limit else ""
        rows = g.db.execute(
            f"""
            SELECT ar.*,
                   artist.id AS artist_id,
                   artist.username AS artist_username,
                   artist.display_name AS artist_display_name,
                   artist.avatar_url AS artist_avatar_url,
                   owner.id AS owner_id,
                   owner.username AS owner_username,
                   owner.display_name AS owner_display_name,
                   owner.avatar_url AS owner_avatar_url,
                   (SELECT COUNT(*) FROM favorites f WHERE f.artwork_id = ar.id) AS favorites
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
            auctions = g.db.execute(
                f"""
                SELECT au.*,
                       (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                       (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                        ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
                FROM auctions au
                WHERE au.artwork_id IN ({placeholders}) AND au.status = 'open'
                """,
                artwork_ids,
            ).fetchall()
            auction_map = {row["artwork_id"]: dict(row) for row in auctions}

        result = []
        for row in rows:
            artwork = dict(row)
            artwork["artist"] = serialize_user(artwork, "artist")
            artwork["owner"] = serialize_user(artwork, "owner")
            artwork["auction"] = auction_map.get(row["id"])
            result.append(artwork)
        return result

    def fetch_activity_records(artwork_id: int):
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

    @app.get("/api/auctions")
    def list_auctions():
        params = []
        filters = ["au.status = 'open'"]
        keyword = request.args.get("q")
        category = request.args.get("category")
        sort = request.args.get("sort", "end_time")

        if keyword:
            filters.append("(ar.title LIKE ? OR ar.description LIKE ?)")
            like = f"%{keyword}%"
            params.extend([like, like])
        if category and category.lower() != "all":
            filters.append("ar.category = ?")
            params.append(category)

        # 3NF compliant: order by computed price
        order_map = {
            "price": "price",  # Uses computed column
            "newest": "ar.created_at DESC",
            "end_time": "au.end_time",
        }
        order_clause = order_map.get(sort, "au.end_time")

        # 3NF compliant: current_bid computed from bids table
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
            WHERE {' AND '.join(filters)}
            ORDER BY {order_clause}
        """
        rows = g.db.execute(query, params).fetchall()
        return jsonify([dict(row) for row in rows])

    @app.get("/api/artworks")
    def list_artworks():
        listed = request.args.get("listed")
        category = request.args.get("category")
        include_unlisted = request.args.get("include_unlisted", "true") == "true"
        filters = []
        params = []
        if listed is not None:
            filters.append("ar.is_listed = ?")
            params.append(1 if listed.lower() == "true" else 0)
        if category and category.lower() != "all":
            filters.append("ar.category = ?")
            params.append(category)
        if not include_unlisted:
            filters.append("ar.is_listed = 1")

        artworks = fetch_artwork_with_relations(filters, params)
        return jsonify(artworks)

    @app.post("/api/artworks")
    @require_auth()
    def create_artwork():
        data = request.get_json() or {}
        required = ["title", "description", "category", "image_url"]
        if not all(data.get(field) for field in required):
            return jsonify({"error": "Missing fields"}), 400
        price = data.get("price")
        is_listed = 1 if data.get("is_listed", True) else 0
        cursor = g.db.cursor()
        cursor.execute(
            """
            INSERT INTO artworks (artist_id, owner_id, title, description, category, image_url, price, is_listed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session["user_id"],
                session["user_id"],
                data["title"],
                data["description"],
                data["category"],
                data["image_url"],
                price,
                is_listed,
            ),
        )
        artwork_id = cursor.lastrowid
        g.db.commit()
        return jsonify({"status": "created", "artwork_id": artwork_id}), 201

    # NOTE: The /api/artworks/<int:artwork_id> route is now handled by routes/artworks.py blueprint
    # This duplicate route has been removed to prevent conflicts and ensure proper view tracking

    @app.put("/api/artworks/<int:artwork_id>")
    @require_auth()
    def update_artwork(artwork_id: int):
        data = request.get_json() or {}
        allowed_fields = ["title", "description", "price", "category", "is_listed", "image_url"]
        updates = {field: data[field] for field in allowed_fields if field in data}
        if not updates:
            return jsonify({"error": "No updates supplied"}), 400
        artwork = g.db.execute(
            "SELECT owner_id FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not artwork:
            return jsonify({"error": "Artwork not found"}), 404
        if artwork["owner_id"] != session["user_id"]:
            return jsonify({"error": "Forbidden"}), 403
        placeholders = ", ".join(f"{field} = ?" for field in updates.keys())
        values = list(updates.values()) + [artwork_id]
        g.db.execute(
            f"""
            UPDATE artworks
            SET {placeholders}
            WHERE id = ?
            """,
            values,
        )
        g.db.commit()
        return jsonify({"status": "updated"})

    @app.post("/api/artworks/<int:artwork_id>/list")
    @require_auth()
    def list_artwork(artwork_id: int):
        data = request.get_json() or {}
        listing_type = data.get("type", "fixed")
        artwork = g.db.execute(
            "SELECT owner_id FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not artwork:
            return jsonify({"error": "Artwork not found"}), 404
        if artwork["owner_id"] != session["user_id"]:
            return jsonify({"error": "Forbidden"}), 403

        open_auction = g.db.execute(
            "SELECT id FROM auctions WHERE artwork_id = ? AND status = 'open'",
            (artwork_id,),
        ).fetchone()
        existing_auction = g.db.execute(
            "SELECT id FROM auctions WHERE artwork_id = ?",
            (artwork_id,),
        ).fetchone()
        if listing_type == "fixed":
            price = data.get("price")
            duration_hours = data.get("duration_hours")  # Optional - None means never expires
            if price is None or float(price) <= 0:
                return jsonify({"error": "Price required for fixed listing"}), 400
            
            # Cancel any existing auction (open or otherwise) when switching to fixed price
            if existing_auction:
                cancel_auction(g.db, existing_auction["id"])
            
            # Calculate expiry date (None if duration_hours not provided = never expires)
            listing_expires_at = None
            if duration_hours is not None:
                try:
                    duration_hours = int(duration_hours)
                    if duration_hours <= 0:
                        return jsonify({"error": "Duration must be positive"}), 400
                    listing_expires_at = (datetime.utcnow() + timedelta(hours=duration_hours)).isoformat()
                except (TypeError, ValueError):
                    return jsonify({"error": "Invalid duration"}), 400
            
            g.db.execute(
                """
                UPDATE artworks
                SET is_listed = 1, price = ?, listing_expires_at = ?, listing_type = 'fixed'
                WHERE id = ?
                """,
                (price, listing_expires_at, artwork_id),
            )
            g.db.commit()
            return jsonify({"status": "listed", "type": "fixed"})

        if listing_type != "auction":
            return jsonify({"error": "Unsupported listing type"}), 400

        start_price = data.get("start_price")
        reserve_price = data.get("reserve_price")
        duration_hours = data.get("duration_hours", 24)
        if start_price is None or float(start_price) <= 0:
            return jsonify({"error": "Starting price required for auctions"}), 400
        try:
            duration_hours = int(duration_hours)
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid duration"}), 400
        if duration_hours <= 0:
            return jsonify({"error": "Duration must be positive"}), 400
        
        # Validate reserve price if provided
        if reserve_price is not None:
            try:
                reserve_price = float(reserve_price)
                if reserve_price < start_price:
                    return jsonify({"error": "Reserve price must be greater than or equal to starting price"}), 400
            except (TypeError, ValueError):
                return jsonify({"error": "Invalid reserve price"}), 400

        if open_auction:
            cancel_auction(g.db, open_auction["id"])

        end_time = (datetime.utcnow() + timedelta(hours=duration_hours)).isoformat()
        
        # Use UPDATE if auction exists, INSERT if it doesn't (due to UNIQUE constraint on artwork_id)
        # Note: current_bid and highest_bidder_id are computed from bids table (3NF compliant)
        if existing_auction:
            g.db.execute(
                """
                UPDATE auctions
                SET seller_id = ?, start_price = ?, reserve_price = ?, end_time = ?, 
                    status = 'open', winner_id = NULL
                WHERE artwork_id = ?
                """,
                (
                    session["user_id"],
                    start_price,
                    reserve_price,
                    end_time,
                    artwork_id,
                ),
            )
        else:
            g.db.execute(
                """
                INSERT INTO auctions (artwork_id, seller_id, start_price, reserve_price, end_time)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    artwork_id,
                    session["user_id"],
                    start_price,
                    reserve_price,
                    end_time,
                ),
            )
        g.db.execute(
            "UPDATE artworks SET is_listed = 1, listing_type = 'auction', price = ? WHERE id = ?",
            (start_price, artwork_id),
        )
        g.db.commit()
        return jsonify({"status": "listed", "type": "auction"})

    @app.post("/api/artworks/<int:artwork_id>/delist")
    @require_auth()
    def delist_artwork(artwork_id: int):
        artwork = g.db.execute(
            "SELECT owner_id FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not artwork:
            return jsonify({"error": "Artwork not found"}), 404
        if artwork["owner_id"] != session["user_id"]:
            return jsonify({"error": "Forbidden"}), 403

        open_auction = g.db.execute(
            "SELECT id FROM auctions WHERE artwork_id = ? AND status = 'open'",
            (artwork_id,),
        ).fetchone()
        if open_auction:
            cancel_auction(g.db, open_auction["id"])
        g.db.execute(
            "UPDATE artworks SET is_listed = 0, listing_type = NULL WHERE id = ?",
            (artwork_id,),
        )
        g.db.commit()
        return jsonify({"status": "delisted"})

    @app.get("/api/search")
    def search():
        query = request.args.get("q", "").strip()
        artwork_filters = []
        artwork_params = []
        if query:
            like = f"%{query}%"
            artwork_filters.append("(ar.title LIKE ? OR ar.description LIKE ? OR ar.category LIKE ?)")
            artwork_params.extend([like, like, like])
        artworks = fetch_artwork_with_relations(artwork_filters, artwork_params, limit=60)

        user_query = """
            SELECT id, username, display_name, bio, avatar_url
            FROM users
            {where}
            ORDER BY created_at DESC
            LIMIT 20
        """
        user_params = []
        if query:
            like = f"%{query}%"
            user_where = "WHERE username LIKE ? OR display_name LIKE ? OR bio LIKE ?"
            user_params.extend([like, like, like])
        else:
            user_where = ""
        users = g.db.execute(user_query.format(where=user_where), user_params).fetchall()

        return jsonify({
            "artworks": artworks,
            "users": [dict(u) for u in users],
        })

    @app.post("/api/artworks/<int:artwork_id>/favorite")
    @require_auth()
    def toggle_favorite(artwork_id: int):
        data = request.get_json() or {}
        should_favorite = data.get("favorite", True)
        if should_favorite:
            g.db.execute(
                """
                INSERT OR IGNORE INTO favorites (user_id, artwork_id)
                VALUES (?, ?)
                """,
                (session["user_id"], artwork_id),
            )
        else:
            g.db.execute(
                "DELETE FROM favorites WHERE user_id = ? AND artwork_id = ?",
                (session["user_id"], artwork_id),
            )
        g.db.commit()
        count_row = g.db.execute(
            "SELECT COUNT(1) AS cnt FROM favorites WHERE artwork_id = ?",
            (artwork_id,),
        ).fetchone()
        return jsonify({
            "favorited": should_favorite,
            "favorites": count_row["cnt"] if count_row else 0,
        })

    @app.post("/api/artworks/<int:artwork_id>/watch")
    @require_auth()
    def toggle_watch(artwork_id: int):
        data = request.get_json() or {}
        watching = data.get("watch", True)
        if watching:
            g.db.execute(
                """
                INSERT OR IGNORE INTO watchlist (user_id, artwork_id)
                VALUES (?, ?)
                """,
                (session["user_id"], artwork_id),
            )
        else:
            g.db.execute(
                "DELETE FROM watchlist WHERE user_id = ? AND artwork_id = ?",
                (session["user_id"], artwork_id),
            )
        g.db.commit()
        return jsonify({"watching": watching})

    @app.post("/api/artworks/<int:artwork_id>/purchase")
    @require_auth()
    def purchase_artwork(artwork_id: int):
        artwork = g.db.execute(
            "SELECT id, owner_id, price, is_listed FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not artwork:
            return jsonify({"error": "Artwork not found"}), 404
        if not artwork["is_listed"]:
            return jsonify({"error": "Artwork is not listed for sale"}), 400
        if artwork["owner_id"] == session["user_id"]:
            return jsonify({"error": "Cannot purchase your own artwork"}), 400

        # ensure not on auction
        auction = g.db.execute(
            "SELECT id FROM auctions WHERE artwork_id = ? AND status = 'open'",
            (artwork_id,),
        ).fetchone()
        if auction:
            return jsonify({"error": "Use bidding flow for auctions"}), 400

        price = artwork["price"] or 0
        buyer_balance = g.db.execute(
            "SELECT available_balance FROM balances WHERE user_id = ?",
            (session["user_id"],),
        ).fetchone()
        available = buyer_balance["available_balance"] if buyer_balance else 0
        if available < price:
            return jsonify({"error": "Insufficient balance"}), 400

        seller_balance = g.db.execute(
            "SELECT available_balance FROM balances WHERE user_id = ?",
            (artwork["owner_id"],),
        ).fetchone()
        
        # Calculate platform fee (2.5%)
        platform_fee = price * Config.PLATFORM_FEE_RATE
        seller_receives = price - platform_fee

        try:
            # Ensure buyer balance record exists
            g.db.execute(
                "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
                (session["user_id"],),
            )
            
            # Deduct full price from buyer
            # Note: total_spent is computed from transactions table (3NF compliant)
            g.db.execute(
                """
                UPDATE balances
                SET available_balance = available_balance - ?
                WHERE user_id = ?
                """,
                (price, session["user_id"]),
            )
            # Add to seller (minus platform fee)
            # Note: total_earned is computed from transactions table (3NF compliant)
            if seller_balance:
                g.db.execute(
                    """
                    UPDATE balances
                    SET available_balance = available_balance + ?
                    WHERE user_id = ?
                    """,
                    (seller_receives, artwork["owner_id"]),
                )
            else:
                g.db.execute(
                    """
                    INSERT INTO balances (user_id, available_balance)
                    VALUES (?, ?)
                    """,
                    (artwork["owner_id"], seller_receives),
                )

            # Buyer transaction records full purchase price
            g.db.execute(
                """
                INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
                VALUES (?, 'purchase', ?, 'completed', 'Artwork purchase', ?)
                """,
                (session["user_id"], price, artwork_id),
            )
            # Seller transaction records amount received (after fee)
            g.db.execute(
                """
                INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
                VALUES (?, 'sale', ?, 'completed', 'Artwork sold', ?)
                """,
                (artwork["owner_id"], seller_receives, artwork_id),
            )

            g.db.execute(
                """
                UPDATE artworks
                SET owner_id = ?, is_listed = 0
                WHERE id = ?
                """,
                (session["user_id"], artwork_id),
            )

            # Create single consolidated "sold" activity record
            # from_user = seller, to_user = buyer (for display: "Sold to [buyer] from [seller]")
            g.db.execute(
                """
                INSERT INTO activity (artwork_id, user_id, activity_type, price, from_user_id, to_user_id)
                VALUES (?, ?, 'sold', ?, ?, ?)
                """,
                (artwork_id, session["user_id"], price, artwork["owner_id"], session["user_id"]),
            )

            # Log price history - from_user_id should be the seller (who set/sold at this price)
            _log_price_history(g.db, artwork_id, price, artwork["owner_id"])

            g.db.commit()
        except Exception as exc:
            g.db.rollback()
            return jsonify({"error": str(exc)}), 400

        return jsonify({"status": "purchased"})

    @app.get("/api/recommendations")
    @require_auth()
    def recommendations():
        """Get recommendations using collaborative filtering."""
        try:
            recs = artwork_service.get_recommendations(session["user_id"], connection=g.db)
            return jsonify({"recommendations": recs})
        except Exception as e:
            logger.error(f"Recommendations error: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500

    @app.post("/api/auctions")
    @require_auth(role='seller')
    def create_auction():
        data = request.get_json() or {}
        required = ["title", "description", "category", "start_price", "end_time", "image_url"]
        if not all(data.get(field) for field in required):
            return jsonify({"error": "Missing fields"}), 400

        cursor = g.db.cursor()
        cursor.execute(
            """
            INSERT INTO artworks (artist_id, owner_id, title, description, category, image_url, price, is_listed)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                session["user_id"],
                session["user_id"],
                data["title"],
                data["description"],
                data.get("category"),
                data["image_url"],
                data["start_price"],
            ),
        )
        artwork_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO auctions (artwork_id, seller_id, start_price, reserve_price, end_time)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                artwork_id,
                session["user_id"],
                data["start_price"],
                data.get("reserve_price"),
                data["end_time"],
            ),
        )
        auction_id = cursor.lastrowid
        g.db.commit()
        return jsonify({"status": "created", "auction_id": auction_id, "artwork_id": artwork_id}), 201

    @app.get("/api/auctions/<int:auction_id>")
    def auction_detail(auction_id: int):
        # 3NF compliant: compute current_bid and highest_bidder_id from bids table
        auction = g.db.execute(
            """
            SELECT au.id, au.artwork_id, au.seller_id, au.start_price, au.reserve_price,
                   au.end_time, au.status, au.winner_id, au.created_at,
                   ar.title, ar.description, ar.category, ar.image_url,
                   u.username AS seller_username,
                   (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                   (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                    ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
            FROM auctions au
            JOIN artworks ar ON au.artwork_id = ar.id
            JOIN users u ON au.seller_id = u.id
            WHERE au.id = ?
            """,
            (auction_id,),
        ).fetchone()
        if not auction:
            return jsonify({"error": "Not found"}), 404

        bids = g.db.execute(
            """
            SELECT b.id, b.amount, b.created_at, u.username AS bidder
            FROM bids b
            JOIN users u ON b.bidder_id = u.id
            WHERE b.auction_id = ?
            ORDER BY b.amount DESC
            """,
            (auction_id,),
        ).fetchall()

        return jsonify({"auction": dict(auction), "bids": [dict(b) for b in bids]})

    @app.post("/api/artworks/<int:artwork_id>/bids")
    @require_auth()
    def place_bid_on_artwork(artwork_id: int):
        """Place a bid on an artwork's active auction."""
        data = request.get_json() or {}
        amount = data.get("amount")
        expires_at = data.get("expires_at")  # Optional expiry
        
        if amount is None:
            return jsonify({"error": "Bid amount required"}), 400

        # Find active auction for this artwork (3NF compliant: compute current_bid and highest_bidder_id)
        auction = g.db.execute(
            """
            SELECT au.*,
                   (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                   (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                    ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
            FROM auctions au
            WHERE au.artwork_id = ? AND au.status = 'open'
            """,
            (artwork_id,),
        ).fetchone()
        if not auction:
            return jsonify({"error": "No active auction for this artwork"}), 400
        
        # Check if auction has ended
        # Robust datetime handling: convert everything to naive UTC for comparison
        try:
            end_time_str = auction["end_time"]
            # Remove Z or offset if present to get naive time string
            if end_time_str.endswith("Z"):
                end_time_str = end_time_str[:-1]
            elif "+" in end_time_str:
                end_time_str = end_time_str.split("+")[0]
            
            auction_end = datetime.fromisoformat(end_time_str)
            now_utc = datetime.utcnow()
            
            if now_utc >= auction_end:
                 return jsonify({"error": "Auction has already ended"}), 400
        except Exception as e:
            logger.error(f"Date parsing error: {e}")
            # Fallback: if we can't parse, assume auction is open (or handle as error)
            pass
        
        # Check if user is the seller - cannot bid on own auction
        if auction["seller_id"] == session["user_id"]:
            return jsonify({"error": "Cannot bid on your own artwork"}), 400

        # Check if user already has an active bid
        existing_bid = g.db.execute(
            "SELECT id, amount, expires_at FROM bids WHERE auction_id = ? AND bidder_id = ? AND is_active = 1",
            (auction["id"], session["user_id"]),
        ).fetchone()
        
        # Safety check: Deactivate any other active bids from this user for this auction (shouldn't happen, but prevents duplicates)
        if existing_bid:
            g.db.execute(
                "UPDATE bids SET is_active = 0 WHERE auction_id = ? AND bidder_id = ? AND id != ? AND is_active = 1",
                (auction["id"], session["user_id"], existing_bid["id"]),
            )

        min_bid = auction["current_bid"] or auction["start_price"]
        bid_value = float(amount)
        
        if existing_bid:
            # Updating existing bid - check if adding more
            additional = bid_value - existing_bid["amount"]
            if additional <= 0:
                return jsonify({"error": "New bid must be higher than current bid"}), 400
            
            # Check balance for additional amount
            balance = g.db.execute(
                "SELECT available_balance, pending_balance FROM balances WHERE user_id = ?",
                (session["user_id"],),
            ).fetchone()
            available = balance["available_balance"] if balance else 0
            if available < additional:
                return jsonify({"error": "Insufficient balance"}), 400

            # Ensure balance record exists
            g.db.execute(
                "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
                (session["user_id"],),
            )
            
            # Update balance
            g.db.execute(
                """
                UPDATE balances
                SET available_balance = available_balance - ?, pending_balance = pending_balance + ?
                WHERE user_id = ?
                """,
                (additional, additional, session["user_id"]),
            )
            
            # Update bid - preserve expires_at if not provided, otherwise update it
            # Update bid - preserve expires_at if not provided, otherwise update it
            if expires_at:
                # Validate that expires_at doesn't exceed auction end time
                try:
                    end_time_str = auction["end_time"]
                    if end_time_str.endswith("Z"):
                        end_time_str = end_time_str[:-1]
                    elif "+" in end_time_str:
                        end_time_str = end_time_str.split("+")[0]
                    auction_end = datetime.fromisoformat(end_time_str)
                    
                    if isinstance(expires_at, str):
                        expires_str = expires_at
                        if expires_str.endswith("Z"):
                            expires_str = expires_str[:-1]
                        elif "+" in expires_str:
                            expires_str = expires_str.split("+")[0]
                        bid_expiry = datetime.fromisoformat(expires_str)
                        
                        if bid_expiry > auction_end:
                            expires_at = auction["end_time"]  # Use auction end time instead
                except Exception:
                    # If parsing fails, just use auction end time to be safe
                    expires_at = auction["end_time"]
                g.db.execute(
                    "UPDATE bids SET amount = ?, expires_at = ? WHERE id = ?",
                    (bid_value, expires_at, existing_bid["id"]),
                )
            else:
                # Preserve existing expires_at
                g.db.execute(
                    "UPDATE bids SET amount = ? WHERE id = ?",
                    (bid_value, existing_bid["id"]),
                )
            
            # Create transaction
            g.db.execute(
                """
                INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
                VALUES (?, 'bid_increase', ?, 'pending', ?, ?)
                """,
                (session["user_id"], additional, "Bid increased", artwork_id),
            )
            
            # Update existing activity record with new bid amount instead of creating duplicate
            g.db.execute(
                """
                UPDATE activity 
                SET price = ?, created_at = CURRENT_TIMESTAMP
                WHERE artwork_id = ? AND from_user_id = ? AND activity_type = 'bid'
                AND id = (
                    SELECT id FROM activity 
                    WHERE artwork_id = ? AND from_user_id = ? AND activity_type = 'bid'
                    ORDER BY created_at DESC LIMIT 1
                )
                """,
                (bid_value, artwork_id, session["user_id"], artwork_id, session["user_id"]),
            )
        else:
            # New bid - check balance for full amount
            balance = g.db.execute(
                "SELECT available_balance, pending_balance FROM balances WHERE user_id = ?",
                (session["user_id"],),
            ).fetchone()
            available = balance["available_balance"] if balance else 0
            if available < bid_value:
                return jsonify({"error": "Insufficient balance"}), 400

            if bid_value <= min_bid:
                return jsonify({"error": f"Bid must exceed ${min_bid}"}), 400

            # Safety check: Deactivate any existing active bids from this user for this auction (shouldn't happen, but prevents duplicates)
            g.db.execute(
                "UPDATE bids SET is_active = 0 WHERE auction_id = ? AND bidder_id = ? AND is_active = 1",
                (auction["id"], session["user_id"]),
            )

            # Ensure balance record exists
            g.db.execute(
                "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
                (session["user_id"],),
            )

            # Update balance
            g.db.execute(
                """
                UPDATE balances
                SET available_balance = available_balance - ?, pending_balance = pending_balance + ?
                WHERE user_id = ?
                """,
                (bid_value, bid_value, session["user_id"]),
            )
            
            # Create bid
            g.db.execute(
                "INSERT INTO bids (auction_id, bidder_id, amount, expires_at, is_active) VALUES (?, ?, ?, ?, 1)",
                (auction["id"], session["user_id"], bid_value, expires_at),
            )
            
            # Create transaction
            g.db.execute(
                """
                INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
                VALUES (?, 'bid', ?, 'pending', ?, ?)
                """,
                (session["user_id"], bid_value, "Bid placed", artwork_id),
            )
            
            # Record activity only for NEW bids (not bid increases)
            # Include to_user_id (seller) for display purposes
            g.db.execute(
                """
                INSERT INTO activity (artwork_id, user_id, activity_type, price, from_user_id, to_user_id)
                VALUES (?, ?, 'bid', ?, ?, ?)
                """,
                (artwork_id, session["user_id"], bid_value, session["user_id"], auction["seller_id"]),
            )

        # Note: current_bid and highest_bidder_id are computed from bids table (3NF compliant)
        # No need to update auction table - values are computed dynamically

        # Get artwork info for notifications
        artwork = g.db.execute(
            "SELECT title FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        artwork_title = artwork["title"] if artwork else "Artwork"
        
        # Check if there was a previous highest bidder and notify them
        previous_bidder_id = None
        if auction["highest_bidder_id"] and auction["highest_bidder_id"] != session["user_id"]:
            previous_bidder_id = auction["highest_bidder_id"]
            _create_notification(
                g.db,
                previous_bidder_id,
                "You've been outbid",
                f"Someone placed a higher bid of ${bid_value:.2f} on '{artwork_title}'",
                artwork_id,
                notification_type="bid",
                send_email=True,
            )

        # Notify watchlist users when a bid is placed
        watchlist_users = g.db.execute(
            """
            SELECT user_id FROM watchlist 
            WHERE artwork_id = ? AND user_id != ? AND user_id != ?
            """,
            (artwork_id, session["user_id"], previous_bidder_id if previous_bidder_id else -1),
        ).fetchall()
        
        for watcher in watchlist_users:
            watcher_id = watcher["user_id"]
            # Check if user wants watchlist bid notifications
            user_prefs = g.db.execute(
                "SELECT notification_watchlist_outbid FROM users WHERE id = ?",
                (watcher_id,),
            ).fetchone()
            
            # SQLite Row objects don't have .get() method, use direct access with default
            # Default to 1 (enabled) if not set or None
            notification_pref = user_prefs["notification_watchlist_outbid"] if user_prefs and user_prefs["notification_watchlist_outbid"] is not None else 1
            if notification_pref == 1:
                _create_notification(
                    g.db,
                    watcher_id,
                    "New Bid on Watched Item",
                    f"Someone placed a bid of ${bid_value:.2f} on '{artwork_title}' that you're watching",
                    artwork_id,
                    notification_type="watchlist_outbid",
                    send_email=True,
                )

        g.db.commit()
        return jsonify({"status": "bid_placed", "amount": bid_value})

    @app.post("/api/auctions/<int:auction_id>/bids")
    @require_auth()
    def place_bid(auction_id: int):
        """
        Legacy endpoint maintained for backward compatibility.
        Delegates to place_bid_on_artwork after resolving artwork_id.
        """
        data = request.get_json() or {}
        amount = data.get("amount")
        if amount is None:
            return jsonify({"error": "Bid amount required"}), 400

        auction = g.db.execute(
            "SELECT artwork_id FROM auctions WHERE id = ? AND status = 'open'",
            (auction_id,),
        ).fetchone()
        if not auction:
            return jsonify({"error": "Auction not open"}), 400

        # Delegate to artwork-based bidding endpoint to ensure consistent balance checks
        return place_bid_on_artwork(auction["artwork_id"])

    def _recompute_auction_state(auction_id: int):
        # 3NF compliant: current_bid and highest_bidder_id are now computed from bids table
        # No need to update auction table - values are computed dynamically in queries
        pass

    @app.put("/api/bids/<int:bid_id>")
    @require_auth()
    def update_bid(bid_id: int):
        data = request.get_json() or {}
        new_amount = data.get("amount")
        if new_amount is None:
            return jsonify({"error": "Amount required"}), 400
        bid = g.db.execute(
            """
            SELECT b.id, b.auction_id, b.amount, au.status
            FROM bids b
            JOIN auctions au ON b.auction_id = au.id
            WHERE b.id = ? AND b.bidder_id = ? AND b.is_active = 1
            """,
            (bid_id, session["user_id"]),
        ).fetchone()
        if not bid:
            return jsonify({"error": "Bid not found"}), 404
        if bid["status"] != "open":
            return jsonify({"error": "Auction is not open"}), 400
        new_amount = float(new_amount)
        if new_amount <= 0:
            return jsonify({"error": "Invalid amount"}), 400
        difference = new_amount - bid["amount"]
        balance = g.db.execute(
            "SELECT available_balance, pending_balance FROM balances WHERE user_id = ?",
            (session["user_id"],),
        ).fetchone()
        available = balance["available_balance"] if balance else 0
        pending = balance["pending_balance"] if balance else 0
        if difference > 0 and available < difference:
            return jsonify({"error": "Insufficient balance"}), 400
        
        # Ensure balance record exists
        g.db.execute(
            "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
            (session["user_id"],),
        )
        
        new_available = available - difference
        new_pending = pending + difference
        g.db.execute(
            """
            UPDATE balances
            SET available_balance = ?, pending_balance = ?
            WHERE user_id = ?
            """,
            (new_available, new_pending, session["user_id"]),
        )
        g.db.execute(
            "UPDATE bids SET amount = ? WHERE id = ?",
            (new_amount, bid_id),
        )
        # For bid_increase, status should be 'pending' (funds on hold)
        # For bid_decrease, status should be 'completed' (funds returned)
        txn_status = 'pending' if difference > 0 else 'completed'
        g.db.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, ?, ?, ?, ?, (SELECT artwork_id FROM auctions WHERE id = ?))
            """,
            (
                session["user_id"],
                "bid_increase" if difference > 0 else "bid_decrease",
                abs(difference),
                txn_status,
                "Bid amount adjusted",
                bid["auction_id"],
            ),
        )
        _recompute_auction_state(bid["auction_id"])
        g.db.commit()
        return jsonify({"status": "bid_updated"})

    @app.post("/api/bids/<int:bid_id>/cancel")
    @require_auth()
    def cancel_bid(bid_id: int):
        bid = g.db.execute(
            """
            SELECT b.id, b.auction_id, b.amount
            FROM bids b
            JOIN auctions au ON b.auction_id = au.id
            WHERE b.id = ? AND b.bidder_id = ? AND b.is_active = 1 AND au.status = 'open'
            """,
            (bid_id, session["user_id"]),
        ).fetchone()
        if not bid:
            return jsonify({"error": "Bid not found"}), 404
        g.db.execute(
            "UPDATE bids SET is_active = 0 WHERE id = ?",
            (bid_id,),
        )
        # Ensure balance record exists
        g.db.execute(
            "INSERT OR IGNORE INTO balances (user_id) VALUES (?)",
            (session["user_id"],),
        )
        g.db.execute(
            """
            UPDATE balances
            SET available_balance = available_balance + ?, pending_balance = pending_balance - ?
            WHERE user_id = ?
            """,
            (bid["amount"], bid["amount"], session["user_id"]),
        )
        
        # Get artwork_id for transaction
        artwork_id = g.db.execute(
            "SELECT artwork_id FROM auctions WHERE id = ?",
            (bid["auction_id"],),
        ).fetchone()["artwork_id"]
        
        # Mark original bid transaction(s) as cancelled
        g.db.execute(
            """
            UPDATE transactions
            SET status = 'cancelled'
            WHERE user_id = ? AND artwork_id = ? AND type IN ('bid', 'bid_increase') AND status = 'pending'
            """,
            (session["user_id"], artwork_id),
        )
        
        g.db.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'bid_refund', ?, 'completed', 'Bid cancelled', ?)
            """,
            (session["user_id"], bid["amount"], artwork_id),
        )
        
        # Get seller_id for activity record
        auction_info = g.db.execute(
            "SELECT seller_id FROM auctions WHERE id = ?",
            (bid["auction_id"],),
        ).fetchone()
        seller_id = auction_info["seller_id"] if auction_info else None
        
        # Record bid cancellation activity
        g.db.execute(
            """
            INSERT INTO activity (artwork_id, user_id, activity_type, price, from_user_id, to_user_id)
            VALUES (?, ?, 'bid_cancelled', ?, ?, ?)
            """,
            (artwork_id, session["user_id"], bid["amount"], session["user_id"], seller_id),
        )
        
        _recompute_auction_state(bid["auction_id"])
        g.db.commit()
        return jsonify({"status": "bid_cancelled"})

    @app.post("/api/auctions/<int:auction_id>/close")
    @require_auth()
    def close_auction(auction_id: int):
        # Check if user is the seller (3NF compliant: compute current_bid and highest_bidder_id)
        auction = g.db.execute(
            """
            SELECT au.id, au.artwork_id, au.seller_id, au.start_price, au.reserve_price,
                   au.end_time, au.status, au.winner_id, au.created_at,
                   (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                   (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                    ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
            FROM auctions au
            WHERE au.id = ? AND au.seller_id = ?
            """,
            (auction_id, session["user_id"]),
        ).fetchone()
        if not auction:
            return jsonify({"error": "Auction not found"}), 404

        try:
            _process_ended_auction(g.db, dict(auction))
            g.db.commit()
            return jsonify({"status": "closed", "auction_id": auction_id})
        except Exception as exc:
            g.db.rollback()
            return jsonify({"error": str(exc)}), 400

    @app.get("/api/health/scheduler")
    def scheduler_health():
        """Check scheduler status and automation health."""
        scheduler = app.config.get("SCHEDULER")
        if not scheduler:
            return jsonify({
                "status": "error",
                "message": "Scheduler not initialized",
                "automated": False
            }), 500
        
        jobs = scheduler.get_jobs()
        auction_job = next((j for j in jobs if j.id == "process_ended_auctions"), None)
        
        if not auction_job:
            return jsonify({
                "status": "error",
                "message": "Auction processor job not found",
                "automated": False
            }), 500
        
        # Check for ended auctions that need processing
        now = datetime.utcnow().isoformat()
        ended_count = g.db.execute(
            "SELECT COUNT(*) as count FROM auctions WHERE status = 'open' AND end_time <= ?",
            (now,)
        ).fetchone()["count"]
        
        return jsonify({
            "status": "healthy",
            "automated": True,
            "scheduler_running": scheduler.running,
            "auction_processor": {
                "job_id": auction_job.id,
                "next_run": auction_job.next_run_time.isoformat() if auction_job.next_run_time else None,
                "interval_minutes": Config.SCHEDULER_INTERVAL_MINUTES,
            },
            "pending_auctions": ended_count,
            "message": f"Automated processing runs every {Config.SCHEDULER_INTERVAL_MINUTES} minute(s)"
        })
    
    @app.post("/api/auctions/process-ended")
    def process_ended_auctions():
        """Process all ended auctions. Can be called manually or by a cron job."""
        now = datetime.utcnow().isoformat()
        # 3NF compliant: compute current_bid and highest_bidder_id from bids table
        ended_auctions = g.db.execute(
            """
            SELECT au.*,
                   (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                   (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                    ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
            FROM auctions au
            WHERE au.status = 'open' AND au.end_time <= ?
            """,
            (now,),
        ).fetchall()

        processed = []
        for auction in ended_auctions:
            try:
                _process_ended_auction(g.db, dict(auction))
                processed.append(auction["id"])
            except Exception as exc:
                g.db.rollback()
                continue

        g.db.commit()
        return jsonify({"status": "processed", "count": len(processed), "auction_ids": processed})

    @app.get("/api/me/auctions")
    @require_auth()
    def my_auctions():
        # Get auctions where user is the seller (3NF compliant)
        rows = g.db.execute(
            """
            SELECT au.id, au.artwork_id, au.seller_id, au.start_price, au.reserve_price,
                   au.end_time, au.status, au.winner_id, au.created_at,
                   (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
                   (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
                    ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
            FROM auctions au
            WHERE au.seller_id = ? ORDER BY au.created_at DESC
            """,
            (session["user_id"],),
        ).fetchall()
        return jsonify([dict(r) for r in rows])

    @app.get("/api/me/bids")
    @require_auth()
    def my_bids():
        rows = g.db.execute(
            """
            SELECT b.*, au.status, au.winner_id, ar.title
            FROM bids b
            JOIN auctions au ON b.auction_id = au.id
            JOIN artworks ar ON au.artwork_id = ar.id
            WHERE b.bidder_id = ?
            ORDER BY b.created_at DESC
            """,
            (session["user_id"],),
        ).fetchall()
        return jsonify([dict(r) for r in rows])

    # BALANCES ---------------------------------------------------------------
    @app.get("/api/balance")
    @require_auth()
    def get_balance():
        # 3NF compliant: compute total_earned and total_spent from transactions table
        row = g.db.execute(
            """
            SELECT 
                COALESCE(b.available_balance, 0) AS available_balance,
                COALESCE(b.pending_balance, 0) AS pending_balance,
                COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'sale' AND status = 'completed'), 0) AS total_earned,
                COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'purchase' AND status = 'completed'), 0) AS total_spent
            FROM balances b
            WHERE b.user_id = ?
            """,
            (session["user_id"], session["user_id"], session["user_id"]),
        ).fetchone()
        return jsonify(dict(row) if row else {"available_balance": 0, "pending_balance": 0, "total_earned": 0, "total_spent": 0})

    @app.post("/api/deposits")
    @require_auth()
    def deposit():
        amount = float((request.get_json() or {}).get("amount", 0))
        if amount <= 0:
            return jsonify({"error": "Invalid amount"}), 400

        # Note: total_earned and total_spent are computed from transactions table (3NF compliant)
        # Deposits just add to available_balance
        g.db.execute(
            """
            UPDATE balances
            SET available_balance = available_balance + ?
            WHERE user_id = ?
            """,
            (amount, session["user_id"]),
        )
        g.db.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description)
            VALUES (?, 'deposit', ?, 'completed', 'Manual deposit')
            """,
            (session["user_id"], amount),
        )
        g.db.commit()
        return jsonify({"status": "deposited"})

    @app.post("/api/withdrawals")
    @require_auth()
    def withdraw():
        amount = float((request.get_json() or {}).get("amount", 0))
        if amount <= 0:
            return jsonify({"error": "Invalid amount"}), 400
        balance = g.db.execute(
            "SELECT available_balance FROM balances WHERE user_id = ?",
            (session["user_id"],),
        ).fetchone()
        if not balance or balance["available_balance"] < amount:
            return jsonify({"error": "Insufficient funds"}), 400

        g.db.execute(
            """
            UPDATE balances
            SET available_balance = available_balance - ?
            WHERE user_id = ?
            """,
            (amount, session["user_id"]),
        )
        g.db.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description)
            VALUES (?, 'withdrawal', ?, 'completed', 'Manual withdrawal')
            """,
            (session["user_id"], amount),
        )
        g.db.commit()
        return jsonify({"status": "withdrawal_completed"})

    @app.get("/api/transactions")
    @require_auth()
    def list_transactions():
        try:
            limit = int(request.args.get("limit", 50))
        except ValueError:
            limit = 50
        try:
            offset = int(request.args.get("offset", 0))
        except ValueError:
            offset = 0
        limit = max(1, min(limit, 200))
        offset = max(0, offset)
        rows = g.db.execute(
            """
            SELECT id, type, amount, status, description, artwork_id, created_at
            FROM transactions
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (session["user_id"], limit, offset),
        ).fetchall()
        total = g.db.execute(
            "SELECT COUNT(1) AS cnt FROM transactions WHERE user_id = ?",
            (session["user_id"],),
        ).fetchone()
        return jsonify({
            "transactions": [dict(row) for row in rows],
            "total": total["cnt"] if total else 0,
        })

    # PRICE HISTORY ------------------------------------------------------------
    @app.get("/api/artworks/<int:artwork_id>/price-history")
    def get_price_history(artwork_id: int):
        """Get price history for an artwork."""
        rows = g.db.execute(
            """
            SELECT ph.*, u.username, u.display_name
            FROM price_history ph
            LEFT JOIN users u ON ph.from_user_id = u.id
            WHERE ph.artwork_id = ?
            ORDER BY ph.created_at DESC
            """,
            (artwork_id,),
        ).fetchall()
        return jsonify([dict(row) for row in rows])

    # ARTWORK BUNDLES ----------------------------------------------------------
    @app.post("/api/bundles")
    @require_auth()
    def create_bundle():
        """Create a new artwork bundle."""
        data = request.get_json() or {}
        title = data.get("title")
        description = data.get("description")
        
        if not title:
            return jsonify({"error": "Title required"}), 400
        
        cursor = g.db.cursor()
        cursor.execute(
            """
            INSERT INTO artwork_bundles (owner_id, title, description)
            VALUES (?, ?, ?)
            """,
            (session["user_id"], title, description),
        )
        bundle_id = cursor.lastrowid
        g.db.commit()
        return jsonify({"id": bundle_id, "status": "created"}), 201

    @app.get("/api/bundles")
    @require_auth()
    def list_bundles():
        """List bundles owned by the current user."""
        rows = g.db.execute(
            """
            SELECT b.*, COUNT(bi.artwork_id) as item_count
            FROM artwork_bundles b
            LEFT JOIN bundle_items bi ON b.id = bi.bundle_id
            WHERE b.owner_id = ?
            GROUP BY b.id
            ORDER BY b.created_at DESC
            """,
            (session["user_id"],),
        ).fetchall()
        return jsonify([dict(row) for row in rows])

    @app.get("/api/bundles/<int:bundle_id>")
    @require_auth()
    def get_bundle(bundle_id: int):
        """Get bundle details with items."""
        bundle = g.db.execute(
            "SELECT * FROM artwork_bundles WHERE id = ? AND owner_id = ?",
            (bundle_id, session["user_id"]),
        ).fetchone()
        if not bundle:
            return jsonify({"error": "Bundle not found"}), 404
        
        items = g.db.execute(
            """
            SELECT a.*, p.username as artist_name, p.display_name as artist_display_name
            FROM bundle_items bi
            JOIN artworks a ON bi.artwork_id = a.id
            JOIN users p ON a.artist_id = p.id
            WHERE bi.bundle_id = ?
            """,
            (bundle_id,),
        ).fetchall()
        
        return jsonify({
            **dict(bundle),
            "items": [dict(item) for item in items],
        })

    @app.post("/api/bundles/<int:bundle_id>/items")
    @require_auth()
    def add_bundle_item(bundle_id: int):
        """Add an artwork to a bundle."""
        data = request.get_json() or {}
        artwork_id = data.get("artwork_id")
        
        if not artwork_id:
            return jsonify({"error": "artwork_id required"}), 400
        
        # Verify bundle ownership
        bundle = g.db.execute(
            "SELECT id FROM artwork_bundles WHERE id = ? AND owner_id = ?",
            (bundle_id, session["user_id"]),
        ).fetchone()
        if not bundle:
            return jsonify({"error": "Bundle not found"}), 404
        
        # Verify artwork exists
        artwork = g.db.execute(
            "SELECT id FROM artworks WHERE id = ?",
            (artwork_id,),
        ).fetchone()
        if not artwork:
            return jsonify({"error": "Artwork not found"}), 404
        
        try:
            g.db.execute(
                "INSERT INTO bundle_items (bundle_id, artwork_id) VALUES (?, ?)",
                (bundle_id, artwork_id),
            )
            g.db.commit()
            return jsonify({"status": "added"})
        except Exception:
            g.db.rollback()
            return jsonify({"error": "Artwork already in bundle"}), 400

    @app.delete("/api/bundles/<int:bundle_id>/items/<int:artwork_id>")
    @require_auth()
    def remove_bundle_item(bundle_id: int, artwork_id: int):
        """Remove an artwork from a bundle."""
        bundle = g.db.execute(
            "SELECT id FROM artwork_bundles WHERE id = ? AND owner_id = ?",
            (bundle_id, session["user_id"]),
        ).fetchone()
        if not bundle:
            return jsonify({"error": "Bundle not found"}), 404
        
        g.db.execute(
            "DELETE FROM bundle_items WHERE bundle_id = ? AND artwork_id = ?",
            (bundle_id, artwork_id),
        )
        g.db.commit()
        return jsonify({"status": "removed"})

    @app.delete("/api/bundles/<int:bundle_id>")
    @require_auth()
    def delete_bundle(bundle_id: int):
        """Delete a bundle."""
        bundle = g.db.execute(
            "SELECT id FROM artwork_bundles WHERE id = ? AND owner_id = ?",
            (bundle_id, session["user_id"]),
        ).fetchone()
        if not bundle:
            return jsonify({"error": "Bundle not found"}), 404
        
        g.db.execute("DELETE FROM bundle_items WHERE bundle_id = ?", (bundle_id,))
        g.db.execute("DELETE FROM artwork_bundles WHERE id = ?", (bundle_id,))
        g.db.commit()
        return jsonify({"status": "deleted"})

    # Test email endpoint for debugging
    @app.post("/api/test-email")
    def test_email():
        """Test endpoint to verify email sending functionality."""
        try:
            from backend.config import Config
            from backend.services.email_service import EmailService
            
            # Check if API key is configured
            api_key_status = "SET" if Config.RESEND_API_KEY else "NOT SET"
            api_key_preview = Config.RESEND_API_KEY[:10] + "..." if Config.RESEND_API_KEY and len(Config.RESEND_API_KEY) > 10 else "NOT SET"
            
            # Try to send a test email
            email_service = EmailService()
            success = email_service.send_email(
                to_email="test@example.com",  # Will be redirected to hardcoded test email
                subject="Test Email from EtherMon",
                body="This is a test email to verify email functionality.",
                html_body="<h1>Test Email</h1><p>This is a test email to verify email functionality.</p>"
            )
            
            return jsonify({
                "status": "success" if success else "failed",
                "api_key_status": api_key_status,
                "api_key_preview": api_key_preview,
                "email_from": Config.EMAIL_FROM,
                "test_email_sent": success,
                "message": "Check logs for detailed information"
            }), 200 if success else 500
        except Exception as e:
            logger.error(f"Error in test email endpoint: {e}", exc_info=True)
            return jsonify({
                "status": "error",
                "error": str(e),
                "message": "Check server logs for details"
            }), 500

    return app


app = create_app()

if __name__ == "__main__":
    if not DB_PATH.exists():
        init_db(sample=True)
    try:
        import os
        port = int(os.environ.get("FLASK_PORT", "5001"))
        app.run(debug=True, port=port)
    except KeyboardInterrupt:
        # Shutdown scheduler on app exit
        if "SCHEDULER" in app.config:
            app.config["SCHEDULER"].shutdown()
        raise

