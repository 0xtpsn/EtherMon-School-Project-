"""Background job for processing ended auctions."""
from datetime import datetime
from backend.db import get_connection
import logging

logger = logging.getLogger(__name__)

# Use auction service for processing
from backend.services.auction_service import AuctionService


def process_ended_auctions_job():
    """Background job to process ended auctions."""
    try:
        db = get_connection()
        now = datetime.utcnow().isoformat()
        # 3NF compliant: compute current_bid and highest_bidder_id from bids table
        ended_auctions = db.execute(
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

        processed_count = 0
        auction_service = AuctionService()
        for auction in ended_auctions:
            try:
                auction_service.process_ended_auction(db, dict(auction))
                processed_count += 1
            except Exception as exc:
                db.rollback()
                logger.error(f"Error processing auction {auction['id']}: {exc}", exc_info=True)
                continue

        db.commit()
        db.close()
        if processed_count > 0:
            logger.info(f"✓ Processed {processed_count} ended auction(s)")
        else:
            logger.debug("Auction processor ran - no ended auctions to process")
    except Exception as exc:
        logger.error(f"✗ Error in process_ended_auctions_job: {exc}", exc_info=True)

