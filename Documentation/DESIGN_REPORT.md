# Design Report - ArtMart Digital Art Marketplace

## Summary

This design report documents the ArtMart digital art marketplace database system, including:
- **15 core entities** with proper relationships
- **Full Third Normal Form (3NF)** compliance - all derived values computed dynamically
- **63+ SQL queries** organized by functionality across authentication, artwork management, auctions, bids, balances, transactions, notifications, security, and background processing
- **Comprehensive ER diagram** with clear assumptions about business processes
- **Complete schema translation** from ER diagram to SQLite implementation

The database design supports a full-featured auction marketplace with user management, artwork listings, time-limited auctions, bid management with expiration, internal balance system, notifications, security features, and recommendation algorithms.

### Recent UX Enhancements

- **Search & Discovery** now offers both a card grid and an analytics-style table view. The table view surfaces current price/bid, views, likes, owner, and listing status (“ends in …” or “listing active”), giving collectors a quick way to scan large inventories.
- **Role-Aware Bios**: Buyers, sellers, and hybrid users automatically receive themed placeholder bios until they craft their own, ensuring every profile looks intentional even on day one.
- **Notification Preferences** gained a single-click “Send reset link” action that reuses the password-reset email flow for logged-in users, reducing friction when someone forgets their current password.

## 1. YouTube Video URL

[Insert YouTube video link here]

---

## 2. Entity Relationship Diagram

### ER Diagram Overview

The ArtMart platform uses a relational database design with 15 core entities supporting a digital art marketplace with auction capabilities. The ER diagram represents the following key entities and their relationships:

**Core Entities:**
- **users**: System users (buyers and sellers) with profiles, authentication, and preferences
- **artworks**: Digital art pieces with metadata, ownership, and listing status
- **auctions**: Time-limited auction listings for artworks
- **bids**: Individual bids placed on auctions with expiration support
- **activity**: Event log tracking all marketplace activities (bids, purchases, sales)
- **favorites**: User bookmarks for artworks
- **watchlist**: User watchlist for monitoring auctions
- **notifications**: In-app notifications for users
- **balances**: User account balances (available, pending, totals)
- **transactions**: Financial transaction records
- **price_history**: Historical price records for artworks
- **artwork_bundles**: Collections of artworks
- **bundle_items**: Junction table for bundle-artwork relationships
- **user_2fa**: Two-factor authentication settings
- **backup_codes**: 2FA backup recovery codes

### Key Assumptions

1. **User Roles**: Users can be 'buyer', 'seller', or 'both' (enforced via CHECK constraint). Users with 'both' role can access all buyer and seller features simultaneously without changing roles.

2. **Artwork Ownership**: Each artwork has both an `artist_id` (original creator) and `owner_id` (current owner). Ownership can transfer through purchases/auctions.

3. **Auction Model**: 
   - One artwork can have only one active auction at a time (enforced by UNIQUE constraint on `artwork_id`)
   - Auctions are time-limited with a fixed `end_time`
   - Highest bidder at auction end becomes the winner

4. **Bid Management**:
   - Only one active bid per user per auction (enforced by application logic)
   - Bids can have expiration times (`expires_at`) set by users
   - When a new bid is placed, previous active bids from the same user are deactivated
   - Bids are auction-scoped: ending one auction doesn't affect bids on other auctions

5. **Balance System**: 
   - Internal ledger system (no external payment integration)
   - `available_balance`: Funds available for bidding/purchasing
   - `pending_balance`: Funds locked in active bids
   - Balances automatically managed on bids, purchases, and auction endings

6. **Activity Logging**: All marketplace events (bids, purchases, sales) are logged in the `activity` table for audit and recommendation purposes.

7. **Notification System**: 
   - In-app notifications created for all relevant events
   - Email notifications optional (requires SMTP configuration)
   - Users can control notification preferences per type

8. **Security**: 
   - Password reset via secure tokens with expiration and SMTP-backed delivery
   - Session-based authentication with rate limiting and validation middleware
   - Tables for `user_2fa` and `backup_codes` remain in the schema for future expansion, but the current release disables the 2FA UI flows.

9. **Many-to-Many Relationships**: 
   - Users ↔ Artworks (via `favorites` and `watchlist` tables)
   - Artwork Bundles ↔ Artworks (via `bundle_items` table)

10. **3NF Compliance**: All tables are fully normalized with no transitive dependencies:
    - `favorites_count` is calculated dynamically from the `favorites` table
    - `current_bid` and `highest_bidder_id` are computed from the `bids` table via subqueries
    - `total_earned` and `total_spent` are computed from the `transactions` table
    - `seller_id` is stored in the `auctions` table (not a transitive dependency - seller is determined at auction creation time)

### Relationship Cardinalities

- **One-to-One**: 
  - `users` ↔ `balances` (1:1 via UNIQUE `user_id`)
  - `users` ↔ `user_2fa` (1:1 via PRIMARY KEY `user_id`)
  - `artworks` ↔ `auctions` (1:1 via UNIQUE `artwork_id`)

- **One-to-Many**: 
  - `users` → `artworks` (via `artist_id`, `owner_id`)
  - `users` → `auctions` (via `seller_id`, `highest_bidder_id`, `winner_id`)
  - `users` → `bids` (via `bidder_id`)
  - `users` → `transactions` (via `user_id`)
  - `users` → `notifications` (via `user_id`)
  - `artworks` → `bids` (via `auctions` → `bids`)
  - `artworks` → `activity` (via `artwork_id`)
  - `auctions` → `bids` (via `auction_id`)

- **Many-to-Many**: 
  - `users` ↔ `artworks` (via `favorites` and `watchlist` tables)
  - `artwork_bundles` ↔ `artworks` (via `bundle_items` table)

---

## 3. Database Schema

### Schema Translation from ER Diagram

The database schema translates the ER diagram into SQLite tables with proper foreign key relationships, constraints, and indexes. Each entity from the ER diagram maps to a corresponding table:

### Table Listing

#### **users**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `username` (TEXT UNIQUE NOT NULL)
- `email` (TEXT UNIQUE NOT NULL)
- `password_hash` (TEXT NOT NULL)
- `role` (TEXT NOT NULL CHECK: 'buyer', 'seller', or 'both')
- `display_name` (TEXT)
- `bio` (TEXT)
- `avatar_url` (TEXT)
- `banner_url` (TEXT)
- `twitter_handle` (TEXT)
- `instagram_handle` (TEXT)
- `website_url` (TEXT)
- `contact_email` (TEXT)
- `show_contact_email` (INTEGER DEFAULT 0)
- `notification_email` (INTEGER DEFAULT 1)
- `notification_bid` (INTEGER DEFAULT 1)
- `notification_sale` (INTEGER DEFAULT 1)
- `notification_like` (INTEGER DEFAULT 1)
- `notification_watchlist_outbid` (INTEGER DEFAULT 1)
- `notification_watchlist_ending` (INTEGER DEFAULT 1)
- `notification_auction_sold` (INTEGER DEFAULT 1)
- `password_reset_token` (TEXT)
- `password_reset_expires` (DATETIME)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: Central entity representing all system users. Stores authentication, profile, and notification preferences.

#### **artworks**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `artist_id` (INTEGER NOT NULL, FK → users.id)
- `owner_id` (INTEGER NOT NULL, FK → users.id)
- `title` (TEXT NOT NULL)
- `description` (TEXT)
- `category` (TEXT)
- `image_url` (TEXT)
- `price` (REAL)
- `is_listed` (INTEGER DEFAULT 1)
- `listing_expires_at` (DATETIME) - Optional expiry for fixed-price listings
- `views` (INTEGER DEFAULT 0) - View count (excludes owner views)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: Represents digital artworks. Links to users via `artist_id` (creator) and `owner_id` (current owner). Supports both fixed-price and auction listings.

#### **auctions**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `artwork_id` (INTEGER UNIQUE NOT NULL, FK → artworks.id)
- `seller_id` (INTEGER NOT NULL, FK → users.id)
- `start_price` (REAL NOT NULL)
- `reserve_price` (REAL)
- `current_bid` (REAL) - **DEPRECATED:** Now computed from `bids` table (3NF compliant)
- `highest_bidder_id` (INTEGER, FK → users.id) - **DEPRECATED:** Now computed from `bids` table (3NF compliant)
- `end_time` (DATETIME NOT NULL)
- `status` (TEXT NOT NULL DEFAULT 'open')
- `winner_id` (INTEGER, FK → users.id)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: One-to-one relationship with artworks. Tracks auction state, reserve price, and winner. UNIQUE constraint ensures one active auction per artwork. Reserve price must be >= start_price.

**3NF Compliance**: `current_bid` and `highest_bidder_id` are now computed dynamically via subqueries on the `bids` table, eliminating transitive dependencies.

#### **bids**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `auction_id` (INTEGER NOT NULL, FK → auctions.id)
- `bidder_id` (INTEGER NOT NULL, FK → users.id)
- `amount` (REAL NOT NULL)
- `expires_at` (DATETIME)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `is_active` (INTEGER DEFAULT 1)

**Translation**: Many-to-one with auctions and users. Tracks individual bids with expiration support. `is_active` flag manages bid lifecycle.

#### **activity**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `artwork_id` (INTEGER, FK → artworks.id)
- `user_id` (INTEGER NOT NULL, FK → users.id)
- `activity_type` (TEXT NOT NULL)
- `price` (REAL)
- `from_user_id` (INTEGER, FK → users.id)
- `to_user_id` (INTEGER, FK → users.id)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: Event log table tracking all marketplace activities (bids, purchases, sales). Used for recommendations and audit trails.

#### **favorites**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, FK → users.id)
- `artwork_id` (INTEGER NOT NULL, FK → artworks.id)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- UNIQUE(`user_id`, `artwork_id`)

**Translation**: Junction table for many-to-many relationship between users and artworks (favorites/bookmarks).

#### **watchlist**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, FK → users.id)
- `artwork_id` (INTEGER NOT NULL, FK → artworks.id)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- UNIQUE(`user_id`, `artwork_id`)

**Translation**: Junction table for many-to-many relationship between users and artworks (watchlist for auctions).

#### **notifications**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, FK → users.id)
- `title` (TEXT NOT NULL)
- `message` (TEXT NOT NULL)
- `artwork_id` (INTEGER, FK → artworks.id)
- `is_read` (INTEGER DEFAULT 0)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: In-app notifications for users. Links to artworks when relevant.

#### **balances**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER UNIQUE NOT NULL, FK → users.id)
- `available_balance` (REAL DEFAULT 0)
- `pending_balance` (REAL DEFAULT 0)
- `total_earned` (REAL DEFAULT 0) - **DEPRECATED:** Now computed from `transactions` table (3NF compliant)
- `total_spent` (REAL DEFAULT 0) - **DEPRECATED:** Now computed from `transactions` table (3NF compliant)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: One-to-one with users. Tracks internal ledger balances for the marketplace.

**3NF Compliance**: `total_earned` and `total_spent` are now computed dynamically from the `transactions` table (WHERE `type = 'sale'` and `type = 'purchase'` respectively), eliminating transitive dependencies.

#### **transactions**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, FK → users.id)
- `type` (TEXT NOT NULL)
- `amount` (REAL NOT NULL)
- `status` (TEXT NOT NULL)
- `description` (TEXT)
- `artwork_id` (INTEGER, FK → artworks.id)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: Financial transaction history. Records all deposits, withdrawals, purchases, and sales.

#### **price_history**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `artwork_id` (INTEGER NOT NULL, FK → artworks.id)
- `from_user_id` (INTEGER, FK → users.id)
- `amount` (REAL NOT NULL)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: Historical price records for artworks, tracking price changes over time.

#### **artwork_bundles**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `owner_id` (INTEGER NOT NULL, FK → users.id)
- `title` (TEXT NOT NULL)
- `description` (TEXT)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: Collections/bundles of artworks created by users.

#### **bundle_items**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `bundle_id` (INTEGER NOT NULL, FK → artwork_bundles.id)
- `artwork_id` (INTEGER NOT NULL, FK → artworks.id)
- UNIQUE(`bundle_id`, `artwork_id`)

**Translation**: Junction table for many-to-many relationship between bundles and artworks.

#### **user_2fa**
- `user_id` (INTEGER PRIMARY KEY, FK → users.id)
- `secret` (TEXT NOT NULL)
- `enabled` (INTEGER DEFAULT 0)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: One-to-one with users. Stores two-factor authentication settings.

#### **backup_codes**
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `user_id` (INTEGER NOT NULL, FK → users.id)
- `code` (TEXT NOT NULL)
- `used` (INTEGER DEFAULT 0)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

**Translation**: One-to-many with users. Stores 2FA backup recovery codes.

### Indexes

The schema includes 9 performance indexes:
- `idx_artworks_category` - Category filtering
- `idx_artworks_owner` - Owner lookups
- `idx_auctions_status` - Status filtering
- `idx_auctions_end_time` - Auction expiration queries
- `idx_bids_auction` - Bid lookups by auction
- `idx_activity_user` - User activity queries
- `idx_favorites_user` - User favorites
- `idx_watchlist_user` - User watchlist
- `idx_transactions_user` - User transaction history

---

## 4. Third Normal Form (3NF) Analysis

### Normalization Proof

#### **First Normal Form (1NF)**

✅ **All tables satisfy 1NF:**
- Every table has a primary key (INTEGER PRIMARY KEY AUTOINCREMENT)
- All attributes contain atomic values (no multi-valued or composite attributes)
- No repeating groups (all data is in single columns)

**Example**: The `users` table has atomic attributes like `username`, `email`, `password_hash` - each storing a single value.

#### **Second Normal Form (2NF)**

✅ **All tables satisfy 2NF:**
- All tables are in 1NF
- All non-key attributes are fully functionally dependent on the primary key
- No partial dependencies (all attributes depend on the entire primary key, not just part of it)

**Example**: In the `artworks` table, attributes like `title`, `description`, `price` all depend on the full primary key `id`, not on any subset.

**Junction Tables**: Tables like `favorites`, `watchlist`, and `bundle_items` have composite UNIQUE constraints but use a single-column primary key, ensuring 2NF compliance.

#### **Third Normal Form (3NF)**

✅ **All tables satisfy 3NF:**
- All tables are in 2NF
- No transitive dependencies (non-key attributes depend only on the primary key, not on other non-key attributes)

**Analysis by Table:**

1. **users**: All attributes (username, email, role, display_name, etc.) depend directly on `id`. No transitive dependencies.

2. **artworks**: Attributes depend on `id`. Foreign keys (`artist_id`, `owner_id`) reference other tables' primary keys, not creating transitive dependencies.

3. **auctions**: All attributes depend on `id`. Foreign keys properly reference primary keys in related tables.

4. **bids**: Attributes depend on `id`. Foreign keys reference primary keys.

5. **activity**: Attributes depend on `id`. Foreign keys reference primary keys.

6. **favorites/watchlist**: Junction tables with attributes depending on `id`. Foreign keys reference primary keys.

7. **notifications**: Attributes depend on `id`. Foreign keys reference primary keys.

8. **balances**: Attributes depend on `id`. One-to-one relationship with users via `user_id` (UNIQUE), not creating transitive dependency.

9. **transactions**: Attributes depend on `id`. Foreign keys reference primary keys.

10. **price_history**: Attributes depend on `id`. Foreign keys reference primary keys.

11. **artwork_bundles**: Attributes depend on `id`. Foreign keys reference primary keys.

12. **bundle_items**: Junction table with attributes depending on `id`. Foreign keys reference primary keys.

13. **user_2fa**: Attributes depend on `user_id` (primary key). One-to-one relationship with users.

14. **backup_codes**: Attributes depend on `id`. Foreign keys reference primary keys.

### Full 3NF Compliance

✅ **The schema is fully normalized with no denormalization**. All derived values are computed dynamically:

1. **`favorites_count`**: Calculated from the `favorites` table via `COUNT(*)` query
2. **`current_bid`**: Computed from `bids` table: `SELECT MAX(amount) FROM bids WHERE auction_id = ? AND is_active = 1`
3. **`highest_bidder_id`**: Computed from `bids` table: `SELECT bidder_id FROM bids WHERE auction_id = ? AND is_active = 1 ORDER BY amount DESC LIMIT 1`
4. **`total_earned`**: Computed from `transactions` table: `SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'sale' AND status = 'completed'`
5. **`total_spent`**: Computed from `transactions` table: `SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'purchase' AND status = 'completed'`

**Note**: `seller_id` is stored in the `auctions` table (not a transitive dependency - seller is determined at auction creation time and may differ from current artwork owner).

### Conclusion

✅ **The database schema is fully compliant with Third Normal Form (3NF)**. All tables properly eliminate:
- Repeating groups (1NF)
- Partial dependencies (2NF)
- Transitive dependencies (3NF)

The schema achieves full 3NF compliance by computing all derived values dynamically from their source-of-truth tables. The deprecated columns (`current_bid`, `highest_bidder_id`, `total_earned`, `total_spent`) remain in the schema for backward compatibility but are no longer updated - all queries compute these values via subqueries.

---

## 5. Database Queries

### Grouped by System Functionality

#### **A. User Authentication & Management**

**File**: `backend/repositories/user_repository.py`, `backend/app.py`

1. **Find user by ID**
   ```sql
   SELECT id, username, email, role, display_name, bio, avatar_url, banner_url, 
          twitter_handle, instagram_handle, website_url, contact_email, 
          show_contact_email, notification_email, notification_bid, 
          notification_sale, notification_like, notification_watchlist_outbid, 
          notification_watchlist_ending, notification_auction_sold
   FROM users WHERE id = ?
   ```
   **Purpose**: Retrieve user profile information by user ID.

2. **Find user by username**
   ```sql
   SELECT id, username, email, role, display_name, bio, avatar_url, banner_url, 
          twitter_handle, instagram_handle, website_url, contact_email, 
          show_contact_email, notification_email, notification_bid, 
          notification_sale, notification_like, notification_watchlist_outbid, 
          notification_watchlist_ending, notification_auction_sold
   FROM users WHERE username = ?
   ```
   **Purpose**: Retrieve user profile by username.

3. **Find user by email**
   ```sql
   SELECT id, username, email, role, display_name, bio, avatar_url, banner_url, 
          twitter_handle, instagram_handle, website_url, contact_email, 
          show_contact_email, notification_email, notification_bid, 
          notification_sale, notification_like, notification_watchlist_outbid, 
          notification_watchlist_ending, notification_auction_sold
   FROM users WHERE email = ?
   ```
   **Purpose**: Retrieve user profile by email address.

4. **Find user by username or email (login)**
   ```sql
   SELECT id, username, role, password_hash, display_name, email, avatar_url
   FROM users WHERE username = ? OR email = ?
   ```
   **Purpose**: Authenticate user login using username or email.

5. **Check if username or email exists**
   ```sql
   SELECT username, email FROM users WHERE username = ? OR email = ?
   ```
   **Purpose**: Validate uniqueness during user registration.

6. **Create new user**
   ```sql
   INSERT INTO users (username, email, password_hash, role, display_name)
   VALUES (?, ?, ?, ?, ?)
   ```
   **Purpose**: Register a new user account.

7. **Update user profile**
   ```sql
   UPDATE users SET display_name = ?, bio = ?, avatar_url = ?, 
                    twitter_handle = ?, instagram_handle = ?, website_url = ?, 
                    contact_email = ?, show_contact_email = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   ```
   **Purpose**: Update user profile information.

8. **Get password reset information**
   ```sql
   SELECT id, password_reset_token, password_reset_expires 
   FROM users WHERE email = ?
   ```
   **Purpose**: Retrieve password reset token for validation.

#### **B. Artwork Management**

**File**: `backend/repositories/artwork_repository.py`, `backend/app.py`

9. **List all artworks with filters**
   ```sql
   SELECT ar.*, artist.id AS artist_id, artist.username AS artist_username,
          artist.display_name AS artist_display_name, artist.avatar_url AS artist_avatar_url,
          owner.id AS owner_id, owner.username AS owner_username,
          owner.display_name AS owner_display_name, owner.avatar_url AS owner_avatar_url
   FROM artworks ar
   JOIN users artist ON ar.artist_id = artist.id
   JOIN users owner ON ar.owner_id = owner.id
   WHERE [filters]
   ORDER BY ar.created_at DESC
   ```
   **Purpose**: Browse artworks with artist and owner information, supporting filtering by category, listing status, etc. Note: The application layer filters out expired fixed-price listings (where `listing_expires_at` is set and has passed).

10. **Get artwork by ID**
    ```sql
    SELECT ar.*, artist.id AS artist_id, artist.username AS artist_username,
           artist.display_name AS artist_display_name, artist.avatar_url AS artist_avatar_url,
           owner.id AS owner_id, owner.username AS owner_username,
           owner.display_name AS owner_display_name, owner.avatar_url AS owner_avatar_url
    FROM artworks ar
    JOIN users artist ON ar.artist_id = artist.id
    JOIN users owner ON ar.owner_id = owner.id
    WHERE ar.id = ?
    ```
    **Purpose**: Retrieve detailed artwork information including artist and owner details.

11. **Get auctions for artworks**
    ```sql
    SELECT * FROM auctions WHERE artwork_id IN (?, ?, ...)
    ```
    **Purpose**: Retrieve auction information for multiple artworks in a single query.

12. **Create new artwork**
    ```sql
    INSERT INTO artworks (artist_id, owner_id, title, description, category, image_url, price, is_listed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ```
    **Purpose**: Create a new artwork listing.

13. **Update artwork**
    ```sql
    UPDATE artworks SET title = ?, description = ?, category = ?, 
                        price = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    ```
    **Purpose**: Update artwork information.

14. **Increment artwork views**
   ```sql
   UPDATE artworks SET views = COALESCE(views, 0) + 1 WHERE id = ?
   ```
   **Purpose**: Track artwork view count for analytics. Note: The application layer checks if the viewer is the artwork owner before incrementing (owner views are excluded).

15. **Get favorites count**
    ```sql
    SELECT COUNT(1) AS cnt FROM favorites WHERE artwork_id = ?
    ```
    **Purpose**: Count how many users have favorited an artwork.

16. **Get artwork owner**
    ```sql
    SELECT owner_id FROM artworks WHERE id = ?
    ```
    **Purpose**: Verify ownership for authorization checks.

17. **Count artworks by artist**
    ```sql
    SELECT COUNT(1) AS cnt FROM artworks WHERE artist_id = ?
    ```
    **Purpose**: Display artist's total artwork count on profile.

#### **C. Auction Management**

**File**: `backend/repositories/auction_repository.py`, `backend/app.py`

18. **List all auctions with filters (3NF compliant)**
    ```sql
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
    JOIN users u ON au.seller_id = u.id
    WHERE [filters]
    ORDER BY au.end_time
    ```
    **Purpose**: Browse active auctions with artwork and seller information. Note: `current_bid` is computed from the `bids` table for 3NF compliance.

19. **Get auction by ID (3NF compliant)**
    ```sql
    SELECT au.*,
           (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
           (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
            ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
    FROM auctions au
    WHERE au.id = ?
    ```
    **Purpose**: Retrieve auction details with computed bid information.

20. **Get auction by artwork ID**
    ```sql
    SELECT * FROM auctions WHERE artwork_id = ?
    ```
    **Purpose**: Find auction associated with a specific artwork.

21. **Get open auction by artwork ID**
    ```sql
    SELECT * FROM auctions WHERE artwork_id = ? AND status = 'open'
    ```
    **Purpose**: Check if an artwork has an active auction.

22. **Find ended auctions**
    ```sql
    SELECT * FROM auctions WHERE status = 'open' AND end_time <= ?
    ```
    **Purpose**: Background job query to find auctions that need processing.

23. **Create new auction**
    ```sql
    INSERT INTO auctions (artwork_id, seller_id, start_price, reserve_price, end_time)
    VALUES (?, ?, ?, ?, ?)
    ```
    **Purpose**: Create a new auction listing for an artwork.

24. **Update auction (3NF compliant)**
    ```sql
    UPDATE auctions SET status = ?, winner_id = ?
    WHERE id = ?
    ```
    **Purpose**: Update auction state (status, winner). Note: `current_bid` and `highest_bidder_id` are no longer updated - they are computed from the `bids` table.

25. **Close auction (3NF compliant)**
    ```sql
    UPDATE auctions SET status = 'closed', winner_id = ? WHERE id = ?
    ```
    **Purpose**: Mark auction as closed and set winner. Note: `current_bid` is computed from the `bids` table.

#### **D. Bid Management**

**File**: `backend/repositories/bid_repository.py`, `backend/app.py`

26. **Get bids for auction**
    ```sql
    SELECT b.*, u.username AS bidder_username, u.display_name AS bidder_display_name, 
           u.avatar_url AS bidder_avatar_url
    FROM bids b
    JOIN users u ON b.bidder_id = u.id
    WHERE b.auction_id = ? AND b.is_active = 1
    ORDER BY b.bidder_id, b.amount DESC, b.created_at DESC
    ```
    **Purpose**: Retrieve all active bids for an auction with bidder information.

27. **Get bid by ID**
    ```sql
    SELECT * FROM bids WHERE id = ?
    ```
    **Purpose**: Retrieve specific bid details.

28. **Get active bid by bidder**
    ```sql
    SELECT id, amount FROM bids 
    WHERE auction_id = ? AND bidder_id = ? AND is_active = 1
    ```
    **Purpose**: Check if user has an active bid on an auction.

29. **Get winning bid**
    ```sql
    SELECT bidder_id, amount FROM bids
    WHERE auction_id = ? AND is_active = 1
    ORDER BY amount DESC LIMIT 1
    ```
    **Purpose**: Find the highest active bid for an auction (winner determination).

30. **Create new bid**
    ```sql
    INSERT INTO bids (auction_id, bidder_id, amount, expires_at, is_active)
    VALUES (?, ?, ?, ?, ?)
    ```
    **Purpose**: Place a new bid on an auction.

31. **Deactivate previous bids**
    ```sql
    UPDATE bids SET is_active = 0 
    WHERE auction_id = ? AND bidder_id = ? AND is_active = 1
    ```
    **Purpose**: Deactivate user's previous bids when placing a new bid.

32. **Deactivate all bids for auction**
    ```sql
    UPDATE bids SET is_active = 0 WHERE auction_id = ?
    ```
    **Purpose**: Deactivate all bids when auction ends.

#### **E. Balance & Transactions**

**File**: `backend/repositories/balance_repository.py`, `backend/app.py`

33. **Get user balance (3NF compliant)**
    ```sql
    SELECT 
        COALESCE(b.available_balance, 0) AS available_balance,
        COALESCE(b.pending_balance, 0) AS pending_balance,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'sale' AND status = 'completed'), 0) AS total_earned,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE user_id = ? AND type = 'purchase' AND status = 'completed'), 0) AS total_spent
    FROM balances b
    WHERE b.user_id = ?
    ```
    **Purpose**: Retrieve user's account balance with totals computed from transactions table.

34. **Get available balance**
    ```sql
    SELECT available_balance, pending_balance FROM balances WHERE user_id = ?
    ```
    **Purpose**: Check available funds for bidding/purchasing.

35. **Create balance record**
    ```sql
    INSERT OR IGNORE INTO balances (user_id) VALUES (?)
    ```
    **Purpose**: Initialize balance record for new user.

36. **Update balance (3NF compliant)**
    ```sql
    UPDATE balances SET available_balance = available_balance + ?, 
                        pending_balance = pending_balance + ?
    WHERE user_id = ?
    ```
    **Purpose**: Update balance amounts (supports incremental updates). Note: `total_earned` and `total_spent` are no longer updated - they are computed from the `transactions` table.

37. **Create transaction record**
    ```sql
    INSERT INTO transactions (user_id, type, amount, status, description, artwork_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ```
    **Purpose**: Record financial transaction (deposit, withdrawal, purchase, sale).

38. **Get transaction history**
    ```sql
    SELECT t.*, a.title AS artwork_title
    FROM transactions t
    LEFT JOIN artworks a ON t.artwork_id = a.id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC
    ```
    **Purpose**: Retrieve user's transaction history with artwork details.

#### **F. Activity & Price History**

**File**: `backend/app.py`

39. **Get activity records**
    ```sql
    SELECT * FROM activity WHERE artwork_id = ? ORDER BY created_at DESC
    ```
    **Purpose**: Retrieve activity log for an artwork (bids, purchases, sales).

40. **Create activity record**
    ```sql
    INSERT INTO activity (artwork_id, user_id, activity_type, price, from_user_id, to_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
    ```
    **Purpose**: Log marketplace activity for audit and recommendations.

41. **Add price history**
    ```sql
    INSERT INTO price_history (artwork_id, from_user_id, amount)
    VALUES (?, ?, ?)
    ```
    **Purpose**: Record price change in artwork's price history.

42. **Get price history**
    ```sql
    SELECT ph.*, u.username AS from_username
    FROM price_history ph
    JOIN users u ON ph.from_user_id = u.id
    WHERE ph.artwork_id = ?
    ORDER BY ph.created_at DESC
    ```
    **Purpose**: Retrieve historical price records for an artwork.

#### **G. Favorites & Watchlist**

**File**: `backend/app.py`

43. **Check if favorited**
    ```sql
    SELECT 1 FROM favorites WHERE user_id = ? AND artwork_id = ?
    ```
    **Purpose**: Check if user has favorited an artwork.

44. **Add to favorites**
    ```sql
    INSERT OR IGNORE INTO favorites (user_id, artwork_id) VALUES (?, ?)
    ```
    **Purpose**: Add artwork to user's favorites.

45. **Remove from favorites**
    ```sql
    DELETE FROM favorites WHERE user_id = ? AND artwork_id = ?
    ```
    **Purpose**: Remove artwork from user's favorites.

46. **Get user favorites**
    ```sql
    SELECT a.*, u.username AS artist_name
    FROM favorites f
    JOIN artworks a ON f.artwork_id = a.id
    JOIN users u ON a.artist_id = u.id
    WHERE f.user_id = ?
    ```
    **Purpose**: Retrieve all artworks favorited by a user.

47. **Check if in watchlist**
    ```sql
    SELECT 1 FROM watchlist WHERE user_id = ? AND artwork_id = ?
    ```
    **Purpose**: Check if user is watching an artwork/auction.

48. **Add to watchlist**
    ```sql
    INSERT OR IGNORE INTO watchlist (user_id, artwork_id) VALUES (?, ?)
    ```
    **Purpose**: Add artwork to user's watchlist.

49. **Remove from watchlist**
    ```sql
    DELETE FROM watchlist WHERE user_id = ? AND artwork_id = ?
    ```
    **Purpose**: Remove artwork from user's watchlist.

#### **H. Notifications**

**File**: `backend/repositories/notification_repository.py`, `backend/app.py`

50. **Get user notifications**
    ```sql
    SELECT id, title, message, artwork_id, is_read, created_at
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    ```
    **Purpose**: Retrieve user's notifications (unread first).

51. **Get unread count**
    ```sql
    SELECT COUNT(1) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0
    ```
    **Purpose**: Count unread notifications for badge display.

52. **Create notification**
    ```sql
    INSERT INTO notifications (user_id, title, message, artwork_id)
    VALUES (?, ?, ?, ?)
    ```
    **Purpose**: Create in-app notification for user.

53. **Mark notification as read**
    ```sql
    UPDATE notifications SET is_read = 1 
    WHERE id IN (?, ?, ...) AND user_id = ?
    ```
    **Purpose**: Mark specific notifications as read.

54. **Mark all notifications as read**
    ```sql
    UPDATE notifications SET is_read = 1 WHERE user_id = ?
    ```
    **Purpose**: Mark all user notifications as read.

#### **I. Security (2FA)**

**File**: `backend/app.py`

55. **Get 2FA status**
    ```sql
    SELECT enabled FROM user_2fa WHERE user_id = ?
    ```
    **Purpose**: Check if user has 2FA enabled.

56. **Create/update 2FA**
    ```sql
    INSERT INTO user_2fa (user_id, secret, enabled)
    VALUES (?, ?, 0)
    ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled = 0
    ```
    **Purpose**: Setup 2FA secret for user.

57. **Enable 2FA**
    ```sql
    UPDATE user_2fa SET enabled = 1 WHERE user_id = ?
    ```
    **Purpose**: Enable 2FA after verification.

58. **Disable 2FA**
    ```sql
    DELETE FROM user_2fa WHERE user_id = ?
    DELETE FROM backup_codes WHERE user_id = ?
    ```
    **Purpose**: Remove 2FA and backup codes when disabling.

59. **Get backup codes**
    ```sql
    SELECT id, code, used FROM backup_codes WHERE user_id = ?
    ```
    **Purpose**: Retrieve user's 2FA backup codes.

60. **Create backup codes**
    ```sql
    INSERT INTO backup_codes (user_id, code, used) VALUES (?, ?, 0)
    ```
    **Purpose**: Generate backup codes for 2FA recovery.

#### **J. Search & Recommendations**

**File**: `backend/app.py`

61. **Search artworks**
    ```sql
    SELECT ar.*, artist.username AS artist_username, artist.avatar_url AS artist_avatar_url
    FROM artworks ar
    JOIN users artist ON ar.artist_id = artist.id
    WHERE (ar.title LIKE ? OR ar.description LIKE ?) 
      AND ar.is_listed = 1
    ORDER BY ar.created_at DESC
    ```
    **Purpose**: Search artworks by title or description.

62. **Get recommendations (collaborative filtering)**
    ```sql
    SELECT DISTINCT a.*, u.username AS artist_name
    FROM activity act
    JOIN artworks a ON act.artwork_id = a.id
    JOIN users u ON a.artist_id = u.id
    WHERE act.user_id IN (
      SELECT DISTINCT a2.user_id
      FROM activity a1
      JOIN activity a2 ON a1.artwork_id = a2.artwork_id
      WHERE a1.user_id = ? AND a2.user_id != ?
        AND a1.activity_type = 'bid' AND a2.activity_type = 'bid'
    )
    AND act.artwork_id NOT IN (
      SELECT artwork_id FROM activity WHERE user_id = ?
    )
    AND a.is_listed = 1
    LIMIT 10
    ```
    **Purpose**: Recommend artworks based on similar users' bid patterns (collaborative filtering).

#### **K. Background Jobs**

**File**: `backend/jobs/auction_processor.py`

63. **Find ended auctions for processing (3NF compliant)**
    ```sql
    SELECT au.*,
           (SELECT MAX(b.amount) FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
           (SELECT b.bidder_id FROM bids b WHERE b.auction_id = au.id AND b.is_active = 1 
            ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
    FROM auctions au
    WHERE au.status = 'open' AND au.end_time <= ?
    ```
    **Purpose**: Background job query to find auctions that have ended and need processing (winner determination, balance updates, notifications). Bid information is computed dynamically for 3NF compliance.

