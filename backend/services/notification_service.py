"""Notification service for business logic."""
from typing import Optional
from sqlite3 import Connection
from backend.repositories.notification_repository import NotificationRepository
from backend.repositories.user_repository import UserRepository
from backend.services.email_service import EmailService
import logging

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for notification business logic."""
    
    def __init__(self):
        self.notification_repo = NotificationRepository()
        self.user_repo = UserRepository()
        self.email_service = EmailService()
    
    def _check_notification_preference(
        self,
        user: dict,
        notification_type: str
    ) -> bool:
        """Check if user has enabled a specific notification type."""
        # Map notification types to user preference fields
        preference_map = {
            "bid": "notification_bid",
            "sale": "notification_sale",
            "like": "notification_like",
            "watchlist_outbid": "notification_watchlist_outbid",
            "watchlist_ending": "notification_watchlist_ending",
            "auction_sold": "notification_auction_sold",
            "auction_won": "notification_auction_sold",  # Use auction_sold for won auctions
            "auction_ended": "notification_auction_sold",
        }
        
        preference_field = preference_map.get(notification_type)
        if not preference_field:
            # Unknown notification type, allow by default
            return True
        
        # Check preference (default to 1 if not set)
        return user.get(preference_field, 1) == 1
    
    def create_notification(
        self,
        user_id: int,
        title: str,
        message: str,
        artwork_id: Optional[int] = None,
        send_email: bool = False,
        notification_type: Optional[str] = None,
        connection: Optional[Connection] = None
    ) -> Optional[int]:
        """
        Create a notification and optionally send email.
        
        Args:
            user_id: User to notify
            title: Notification title
            message: Notification message
            artwork_id: Optional artwork ID
            send_email: Whether to send email
            notification_type: Type of notification ('bid', 'sale', 'like', etc.)
            connection: Optional database connection
            
        Returns:
            Notification ID if created, None if skipped due to preferences
        """
        # Get user to check preferences
        user = self.user_repo.find_by_id(user_id, connection=connection) if connection else self.user_repo.find_by_id(user_id)
        if not user:
            logger.warning(f"User {user_id} not found, skipping notification")
            return None
        
        # Check notification preference if type is specified
        if notification_type and not self._check_notification_preference(user, notification_type):
            logger.debug(f"User {user_id} has disabled {notification_type} notifications, skipping")
            return None
        
        # Create notification
        notification_id = self.notification_repo.create(
            {
                "user_id": user_id,
                "title": title,
                "message": message,
                "artwork_id": artwork_id,
            },
            connection=connection
        )
        
        # Send email if requested and user has email notifications enabled
        if send_email:
            if user.get("email") and user.get("notification_email", 1) == 1:
                html_body = f"""
                <html>
                  <body>
                    <h2>{title}</h2>
                    <p>{message}</p>
                    <p>Visit your notifications to see more details.</p>
                  </body>
                </html>
                """
                self.email_service.send_email(
                    user["email"],
                    f"EtherMon: {title}",
                    message,
                    html_body
                )
        
        return notification_id
    
    def get_notifications(self, user_id: int, limit: int = 10, connection: Optional[Connection] = None):
        """Get notifications for a user."""
        notifications = self.notification_repo.find_by_user_id(user_id, limit, connection=connection)
        unread_count = self.notification_repo.get_unread_count(user_id, connection=connection)
        return {
            "notifications": notifications,
            "unread": unread_count,
        }
    
    def mark_read(self, notification_ids: list, user_id: int, connection: Optional[Connection] = None):
        """Mark notifications as read."""
        self.notification_repo.mark_read(notification_ids, user_id, connection=connection)
    
    def mark_all_read(self, user_id: int, connection: Optional[Connection] = None):
        """Mark all notifications as read."""
        self.notification_repo.mark_all_read(user_id, connection=connection)

