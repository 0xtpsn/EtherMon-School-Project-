-- SQLite schema for ArtMart auction platform (REFACTORED)
-- Run this file once (e.g. `python backend/init_db.py`) to bootstrap auction.db
-- 
-- NORMALIZATION: This schema is fully compliant with Third Normal Form (3NF)
-- All derived values are computed dynamically from source tables.
--
-- REFACTORED: Removed unused tables and views:
--   - categories (unused, categories hardcoded in frontend)
--   - artwork_bundles (no frontend usage)
--   - bundle_items (no frontend usage)
--   - user_2fa (2FA UI disabled, user requested removal)
--   - backup_codes (2FA UI disabled, user requested removal)
--   - artwork_views (user requested removal)
--   - All views (v_auctions_with_bids, v_balances_with_totals, v_artworks_with_stats)
PRAGMA foreign_keys = ON;
-- =============================================================================
-- USERS & SECURITY
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    -- Google OAuth
    google_id TEXT UNIQUE,
    -- Role can be 'buyer' or 'seller'. Users can perform both roles by having 
    -- appropriate permissions checked at the application layer.
    role TEXT NOT NULL CHECK(role IN ('buyer', 'seller')),
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    twitter_handle TEXT,
    instagram_handle TEXT,
    website_url TEXT,
    contact_email TEXT,
    show_contact_email INTEGER DEFAULT 0,
    -- Notification preferences
    notification_email INTEGER DEFAULT 1,
    notification_bid INTEGER DEFAULT 1,
    notification_sale INTEGER DEFAULT 1,
    notification_like INTEGER DEFAULT 1,
    notification_watchlist_outbid INTEGER DEFAULT 1,
    notification_watchlist_ending INTEGER DEFAULT 1,
    notification_auction_sold INTEGER DEFAULT 1,
    -- Password reset
    password_reset_token TEXT,
    password_reset_expires DATETIME,
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- =============================================================================
-- MARKETPLACE DATA
-- =============================================================================
CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    -- Category enum: predefined categories only
    category TEXT CHECK(category IN ('Photography', 'Digital Art', 'Painting', 'Illustration', '3D Art', 'Animation', 'Pixel Art', 'Abstract')),
    image_url TEXT,
    price REAL,
    is_listed INTEGER DEFAULT 1,
    -- Listing type: 'fixed' (fixed price), 'auction' (in auction), 'display' (display only), NULL (unlisted)
    listing_type TEXT CHECK(listing_type IN ('fixed', 'auction', 'display')),
    listing_expires_at DATETIME,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES users(id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);
-- =============================================================================
-- AUCTIONS (3NF Compliant - no derived values stored)
-- =============================================================================
-- 
-- IMPORTANT 3NF COMPLIANCE NOTE:
-- current_bid and highest_bidder_id are NOT stored in this table.
-- They are computed dynamically from the bids table using subqueries:
--   current_bid = SELECT MAX(amount) FROM bids WHERE auction_id = ? AND is_active = 1
--   highest_bidder_id = SELECT bidder_id FROM bids WHERE auction_id = ? AND is_active = 1 
--                       ORDER BY amount DESC LIMIT 1
--
-- This eliminates transitive dependencies and ensures data consistency.
CREATE TABLE IF NOT EXISTS auctions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id INTEGER NOT NULL UNIQUE,
    seller_id INTEGER NOT NULL,
    start_price REAL NOT NULL,
    reserve_price REAL,
    -- Minimum price seller will accept (optional)
    end_time DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'cancelled')),
    winner_id INTEGER,
    -- Set when auction closes successfully
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    auction_id INTEGER NOT NULL,
    bidder_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    expires_at DATETIME,
    -- Optional bid expiration
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1,
    -- 0 = cancelled/inactive, 1 = active
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (bidder_id) REFERENCES users(id) ON DELETE CASCADE
);
-- =============================================================================
-- ACTIVITY & HISTORY
-- =============================================================================
CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id INTEGER,
    user_id INTEGER NOT NULL,
    -- Activity type enum
    activity_type TEXT NOT NULL CHECK(activity_type IN ('bid', 'purchased', 'sold', 'sale', 'auction_won', 'auction_ended', 'purchase', 'view', 'favorite', 'offer')),
    price REAL,
    from_user_id INTEGER,
    to_user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id INTEGER NOT NULL,
    from_user_id INTEGER,
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);
-- =============================================================================
-- USER INTERACTIONS
-- =============================================================================
-- Junction table for many-to-many: users <-> artworks (favorites)
CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    artwork_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, artwork_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);
-- Junction table for many-to-many: users <-> artworks (watchlist)
CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    artwork_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, artwork_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE
);
-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    artwork_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);
-- =============================================================================
-- WALLET & PAYMENTS (3NF Compliant - no derived values stored)
-- =============================================================================
--
-- IMPORTANT 3NF COMPLIANCE NOTE:
-- total_earned and total_spent are NOT stored in this table.
-- They are computed dynamically from the transactions table:
--   total_earned = SELECT SUM(amount) FROM transactions WHERE user_id = ? 
--                  AND type = 'sale' AND status = 'completed'
--   total_spent = SELECT SUM(amount) FROM transactions WHERE user_id = ? 
--                 AND type = 'purchase' AND status = 'completed'
--
-- This eliminates transitive dependencies and ensures data consistency.
CREATE TABLE IF NOT EXISTS balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    available_balance REAL DEFAULT 0,
    -- Funds available for bidding/purchasing
    pending_balance REAL DEFAULT 0,
    -- Funds locked in active bids
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    -- Transaction type enum
    type TEXT NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'purchase', 'sale', 'bid', 'bid_increase', 'bid_refund')),
    amount REAL NOT NULL,
    -- Transaction status enum
    status TEXT NOT NULL CHECK(status IN ('completed', 'pending', 'failed', 'cancelled')),
    description TEXT,
    artwork_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (artwork_id) REFERENCES artworks(id)
);
-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
-- Artworks indexes
CREATE INDEX IF NOT EXISTS idx_artworks_category ON artworks(category);
CREATE INDEX IF NOT EXISTS idx_artworks_owner ON artworks(owner_id);
CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_listed ON artworks(is_listed);
CREATE INDEX IF NOT EXISTS idx_artworks_listing_type ON artworks(listing_type);
-- Auctions indexes
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_end_time ON auctions(end_time);
CREATE INDEX IF NOT EXISTS idx_auctions_status_end ON auctions(status, end_time);
-- Composite for finding ended auctions
CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions(seller_id);
-- Bids indexes
CREATE INDEX IF NOT EXISTS idx_bids_auction ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_active ON bids(auction_id, is_active);
-- For finding active bids
-- Activity indexes
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_artwork ON activity(artwork_id);
CREATE INDEX IF NOT EXISTS idx_activity_type_user ON activity(activity_type, user_id);
-- For recommendations
-- User interaction indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_artwork ON favorites(artwork_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_artwork ON watchlist(artwork_id);
-- Transaction indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(user_id, type, status);
-- For computing totals
-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
