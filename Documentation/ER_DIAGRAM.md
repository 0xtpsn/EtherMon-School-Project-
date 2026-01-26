# Entity Relationship Diagram (ERD)
## ArtMart Online Auction System

---

## Database Schema Overview

This document provides a complete Entity Relationship Diagram for the ArtMart auction platform using SQLite.

**Database System:** SQLite  
**Normalization Level:** Third Normal Form (3NF) ✅  
**Total Entities:** 16 tables  
**Total Relationships:** 20+ foreign key relationships

---

## Entities and Relationships

### **Core Entities**

#### 1. **users**
**Primary Key:** `id`  
**Description:** System users (buyers and sellers)

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `username` (TEXT, UNIQUE, NOT NULL)
- `email` (TEXT, UNIQUE, NOT NULL)
- `password_hash` (TEXT, NOT NULL)
- `role` (TEXT, NOT NULL, CHECK: **'buyer' or 'seller'**)
- `display_name` (TEXT)
- `bio` (TEXT)
- `avatar_url` (TEXT)
- `banner_url` (TEXT)
- `twitter_handle` (TEXT)
- `instagram_handle` (TEXT)
- `website_url` (TEXT)
- `contact_email` (TEXT)
- `show_contact_email` (INTEGER, DEFAULT 0)
- `notification_email` (INTEGER, DEFAULT 1)
- `notification_bid` (INTEGER, DEFAULT 1)
- `notification_sale` (INTEGER, DEFAULT 1)
- `notification_like` (INTEGER, DEFAULT 1)
- `notification_watchlist_outbid` (INTEGER, DEFAULT 1)
- `notification_watchlist_ending` (INTEGER, DEFAULT 1)
- `notification_auction_sold` (INTEGER, DEFAULT 1)
- `password_reset_token` (TEXT)
- `password_reset_expires` (DATETIME)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Role Enforcement Note:**  
The `role` column can be either `'buyer'` or `'seller'`. Users with `'seller'` role can perform both buying and selling actions (application-level permission). The CHECK constraint ensures data integrity at the database level.

**Relationships:**
- One-to-Many with `artworks` (as `artist_id` and `owner_id`)
- One-to-Many with `auctions` (as `seller_id`, `winner_id`)
- One-to-Many with `bids` (as `bidder_id`)
- One-to-Many with `activity` (as `user_id`, `from_user_id`, `to_user_id`)
- One-to-Many with `favorites` (as `user_id`)
- One-to-Many with `watchlist` (as `user_id`)
- One-to-Many with `notifications` (as `user_id`)
- One-to-One with `balances` (as `user_id`)
- One-to-Many with `transactions` (as `user_id`)
- One-to-One with `user_2fa` (as `user_id`)
- One-to-Many with `backup_codes` (as `user_id`)
- One-to-Many with `artwork_bundles` (as `owner_id`)
- One-to-Many with `price_history` (as `from_user_id`)

---

#### 2. **categories** (NEW - For Normalization)
**Primary Key:** `id`  
**Description:** Predefined artwork categories

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `name` (TEXT, UNIQUE, NOT NULL)
- `description` (TEXT)
- `display_order` (INTEGER, DEFAULT 0)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Predefined Values:**
- Photography, Digital Art, Painting, Illustration, 3D Art, Animation, Pixel Art, Generative, Other

**Relationships:**
- Referenced by `artworks.category` (loosely coupled for flexibility)

---

#### 3. **artworks**
**Primary Key:** `id`  
**Description:** Artwork items listed on the platform

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `artist_id` (INTEGER, FK → users.id, NOT NULL)
- `owner_id` (INTEGER, FK → users.id, NOT NULL)
- `title` (TEXT, NOT NULL)
- `description` (TEXT)
- `category` (TEXT) - Can reference categories.name
- `image_url` (TEXT)
- `price` (REAL)
- `is_listed` (INTEGER, DEFAULT 1)
- `listing_expires_at` (DATETIME) - Optional expiry for fixed-price listings
- `views` (INTEGER, DEFAULT 0) - View count (excludes owner views)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**3NF Compliance Note:**  
`favorites_count` is NOT stored. It is computed dynamically:
```sql
SELECT COUNT(*) FROM favorites WHERE artwork_id = ?
```

**Relationships:**
- Many-to-One with `users` (as `artist_id`)
- Many-to-One with `users` (as `owner_id`)
- One-to-One with `auctions` (as `artwork_id`)
- One-to-Many with `bids` (via `auctions`)
- One-to-Many with `activity` (as `artwork_id`)
- One-to-Many with `price_history` (as `artwork_id`)
- One-to-Many with `favorites` (as `artwork_id`)
- One-to-Many with `watchlist` (as `artwork_id`)
- One-to-Many with `notifications` (as `artwork_id`)
- One-to-Many with `transactions` (as `artwork_id`)
- Many-to-Many with `artwork_bundles` (via `bundle_items`)

---

#### 4. **auctions** (3NF Compliant)
**Primary Key:** `id`  
**Description:** Auction listings for artworks

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `artwork_id` (INTEGER, FK → artworks.id, UNIQUE, NOT NULL)
- `seller_id` (INTEGER, FK → users.id, NOT NULL) - Seller who created the auction
- `start_price` (REAL, NOT NULL)
- `reserve_price` (REAL) - Optional minimum price seller is willing to accept
- `end_time` (DATETIME, NOT NULL)
- `status` (TEXT, NOT NULL, DEFAULT 'open', CHECK: 'open', 'closed', 'cancelled')
- `winner_id` (INTEGER, FK → users.id) - Set when auction closes
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**3NF Compliance Note:**  
`current_bid` and `highest_bidder_id` are **NOT stored**. They are computed dynamically using subqueries on the `bids` table:

```sql
-- current_bid
SELECT MAX(amount) FROM bids WHERE auction_id = ? AND is_active = 1

-- highest_bidder_id  
SELECT bidder_id FROM bids WHERE auction_id = ? AND is_active = 1 
ORDER BY amount DESC LIMIT 1
```

This eliminates transitive dependencies and ensures data consistency.

**Relationships:**
- One-to-One with `artworks` (as `artwork_id`)
- Many-to-One with `users` (as `seller_id`)
- Many-to-One with `users` (as `winner_id`)
- One-to-Many with `bids` (as `auction_id`)

---

#### 5. **bids**
**Primary Key:** `id`  
**Description:** Bids placed on auctions

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `auction_id` (INTEGER, FK → auctions.id, NOT NULL)
- `bidder_id` (INTEGER, FK → users.id, NOT NULL)
- `amount` (REAL, NOT NULL)
- `expires_at` (DATETIME) - Bid expiration time (optional)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `is_active` (INTEGER, DEFAULT 1) - 0 = cancelled/inactive, 1 = active

**Relationships:**
- Many-to-One with `auctions` (as `auction_id`)
- Many-to-One with `users` (as `bidder_id`)

**Business Rules:**
- Only one active bid per user per auction (enforced by application logic)
- When a new bid is placed, previous active bids from the same user for that auction are deactivated
- When an auction ends, only bids for that specific auction are deactivated

---

#### 6. **activity**
**Primary Key:** `id`  
**Description:** Activity log for artworks (bids, purchases, sales, offers)

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `artwork_id` (INTEGER, FK → artworks.id)
- `user_id` (INTEGER, FK → users.id, NOT NULL)
- `activity_type` (TEXT, NOT NULL) - Values: 'bid', 'purchased', 'sold', 'offer', etc.
- `price` (REAL)
- `from_user_id` (INTEGER, FK → users.id)
- `to_user_id` (INTEGER, FK → users.id)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `artworks` (as `artwork_id`)
- Many-to-One with `users` (as `user_id`, `from_user_id`, `to_user_id`)

---

#### 7. **favorites**
**Primary Key:** `id`  
**Description:** User favorites/bookmarks (Many-to-Many junction table)

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `user_id` (INTEGER, FK → users.id, NOT NULL)
- `artwork_id` (INTEGER, FK → artworks.id, NOT NULL)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- UNIQUE(`user_id`, `artwork_id`)

**Relationships:**
- Many-to-One with `users` (as `user_id`)
- Many-to-One with `artworks` (as `artwork_id`)

---

#### 8. **watchlist**
**Primary Key:** `id`  
**Description:** User watchlist for artworks (Many-to-Many junction table)

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `user_id` (INTEGER, FK → users.id, NOT NULL)
- `artwork_id` (INTEGER, FK → artworks.id, NOT NULL)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- UNIQUE(`user_id`, `artwork_id`)

**Relationships:**
- Many-to-One with `users` (as `user_id`)
- Many-to-One with `artworks` (as `artwork_id`)

---

#### 9. **notifications**
**Primary Key:** `id`  
**Description:** User notifications

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `user_id` (INTEGER, FK → users.id, NOT NULL)
- `title` (TEXT, NOT NULL)
- `message` (TEXT, NOT NULL)
- `artwork_id` (INTEGER, FK → artworks.id)
- `is_read` (INTEGER, DEFAULT 0)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `users` (as `user_id`)
- Many-to-One with `artworks` (as `artwork_id`)

---

#### 10. **balances** (3NF Compliant)
**Primary Key:** `id`  
**Description:** User account balances

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `user_id` (INTEGER, FK → users.id, UNIQUE, NOT NULL)
- `available_balance` (REAL, DEFAULT 0)
- `pending_balance` (REAL, DEFAULT 0)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**3NF Compliance Note:**  
`total_earned` and `total_spent` are **NOT stored**. They are computed dynamically from the `transactions` table:

```sql
-- total_earned
SELECT COALESCE(SUM(amount), 0) FROM transactions 
WHERE user_id = ? AND type = 'sale' AND status = 'completed'

-- total_spent
SELECT COALESCE(SUM(amount), 0) FROM transactions 
WHERE user_id = ? AND type = 'purchase' AND status = 'completed'
```

**Relationships:**
- One-to-One with `users` (as `user_id`)

---

#### 11. **transactions**
**Primary Key:** `id`  
**Description:** Financial transactions

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `user_id` (INTEGER, FK → users.id, NOT NULL)
- `type` (TEXT, NOT NULL) - Values: 'deposit', 'withdrawal', 'purchase', 'sale', 'bid', 'bid_refund', etc.
- `amount` (REAL, NOT NULL)
- `status` (TEXT, NOT NULL) - Values: 'completed', 'pending', 'failed', 'cancelled'
- `description` (TEXT)
- `artwork_id` (INTEGER, FK → artworks.id)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `users` (as `user_id`)
- Many-to-One with `artworks` (as `artwork_id`)

---

#### 12. **price_history**
**Primary Key:** `id`  
**Description:** Historical price records for artworks

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `artwork_id` (INTEGER, FK → artworks.id, NOT NULL)
- `from_user_id` (INTEGER, FK → users.id)
- `amount` (REAL, NOT NULL)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `artworks` (as `artwork_id`)
- Many-to-One with `users` (as `from_user_id`)

---

#### 13. **artwork_bundles**
**Primary Key:** `id`  
**Description:** Collections/bundles of artworks

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `owner_id` (INTEGER, FK → users.id, NOT NULL)
- `title` (TEXT, NOT NULL)
- `description` (TEXT)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `users` (as `owner_id`)
- One-to-Many with `bundle_items` (as `bundle_id`)

---

#### 14. **bundle_items**
**Primary Key:** `id`  
**Description:** Junction table for artwork bundles (Many-to-Many)

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `bundle_id` (INTEGER, FK → artwork_bundles.id, NOT NULL)
- `artwork_id` (INTEGER, FK → artworks.id, NOT NULL)
- UNIQUE(`bundle_id`, `artwork_id`)

**Relationships:**
- Many-to-One with `artwork_bundles` (as `bundle_id`)
- Many-to-One with `artworks` (as `artwork_id`)

---

#### 15. **user_2fa**
**Primary Key:** `user_id`  
**Description:** Two-factor authentication settings

**Attributes:**
- `user_id` (INTEGER, PK, FK → users.id)
- `secret` (TEXT, NOT NULL)
- `enabled` (INTEGER, DEFAULT 0)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- One-to-One with `users` (as `user_id`)

---

#### 16. **backup_codes**
**Primary Key:** `id`  
**Description:** 2FA backup codes

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `user_id` (INTEGER, FK → users.id, NOT NULL)
- `code` (TEXT, NOT NULL)
- `used` (INTEGER, DEFAULT 0)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `users` (as `user_id`)

---

#### 17. **artwork_views**
**Primary Key:** `id`  
**Description:** View tracking for unique views per user per day

**Attributes:**
- `id` (INTEGER, PK, AUTOINCREMENT)
- `artwork_id` (INTEGER, FK → artworks.id, NOT NULL)
- `user_id` (INTEGER, FK → users.id) - NULL for anonymous users
- `ip_address` (TEXT) - For anonymous tracking
- `viewed_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

**Relationships:**
- Many-to-One with `artworks` (as `artwork_id`)
- Many-to-One with `users` (as `user_id`)

---

## Relationship Summary

### One-to-Many Relationships:
1. **users** → **artworks** (artist_id, owner_id)
2. **users** → **auctions** (seller_id, winner_id)
3. **users** → **bids** (bidder_id)
4. **users** → **activity** (user_id, from_user_id, to_user_id)
5. **users** → **favorites** (user_id)
6. **users** → **watchlist** (user_id)
7. **users** → **notifications** (user_id)
8. **users** → **transactions** (user_id)
9. **users** → **backup_codes** (user_id)
10. **users** → **artwork_bundles** (owner_id)
11. **artworks** → **activity** (artwork_id)
12. **artworks** → **price_history** (artwork_id)
13. **artworks** → **favorites** (artwork_id)
14. **artworks** → **watchlist** (artwork_id)
15. **artworks** → **notifications** (artwork_id)
16. **artworks** → **transactions** (artwork_id)
17. **artworks** → **artwork_views** (artwork_id)
18. **auctions** → **bids** (auction_id)
19. **artwork_bundles** → **bundle_items** (bundle_id)

### One-to-One Relationships:
1. **users** ↔ **balances** (user_id, UNIQUE)
2. **users** ↔ **user_2fa** (user_id, PRIMARY KEY)
3. **artworks** ↔ **auctions** (artwork_id, UNIQUE)

### Many-to-Many Relationships:
1. **users** ↔ **artworks** (via `favorites`)
2. **users** ↔ **artworks** (via `watchlist`)
3. **artwork_bundles** ↔ **artworks** (via `bundle_items`)

---

## Entity Relationship Diagram (Visual)

### Core Marketplace Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                            users                                 │
├─────────────────────────────────────────────────────────────────┤
│ id (PK) ◄───────────────────────────────────────────────────┐   │
│ username (UNIQUE)                                            │   │
│ email (UNIQUE)                                               │   │
│ password_hash                                                │   │
│ role CHECK('buyer','seller')                                 │   │
│ display_name, bio, avatar_url, banner_url                    │   │
│ social_handles (twitter, instagram, website)                 │   │
│ notification_preferences (7 types)                           │   │
│ password_reset_token, password_reset_expires                 │   │
│ created_at, updated_at                                       │   │
└─────────────────────────────────────────────────────────────────┘
      │
      ├──────────────┬──────────────┬──────────────┬──────────────┤
      │              │              │              │              │
      ▼              ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  artworks   │ │  auctions   │ │    bids     │ │  balances   │ │transactions │
├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│ id (PK)     │ │ id (PK)     │ │ id (PK)     │ │ id (PK)     │ │ id (PK)     │
│ artist_id   │ │ artwork_id  │ │ auction_id  │ │ user_id     │ │ user_id     │
│ owner_id    │ │ seller_id   │ │ bidder_id   │ │ available_  │ │ type        │
│ title       │ │ start_price │ │ amount      │ │   balance   │ │ amount      │
│ description │ │ reserve_    │ │ expires_at  │ │ pending_    │ │ status      │
│ category    │ │   price     │ │ created_at  │ │   balance   │ │ description │
│ image_url   │ │ end_time    │ │ is_active   │ │ updated_at  │ │ artwork_id  │
│ price       │ │ status      │ └─────────────┘ └─────────────┘ │ created_at  │
│ is_listed   │ │ winner_id   │                                  └─────────────┘
│ views       │ │ created_at  │
│ created_at  │ └─────────────┘
│ updated_at  │
└─────────────┘
      │
      ├──────────────┬──────────────┬──────────────┬──────────────┐
      │              │              │              │              │
      ▼              ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  favorites  │ │  watchlist  │ │  activity   │ │price_history│ │notifications│
├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│ id (PK)     │ │ id (PK)     │ │ id (PK)     │ │ id (PK)     │ │ id (PK)     │
│ user_id     │ │ user_id     │ │ artwork_id  │ │ artwork_id  │ │ user_id     │
│ artwork_id  │ │ artwork_id  │ │ user_id     │ │ from_user_id│ │ title       │
│ created_at  │ │ created_at  │ │ activity_   │ │ amount      │ │ message     │
│ UNIQUE      │ │ UNIQUE      │ │   type      │ │ created_at  │ │ artwork_id  │
│ (user,art)  │ │ (user,art)  │ │ price       │ └─────────────┘ │ is_read     │
└─────────────┘ └─────────────┘ │ from_user_id│                  │ created_at  │
                                │ to_user_id  │                  └─────────────┘
                                │ created_at  │
                                └─────────────┘
```

### Categories Table (Normalized)

```
┌─────────────┐
│ categories  │
├─────────────┤
│ id (PK)     │
│ name (UNQ)  │◄─────── Referenced by artworks.category
│ description │
│ display_    │
│   order     │
│ created_at  │
└─────────────┘
```

### Security & Authentication Entities

```
┌─────────────┐
│   users     │
├─────────────┤
│ id (PK)     │
└─────────────┘
      │
      ├──────────────┬──────────────┐
      │              │              │
      ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  user_2fa   │ │backup_codes │ │artwork_views│
├─────────────┤ ├─────────────┤ ├─────────────┤
│ user_id(PK) │ │ id (PK)     │ │ id (PK)     │
│ secret      │ │ user_id     │ │ artwork_id  │
│ enabled     │ │ code        │ │ user_id     │
│ created_at  │ │ used        │ │ ip_address  │
└─────────────┘ │ created_at  │ │ viewed_at   │
                └─────────────┘ └─────────────┘
```

### Artwork Bundles (Collections)

```
┌─────────────┐
│   users     │
├─────────────┤
│ id (PK)     │
└─────────────┘
      │
      │ (owner_id)
      ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│artwork_     │◄─────│bundle_items │─────►│  artworks   │
│bundles      │      ├─────────────┤      ├─────────────┤
├─────────────┤      │ id (PK)     │      │ id (PK)     │
│ id (PK)     │      │ bundle_id   │      │ (all fields)│
│ owner_id    │      │ artwork_id  │      └─────────────┘
│ title       │      │ UNIQUE      │
│ description │      │ (bundle,art)│
│ created_at  │      └─────────────┘
│ updated_at  │
└─────────────┘
```

---

## Third Normal Form (3NF) Compliance

### ✅ Full 3NF Compliance Achieved

The database schema is fully compliant with Third Normal Form (3NF). All derived values are computed dynamically:

**Auctions Table (3NF Compliant):**
- `current_bid` - Computed from `bids` table: `MAX(amount) WHERE is_active = 1`
- `highest_bidder_id` - Computed from `bids` table: `bidder_id ORDER BY amount DESC LIMIT 1`

**Balances Table (3NF Compliant):**
- `total_earned` - Computed from `transactions` table: `SUM(amount) WHERE type = 'sale'`
- `total_spent` - Computed from `transactions` table: `SUM(amount) WHERE type = 'purchase'`

**Artworks Table (3NF Compliant):**
- `favorites_count` - Computed from `favorites` table: `COUNT(*) WHERE artwork_id = ?`

**Design Benefits:**
- No transitive dependencies
- No partial dependencies
- All non-key attributes depend only on the primary key
- Data consistency guaranteed (no sync issues)
- Single source of truth for all derived values

---

## Database Views (For Convenience)

The schema includes optional views for common computed values:

```sql
-- v_auctions_with_bids: Auctions with computed current_bid, highest_bidder_id
-- v_balances_with_totals: Balances with computed total_earned, total_spent
-- v_artworks_with_stats: Artworks with computed favorites_count, watchlist_count
```

---

## Indexes

The following indexes are created for performance:

### Core Indexes:
1. `idx_artworks_category` - Category filtering
2. `idx_artworks_owner` - Owner lookups
3. `idx_artworks_artist` - Artist lookups
4. `idx_artworks_listed` - Listed status filtering

### Auction Indexes:
5. `idx_auctions_status` - Status filtering
6. `idx_auctions_end_time` - Expiration queries
7. `idx_auctions_status_end` - **Composite** for finding ended auctions
8. `idx_auctions_seller` - Seller lookups

### Bid Indexes:
9. `idx_bids_auction` - Bid lookups by auction
10. `idx_bids_bidder` - Bidder lookups
11. `idx_bids_active` - **Composite** for active bids

### Activity & Recommendations:
12. `idx_activity_user` - User activity queries
13. `idx_activity_artwork` - Artwork activity
14. `idx_activity_type_user` - **Composite** for collaborative filtering

### User Interaction Indexes:
15. `idx_favorites_user` / `idx_favorites_artwork`
16. `idx_watchlist_user` / `idx_watchlist_artwork`
17. `idx_artwork_views_*` - View tracking

### Transaction Indexes:
18. `idx_transactions_user` - User transactions
19. `idx_transactions_type` - **Composite** for computing totals

### Notification Indexes:
20. `idx_notifications_user` / `idx_notifications_unread`

---

## Foreign Key Constraints

All foreign keys have proper referential integrity:

- `ON DELETE CASCADE` for dependent records:
  - `bids` (when auction deleted)
  - `favorites`, `watchlist` (when user/artwork deleted)
  - `bundle_items` (when bundle/artwork deleted)
  - `user_2fa`, `backup_codes` (when user deleted)

- `ON DELETE RESTRICT` (default) for critical relationships:
  - `artworks` → `users` (artist/owner)
  - `auctions` → `users` (seller/winner)

---

## Key Features & Business Rules

### **Bid Management**
- Single Active Bid Rule: One active bid per user per auction
- Bid Expiration: Optional `expires_at` timestamp
- Bid Deactivation: Automatic when new bid placed or auction ends
- Auction-Scoped: Only bids for ended auction are deactivated

### **Auction Lifecycle**
- Automatic Processing: Background job every 5 minutes
- Winner Determination: Highest active bid wins (if meets reserve price)
- Ownership Transfer: Automatic to winner
- Balance Management: Winner charged, seller paid, losers refunded
- Notifications: All parties notified

### **Reserve Price Logic**
- If highest bid < reserve_price: No winner, auction ends with no sale
- If highest bid >= reserve_price: Winner determined normally

### **Balance System**
- `available_balance`: Funds ready for use
- `pending_balance`: Funds locked in active bids
- `total_earned`: Computed from sales (3NF)
- `total_spent`: Computed from purchases (3NF)

### **Collaborative Filtering Recommendations**
- Algorithm: Finds users with similar bid patterns
- Recommendations: Artworks those similar users bid on
- Fallback: Recent artworks if no matches

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Entities** | 17 tables |
| **Total Relationships** | 20+ foreign key relationships |
| **Normalization Level** | ✅ Third Normal Form (3NF) |
| **Referential Integrity** | ✅ All foreign keys defined |
| **Performance Indexes** | ✅ 20+ indexes including composites |
| **Computed Values** | ✅ Views for convenience |
| **Key Features** | Bid expiration, reserve price, collaborative filtering |

---

*Last Updated: November 2024*
*Database System: SQLite*
*Normalization: Third Normal Form (3NF) ✅*

