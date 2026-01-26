"""Bid service for business logic."""
from typing import Dict, Any, Optional
from sqlite3 import Connection
from backend.repositories.bid_repository import BidRepository
from backend.repositories.auction_repository import AuctionRepository
from backend.repositories.balance_repository import BalanceRepository
from backend.repositories.artwork_repository import ArtworkRepository
from backend.services.notification_service import NotificationService
from backend.utils.exceptions import NotFoundError, PermissionError, ValidationError
from backend.db import get_connection
import logging

logger = logging.getLogger(__name__)


class BidService:
    """Service for bid business logic."""
    
    def __init__(self):
        self.bid_repo = BidRepository()
        self.auction_repo = AuctionRepository()
        self.balance_repo = BalanceRepository()
        self.artwork_repo = ArtworkRepository()
        self.notification_service = NotificationService()
    
    def place_bid(self, auction_id: int, bidder_id: int, amount: float, connection: Optional[Connection] = None):
        """Place a bid on an auction."""
        auction = self.auction_repo.find_by_id(auction_id, connection=connection)
        if not auction or auction["status"] != "open":
            raise NotFoundError("Auction not open")
        
        # Get artwork to check owner (seller)
        artwork = self.artwork_repo.find_by_id(auction["artwork_id"], connection=connection)
        if not artwork:
            raise NotFoundError("Artwork not found")
        
        # Check if user is the seller (owner)
        if artwork["owner_id"] == bidder_id:
            raise PermissionError("Cannot bid on your own auction")
        
        min_bid = auction["current_bid"] or auction["start_price"]
        if float(amount) <= float(min_bid):
            raise ValidationError("Bid must exceed current price")
        
        # Check balance
        available = self.balance_repo.get_available_balance(bidder_id, connection=connection)
        if available < amount:
            raise ValidationError("Insufficient balance")
        
        # Check for existing bid
        existing_bid = self.bid_repo.find_active_by_bidder(auction_id, bidder_id, connection=connection)
        
        if existing_bid:
            # Update existing bid
            additional = amount - existing_bid["amount"]
            if additional <= 0:
                raise ValidationError("New bid must be higher than current bid")
            
            # Update balance
            self.balance_repo.update(bidder_id, {
                "available_balance": -additional,
                "pending_balance": additional,
            }, connection=connection)
            
            # Update bid
            self.bid_repo.update(existing_bid["id"], {"amount": amount}, connection=connection)
        else:
            # New bid
            # Update balance
            self.balance_repo.update(bidder_id, {
                "available_balance": -amount,
                "pending_balance": amount,
            }, connection=connection)
            
            # Create bid
            self.bid_repo.create({
                "auction_id": auction_id,
                "bidder_id": bidder_id,
                "amount": amount,
                "is_active": 1,
            }, connection=connection)
        
        # Note: current_bid and highest_bidder_id are now computed from bids table (3NF compliant)
        # No need to update auction table with denormalized values
        
        # Get artwork info for notifications
        artwork = self.artwork_repo.find_by_id(auction["artwork_id"], connection=connection)
        artwork_title = artwork["title"] if artwork else "Artwork"
        artwork_id = auction["artwork_id"]
        
        # Notify previous highest bidder if they were outbid
        previous_bidder_id = auction.get("highest_bidder_id")
        if previous_bidder_id and previous_bidder_id != bidder_id:
            self.notification_service.create_notification(
                previous_bidder_id,
                "You've been outbid",
                f"Someone placed a higher bid of ${amount:.2f} on '{artwork_title}'",
                artwork_id,
                send_email=True,
                notification_type="bid",
                connection=connection
            )
        
        # Notify watchlist users when a bid is placed
        conn = connection or get_connection()
        should_close = not connection
        try:
            watchlist_users = conn.execute(
                """
                SELECT w.user_id, u.notification_watchlist_outbid
                FROM watchlist w
                JOIN users u ON w.user_id = u.id
                WHERE w.artwork_id = ? AND w.user_id != ? AND w.user_id != ?
                """,
                (artwork_id, bidder_id, previous_bidder_id if previous_bidder_id else -1),
            ).fetchall()
            
            for watcher in watchlist_users:
                # SQLite Row objects support dictionary-style access but not .get() method
                watcher_id = watcher["user_id"]
                # Check if user wants watchlist bid notifications
                # Default to 1 (enabled) if not set or None
                try:
                    notification_pref = watcher["notification_watchlist_outbid"] or 1
                except (KeyError, IndexError):
                    notification_pref = 1
                if notification_pref == 1:
                    self.notification_service.create_notification(
                        watcher_id,
                        "New Bid on Watched Item",
                        f"Someone placed a bid of ${amount:.2f} on '{artwork_title}' that you're watching",
                        artwork_id,
                        send_email=True,
                        notification_type="watchlist_outbid",
                        connection=connection
                    )
        finally:
            # Only close if we created the connection ourselves
            if should_close:
                conn.close()
        
        logger.info(f"Bid placed: ${amount} on auction {auction_id} by user {bidder_id}")
        return {"status": "bid_placed", "amount": amount}
    
    def update_bid(self, bid_id: int, user_id: int, new_amount: float, connection: Optional[Connection] = None):
        """Update a bid amount."""
        bid = self.bid_repo.find_by_id(bid_id, connection=connection)
        if not bid:
            raise NotFoundError("Bid not found")
        
        if bid["bidder_id"] != user_id:
            raise PermissionError("You can only update your own bids")
        
        auction = self.auction_repo.find_by_id(bid["auction_id"], connection=connection)
        if not auction or auction["status"] != "open":
            raise NotFoundError("Auction not open")
        
        if new_amount <= bid["amount"]:
            raise ValidationError("New bid must be higher than current bid")
        
        additional = new_amount - bid["amount"]
        available = self.balance_repo.get_available_balance(user_id, connection=connection)
        if available < additional:
            raise ValidationError("Insufficient balance")
        
        # Update balance
        self.balance_repo.update(user_id, {
            "available_balance": -additional,
            "pending_balance": additional,
        }, connection=connection)
        
        # Update bid
        self.bid_repo.update(bid_id, {"amount": new_amount}, connection=connection)
        
        # Note: current_bid and highest_bidder_id are now computed from bids table (3NF compliant)
        # No need to update auction table with denormalized values
        
        logger.info(f"Bid {bid_id} updated to ${new_amount} by user {user_id}")
        return {"status": "bid_updated"}
    
    def cancel_bid(self, bid_id: int, user_id: int, connection: Optional[Connection] = None):
        """Cancel a bid."""
        bid = self.bid_repo.find_by_id(bid_id, connection=connection)
        if not bid:
            raise NotFoundError("Bid not found")
        
        if bid["bidder_id"] != user_id:
            raise PermissionError("You can only cancel your own bids")
        
        auction = self.auction_repo.find_by_id(bid["auction_id"], connection=connection)
        if not auction or auction["status"] != "open":
            raise NotFoundError("Auction not open")
        
        # Refund balance
        self.balance_repo.update(user_id, {
            "available_balance": bid["amount"],
            "pending_balance": -bid["amount"],
        }, connection=connection)
        
        # Deactivate bid
        self.bid_repo.update(bid_id, {"is_active": 0}, connection=connection)
        
        # Mark original bid transaction(s) as cancelled
        artwork_id = auction["artwork_id"]
        conn = connection or get_connection()
        conn.execute(
            """
            UPDATE transactions
            SET status = 'cancelled'
            WHERE user_id = ? AND artwork_id = ? AND type IN ('bid', 'bid_increase') AND status = 'pending'
            """,
            (user_id, artwork_id),
        )
        
        # Create refund transaction
        conn.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'bid_refund', ?, 'completed', 'Bid cancelled', ?)
            """,
            (user_id, bid["amount"], artwork_id),
        )
        
        # Note: current_bid and highest_bidder_id are now computed from bids table (3NF compliant)
        # No need to update auction table - the computed values will automatically reflect the change
        
        logger.info(f"Bid {bid_id} cancelled by user {user_id}")
        return {"status": "bid_cancelled"}

