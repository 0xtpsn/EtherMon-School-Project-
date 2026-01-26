"""Auction service for business logic."""
from typing import Dict, Any, Optional
from sqlite3 import Connection
from backend.config import Config
from backend.repositories.auction_repository import AuctionRepository
from backend.repositories.artwork_repository import ArtworkRepository
from backend.repositories.bid_repository import BidRepository
from backend.repositories.balance_repository import BalanceRepository
from backend.repositories.user_repository import UserRepository
from backend.services.notification_service import NotificationService
from backend.utils.exceptions import NotFoundError, PermissionError, ValidationError
from backend.utils.validators import validate_auction_create
import logging

logger = logging.getLogger(__name__)


class AuctionService:
    """Service for auction business logic."""
    
    def __init__(self):
        self.auction_repo = AuctionRepository()
        self.artwork_repo = ArtworkRepository()
        self.bid_repo = BidRepository()
        self.balance_repo = BalanceRepository()
        self.user_repo = UserRepository()
        self.notification_service = NotificationService()
    
    def list_auctions(self, filters: Dict[str, Any] = None, connection: Optional[Connection] = None):
        """List auctions with optional filters."""
        filters_list = ["au.status = 'open'"]
        params = []
        
        if filters:
            if filters.get("keyword"):
                filters_list.append("(ar.title LIKE ? OR ar.description LIKE ?)")
                like = f"%{filters['keyword']}%"
                params.extend([like, like])
            if filters.get("category") and filters["category"].lower() != "all":
                filters_list.append("ar.category = ?")
                params.append(filters["category"])
        
        # 3NF compliant: price is computed from bids table in the repository
        order_map = {
            "price": "price",  # Uses computed column from repository query
            "newest": "ar.created_at DESC",
            "end_time": "au.end_time",
        }
        sort_key = filters.get("sort", "end_time") if filters else "end_time"
        order_by = order_map.get(sort_key, "au.end_time")
        
        return self.auction_repo.find_all(filters_list, params, order_by=order_by, connection=connection)
    
    def create_auction(self, user_id: int, data: Dict[str, Any], connection: Optional[Connection] = None) -> int:
        """Create a new auction."""
        validate_auction_create(data)
        
        # Create artwork first
        artwork_id = self.artwork_repo.create({
            "artist_id": user_id,
            "owner_id": user_id,
            "title": data["title"],
            "description": data.get("description"),
            "category": data.get("category"),
            "image_url": data.get("image_url"),
            "price": data.get("start_price"),
            "is_listed": 1,
        }, connection=connection)
        
        # Create auction (seller_id required by database schema)
        auction_id = self.auction_repo.create({
            "artwork_id": artwork_id,
            "seller_id": user_id,
            "start_price": data["start_price"],
            "reserve_price": data.get("reserve_price"),
            "end_time": data["end_time"],
        }, connection=connection)
        
        logger.info(f"Auction created: {data.get('title')} (ID: {auction_id}) by user {user_id}")
        return auction_id
    
    def process_ended_auction(self, connection: Connection, auction: Dict[str, Any]) -> None:
        """Process a single ended auction with reserve price support."""
        auction_id = auction["id"]
        artwork_id = auction["artwork_id"]
        
        # Get seller_id from auction (stored at creation time)
        seller_id = auction.get("seller_id")
        if not seller_id:
            # Fallback: get seller from artwork owner_id if seller_id not in auction dict
            artwork = self.artwork_repo.find_by_id(artwork_id, connection=connection)
            if not artwork:
                raise NotFoundError("Artwork not found")
            seller_id = artwork["owner_id"]
        
        # Get winning bid
        winning_bid = self.bid_repo.find_winning_bid(auction_id, connection=connection)
        winner_id = winning_bid["bidder_id"] if winning_bid else None
        winning_amount = winning_bid["amount"] if winning_bid else None
        
        # Check reserve price - if highest bid doesn't meet reserve, no winner
        reserve_price = auction.get("reserve_price")
        reserve_not_met = False
        if winner_id and winning_amount and reserve_price:
            if winning_amount < reserve_price:
                reserve_not_met = True
                logger.info(f"Auction {auction_id}: Reserve price ${reserve_price} not met (highest bid: ${winning_amount})")
        
        # Determine final winner (None if reserve not met)
        final_winner_id = None if reserve_not_met else winner_id
        
        # Close the auction (winner_id is stored for historical reference)
        # Note: current_bid is now computed from bids table (3NF compliant)
        self.auction_repo.update(auction_id, {
            "status": "closed",
            "winner_id": final_winner_id,
        }, connection=connection)
        
        # Get artwork title for notifications
        artwork = self.artwork_repo.find_by_id(artwork_id, connection=connection)
        artwork_title = artwork["title"] if artwork else "Artwork"
        
        if final_winner_id and winning_amount:
            # Successful sale - process normally
            self._process_successful_sale(
                connection, auction_id, artwork_id, final_winner_id, 
                winning_amount, seller_id, artwork_title
            )
        elif reserve_not_met:
            # Reserve price not met - refund all bidders
            self._process_reserve_not_met(
                connection, auction_id, artwork_id, seller_id, 
                artwork_title, reserve_price, winning_amount
            )
        else:
            # No bids at all
            self.artwork_repo.update(artwork_id, {"is_listed": 0}, connection=connection)
            self.notification_service.create_notification(
                seller_id,
                "Auction Ended",
                f"Your auction for '{artwork_title}' ended with no bids",
                artwork_id,
                send_email=True,
                connection=connection
            )
    
    def _process_successful_sale(
        self, connection: Connection, auction_id: int, artwork_id: int,
        winner_id: int, winning_amount: float, seller_id: int, artwork_title: str
    ) -> None:
        """Process a successful auction sale."""
        # Calculate platform fee (2.5%)
        platform_fee = winning_amount * Config.PLATFORM_FEE_RATE
        seller_receives = winning_amount - platform_fee
        
        # Transfer ownership
        self.artwork_repo.update(artwork_id, {
            "owner_id": winner_id,
            "is_listed": 0,
        }, connection=connection)
        
        # Update buyer balance
        buyer_balance = self.balance_repo.find_by_user_id(winner_id, connection=connection)
        if buyer_balance:
            new_pending = max(0, buyer_balance["pending_balance"] - winning_amount)
            self.balance_repo.update(winner_id, {
                "pending_balance": new_pending,
            }, connection=connection)
        else:
            connection.execute(
                "INSERT INTO balances (user_id, available_balance, pending_balance) VALUES (?, 0, 0)",
                (winner_id,),
            )
        
        # Update seller balance (minus platform fee)
        seller_balance = self.balance_repo.find_by_user_id(seller_id, connection=connection)
        if seller_balance:
            self.balance_repo.update(seller_id, {
                "available_balance": seller_balance["available_balance"] + seller_receives,
            }, connection=connection)
        else:
            connection.execute(
                "INSERT INTO balances (user_id, available_balance) VALUES (?, ?)",
                (seller_id, seller_receives),
            )
        
        # Create transactions
        connection.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'purchase', ?, 'completed', 'Auction won', ?)
            """,
            (winner_id, winning_amount, artwork_id),
        )
        connection.execute(
            """
            INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
            VALUES (?, 'sale', ?, 'completed', 'Auction sold', ?)
            """,
            (seller_id, seller_receives, artwork_id),
        )
        
        # Log price history
        connection.execute(
            "INSERT INTO price_history (artwork_id, from_user_id, amount) VALUES (?, ?, ?)",
            (artwork_id, winner_id, winning_amount),
        )
        
        # Record activity
        connection.execute(
            """
            INSERT INTO activity (artwork_id, user_id, activity_type, price, from_user_id, to_user_id)
            VALUES (?, ?, 'sale', ?, ?, ?)
            """,
            (artwork_id, winner_id, winning_amount, winner_id, seller_id),
        )
        
        # Create notifications
        self.notification_service.create_notification(
            winner_id,
            "Auction Won - Ownership Transferred",
            f"Congratulations! You won the auction for '{artwork_title}' with a bid of ${winning_amount:.2f}. "
            f"The artwork has been transferred to your account and ${winning_amount:.2f} has been deducted from your balance.",
            artwork_id,
            send_email=True,
            connection=connection
        )
        self.notification_service.create_notification(
            seller_id,
            "Auction Sold - Payment Received",
            f"Your auction for '{artwork_title}' has ended successfully. The artwork sold for ${winning_amount:.2f}. "
            f"After the 2.5% platform fee, ${seller_receives:.2f} has been transferred to your account balance.",
            artwork_id,
            send_email=True,
            connection=connection
        )
        
        # Refund losing bidders (only for THIS specific auction)
        losing_bidders = connection.execute(
            """
            SELECT bidder_id, SUM(amount) AS total_amount, COUNT(*) AS bid_count
            FROM bids
            WHERE auction_id = ? AND bidder_id != ? AND is_active = 1
            GROUP BY bidder_id
            """,
            (auction_id, winner_id),
        ).fetchall()
        
        for bidder in losing_bidders:
            self._refund_bidder(
                connection, auction_id, artwork_id, artwork_title,
                bidder["bidder_id"], bidder["total_amount"], bidder["bid_count"],
                "Auction ended - bid refunded"
            )
    
    def _process_reserve_not_met(
        self, connection: Connection, auction_id: int, artwork_id: int,
        seller_id: int, artwork_title: str, reserve_price: float, highest_bid: float
    ) -> None:
        """Process an auction where reserve price was not met."""
        # Delist the artwork
        self.artwork_repo.update(artwork_id, {"is_listed": 0}, connection=connection)
        
        # Notify seller
        self.notification_service.create_notification(
            seller_id,
            "Auction Ended - Reserve Not Met",
            f"Your auction for '{artwork_title}' ended but the reserve price of ${reserve_price:.2f} was not met. "
            f"The highest bid was ${highest_bid:.2f}. All bidders have been refunded.",
            artwork_id,
            send_email=True,
            connection=connection
        )
        
        # Refund ALL bidders
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
            self._refund_bidder(
                connection, auction_id, artwork_id, artwork_title,
                bidder["bidder_id"], bidder["total_amount"], bidder["bid_count"],
                "Reserve price not met - bid refunded",
                reserve_not_met=True
            )
    
    def _refund_bidder(
        self, connection: Connection, auction_id: int, artwork_id: int,
        artwork_title: str, bidder_id: int, total_refund_amount: float, 
        bid_count: int, description: str, reserve_not_met: bool = False
    ) -> None:
        """Refund a bidder and send notification."""
        # Refund the total bid amount
        bidder_balance = self.balance_repo.find_by_user_id(bidder_id, connection=connection)
        if bidder_balance:
            new_available = bidder_balance["available_balance"] + total_refund_amount
            new_pending = max(0, bidder_balance["pending_balance"] - total_refund_amount)
            connection.execute(
                "UPDATE balances SET available_balance = ?, pending_balance = ? WHERE user_id = ?",
                (new_available, new_pending, bidder_id),
            )
        else:
            connection.execute(
                "INSERT INTO balances (user_id, available_balance) VALUES (?, ?)",
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
            VALUES (?, 'bid_refund', ?, 'completed', ?, ?)
            """,
            (bidder_id, total_refund_amount, description, artwork_id),
        )
        
        # Mark bids as inactive
        connection.execute(
            "UPDATE bids SET is_active = 0 WHERE auction_id = ? AND bidder_id = ? AND is_active = 1",
            (auction_id, bidder_id),
        )
        
        # Create notification
        bid_text = f"bid of ${total_refund_amount:.2f}" if bid_count == 1 else f"total bids of ${total_refund_amount:.2f} ({bid_count} bids)"
        
        if reserve_not_met:
            title = "Auction Ended - Reserve Not Met"
            message = (
                f"The auction for '{artwork_title}' has ended but the reserve price was not met. "
                f"Your {bid_text} has been refunded and returned to your available balance."
            )
        else:
            title = "Auction Ended - Bid Refunded"
            message = (
                f"The auction for '{artwork_title}' has ended. You were not the winning bidder. "
                f"Your {bid_text} has been refunded and returned to your available balance."
            )
        
        self.notification_service.create_notification(
            bidder_id,
            title,
            message,
            artwork_id,
            send_email=True,
            connection=connection
        )

