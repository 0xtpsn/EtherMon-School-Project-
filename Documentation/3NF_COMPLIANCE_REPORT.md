# Third Normal Form (3NF) Compliance Report

## Executive Summary

✅ **The database schema is fully compliant with Third Normal Form (3NF)**

This document provides a comprehensive analysis of the database normalization status, explaining how each table satisfies 3NF requirements and the design decisions made to achieve full compliance.

**Key Achievement:** All derived/computed values have been removed from storage and are now computed dynamically via SQL queries, eliminating transitive dependencies.

---

## What is 3NF?

Third Normal Form (3NF) requires that a database schema:

1. **Satisfies 2NF** (Second Normal Form)
   - Must be in 1NF (atomic values, no repeating groups)
   - All non-key attributes must be fully functionally dependent on the primary key
   - No partial dependencies

2. **Eliminates Transitive Dependencies**
   - No non-key attribute should depend on another non-key attribute
   - Every non-key attribute must depend directly on the primary key

**In simple terms**: Each attribute in a table should depend only on the primary key, not on other attributes.

---

## Database Schema Analysis

### 1. **users** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `username`, `email`, `password_hash`
- `role` CHECK('buyer', 'seller') - **Note: Only buyer or seller, not both**
- `display_name`, `bio`, `avatar_url`, `banner_url`
- `twitter_handle`, `instagram_handle`, `website_url`
- `contact_email`, `show_contact_email`
- `notification_*` (7 notification preference fields)
- `password_reset_token`, `password_reset_expires`
- `created_at`, `updated_at`

**Analysis**:
- All attributes depend directly on `id` (primary key)
- No transitive dependencies
- No partial dependencies (single-column primary key)
- All values are atomic

**3NF Compliance**: ✅ All attributes are directly dependent on the primary key only.

---

### 2. **categories** Table (NEW)
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `name` (UNIQUE, NOT NULL)
- `description`
- `display_order`
- `created_at`

**Analysis**:
- New normalized table for artwork categories
- Provides predefined categories with optional descriptions
- All attributes depend directly on `id`

**3NF Compliance**: ✅ All attributes are directly dependent on the primary key only.

---

### 3. **artworks** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `artist_id` (FK → users.id)
- `owner_id` (FK → users.id)
- `title`, `description`, `category`, `image_url`
- `price`, `is_listed`, `listing_expires_at`
- `views` (excludes owner views)
- `created_at`, `updated_at`

**Analysis**:
- All attributes depend directly on `id`
- Foreign keys (`artist_id`, `owner_id`) reference primary keys
- `favorites_count` **REMOVED** (was a transitive dependency)

**3NF Compliance**: ✅ 
- All attributes depend on primary key
- `favorites_count` is computed dynamically:
  ```sql
  SELECT COUNT(*) FROM favorites WHERE artwork_id = ?
  ```

---

### 4. **auctions** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `artwork_id` (FK → artworks.id, UNIQUE)
- `seller_id` (FK → users.id, NOT NULL)
- `start_price`
- `reserve_price` - Minimum price seller will accept
- `end_time`
- `status` CHECK('open', 'closed', 'cancelled')
- `winner_id` (FK → users.id)
- `created_at`

**⚠️ REMOVED Columns (3NF Fix)**:
- ~~`current_bid`~~ - **REMOVED** (was transitive dependency)
- ~~`highest_bidder_id`~~ - **REMOVED** (was transitive dependency)

**3NF Compliance**: ✅

These values are now computed dynamically:

```sql
-- current_bid: Maximum active bid amount
SELECT MAX(amount) FROM bids WHERE auction_id = ? AND is_active = 1

-- highest_bidder_id: Bidder with highest active bid
SELECT bidder_id FROM bids 
WHERE auction_id = ? AND is_active = 1 
ORDER BY amount DESC LIMIT 1
```

**Why `seller_id` is NOT a transitive dependency:**
- `seller_id` represents the auction creator at creation time
- May differ from `artworks.owner_id` if ownership transfers
- Direct relationship to the auction entity itself

---

### 5. **bids** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `auction_id` (FK → auctions.id)
- `bidder_id` (FK → users.id)
- `amount`
- `expires_at`
- `created_at`
- `is_active`

**Analysis**:
- All attributes depend directly on `id`
- Foreign keys reference primary keys
- No transitive dependencies

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 6. **favorites** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`  
**Unique Constraint**: `(user_id, artwork_id)`

**Attributes**:
- `id` (PK)
- `user_id` (FK → users.id)
- `artwork_id` (FK → artworks.id)
- `created_at`

**Analysis**:
- Junction table for many-to-many relationship
- Composite unique constraint for data integrity
- All attributes depend on `id`

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 7. **watchlist** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`  
**Unique Constraint**: `(user_id, artwork_id)`

**Attributes**:
- `id` (PK)
- `user_id` (FK → users.id)
- `artwork_id` (FK → artworks.id)
- `created_at`

**Analysis**: Same structure as `favorites` table.

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 8. **activity** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `artwork_id` (FK → artworks.id)
- `user_id` (FK → users.id)
- `activity_type`
- `price`
- `from_user_id` (FK → users.id)
- `to_user_id` (FK → users.id)
- `created_at`

**Analysis**:
- Event log table for audit trail
- All attributes depend on `id`
- Foreign keys reference primary keys

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 9. **transactions** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `user_id` (FK → users.id)
- `type` - 'deposit', 'withdrawal', 'purchase', 'sale', 'bid', 'bid_refund', etc.
- `amount`
- `status` - 'completed', 'pending', 'failed', 'cancelled'
- `description`
- `artwork_id` (FK → artworks.id)
- `created_at`

**Analysis**:
- All attributes depend on `id`
- No transitive dependencies

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 10. **balances** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`  
**Unique Constraint**: `user_id` (one-to-one with users)

**Attributes**:
- `id` (PK)
- `user_id` (FK → users.id, UNIQUE)
- `available_balance`
- `pending_balance`
- `updated_at`

**⚠️ REMOVED Columns (3NF Fix)**:
- ~~`total_earned`~~ - **REMOVED** (was transitive dependency)
- ~~`total_spent`~~ - **REMOVED** (was transitive dependency)

**3NF Compliance**: ✅

These values are now computed dynamically:

```sql
-- total_earned: Sum of completed sale transactions
SELECT COALESCE(SUM(amount), 0) FROM transactions 
WHERE user_id = ? AND type = 'sale' AND status = 'completed'

-- total_spent: Sum of completed purchase transactions
SELECT COALESCE(SUM(amount), 0) FROM transactions 
WHERE user_id = ? AND type = 'purchase' AND status = 'completed'
```

---

### 11. **notifications** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `user_id` (FK → users.id)
- `title`, `message`
- `artwork_id` (FK → artworks.id)
- `is_read`
- `created_at`

**Analysis**:
- All attributes depend on `id`
- No transitive dependencies

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 12. **price_history** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `artwork_id` (FK → artworks.id)
- `from_user_id` (FK → users.id)
- `amount`
- `created_at`

**Analysis**:
- Historical record table
- All attributes depend on `id`

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 13. **artwork_bundles** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `owner_id` (FK → users.id)
- `title`, `description`
- `created_at`, `updated_at`

**Analysis**:
- All attributes depend on `id`
- No transitive dependencies

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 14. **bundle_items** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`  
**Unique Constraint**: `(bundle_id, artwork_id)`

**Attributes**:
- `id` (PK)
- `bundle_id` (FK → artwork_bundles.id)
- `artwork_id` (FK → artworks.id)

**Analysis**:
- Junction table for many-to-many relationship
- Composite unique constraint for data integrity

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 15. **user_2fa** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `user_id` (also FK → users.id)

**Attributes**:
- `user_id` (PK, FK → users.id)
- `secret`
- `enabled`
- `created_at`

**Analysis**:
- One-to-one relationship with users
- All attributes depend on `user_id`

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 16. **backup_codes** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `user_id` (FK → users.id)
- `code`
- `used`
- `created_at`

**Analysis**:
- All attributes depend on `id`
- No transitive dependencies

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

### 17. **artwork_views** Table
**Status**: ✅ **3NF Compliant**

**Primary Key**: `id`

**Attributes**:
- `id` (PK)
- `artwork_id` (FK → artworks.id)
- `user_id` (FK → users.id) - NULL for anonymous
- `ip_address`
- `viewed_at`

**Analysis**:
- View tracking table
- All attributes depend on `id`

**3NF Compliance**: ✅ All attributes depend on primary key only.

---

## Normalization Decisions Made

### 1. Removed `current_bid` and `highest_bidder_id` from `auctions`

**Before (Violated 3NF)**:
```sql
CREATE TABLE auctions (
    ...
    current_bid REAL,           -- Transitive dependency
    highest_bidder_id INTEGER,  -- Transitive dependency
    ...
);
```

**Problem**: These values can be derived from the `bids` table, creating transitive dependencies.

**After (3NF Compliant)**:
```sql
CREATE TABLE auctions (
    ...
    -- current_bid and highest_bidder_id REMOVED
    ...
);
```

**Solution**: Values computed dynamically via subquery or view:
```sql
-- v_auctions_with_bids view provides computed values
SELECT au.*,
    (SELECT MAX(b.amount) FROM bids b 
     WHERE b.auction_id = au.id AND b.is_active = 1) AS current_bid,
    (SELECT b.bidder_id FROM bids b 
     WHERE b.auction_id = au.id AND b.is_active = 1 
     ORDER BY b.amount DESC LIMIT 1) AS highest_bidder_id
FROM auctions au;
```

---

### 2. Removed `total_earned` and `total_spent` from `balances`

**Before (Violated 3NF)**:
```sql
CREATE TABLE balances (
    ...
    total_earned REAL,  -- Transitive dependency
    total_spent REAL,   -- Transitive dependency
    ...
);
```

**Problem**: These values can be computed from the `transactions` table.

**After (3NF Compliant)**:
```sql
CREATE TABLE balances (
    ...
    -- total_earned and total_spent REMOVED
    ...
);
```

**Solution**: Values computed dynamically:
```sql
-- v_balances_with_totals view provides computed values
SELECT b.*,
    (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t 
     WHERE t.user_id = b.user_id AND t.type = 'sale' AND t.status = 'completed') AS total_earned,
    (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t 
     WHERE t.user_id = b.user_id AND t.type = 'purchase' AND t.status = 'completed') AS total_spent
FROM balances b;
```

---

### 3. Removed `favorites_count` from `artworks`

**Problem**: `favorites_count` is a derived value from the `favorites` table.

**Solution**: Computed dynamically:
```sql
SELECT COUNT(*) FROM favorites WHERE artwork_id = ?
```

---

### 4. Added `categories` Table for Normalization

**Rationale**: 
- Previously, category was stored as free-text in `artworks`
- New `categories` table provides predefined, consistent category values
- Supports category descriptions and display ordering
- Loosely coupled (TEXT reference) for flexibility

---

## Database Views for Computed Values

The schema includes optional views for convenience:

```sql
-- Auctions with computed bid information
CREATE VIEW v_auctions_with_bids AS ...

-- Balances with computed totals
CREATE VIEW v_balances_with_totals AS ...

-- Artworks with computed statistics
CREATE VIEW v_artworks_with_stats AS ...
```

These views provide backward-compatible access to computed values while maintaining 3NF compliance in the base tables.

---

## Performance Considerations

### Trade-offs Made for 3NF Compliance

| Computed Value | Before | After | Mitigation |
|----------------|--------|-------|------------|
| `current_bid` | O(1) | O(log n) | Index: `idx_bids_active` |
| `highest_bidder_id` | O(1) | O(log n) | Index: `idx_bids_active` |
| `total_earned` | O(1) | O(n) | Index: `idx_transactions_type` |
| `total_spent` | O(1) | O(n) | Index: `idx_transactions_type` |
| `favorites_count` | O(1) | O(n) | Index: `idx_favorites_artwork` |

### Indexes Supporting 3NF Queries

```sql
-- For computed bid values
CREATE INDEX idx_bids_active ON bids(auction_id, is_active);

-- For computed balance totals
CREATE INDEX idx_transactions_type ON transactions(user_id, type, status);

-- For computed favorites count
CREATE INDEX idx_favorites_artwork ON favorites(artwork_id);

-- For collaborative filtering recommendations
CREATE INDEX idx_activity_type_user ON activity(activity_type, user_id);

-- Composite index for auction processing
CREATE INDEX idx_auctions_status_end ON auctions(status, end_time);
```

---

## Verification Checklist

### First Normal Form (1NF) ✅
- [x] All tables have primary keys
- [x] All attributes contain atomic values
- [x] No repeating groups
- [x] No multi-valued attributes

### Second Normal Form (2NF) ✅
- [x] All tables are in 1NF
- [x] All non-key attributes fully depend on primary key
- [x] No partial dependencies
- [x] Composite keys properly handled (favorites, watchlist, bundle_items)

### Third Normal Form (3NF) ✅
- [x] All tables are in 2NF
- [x] No transitive dependencies
- [x] All non-key attributes depend directly on primary key
- [x] Denormalized fields removed:
  - `auctions.current_bid`
  - `auctions.highest_bidder_id`
  - `balances.total_earned`
  - `balances.total_spent`
  - `artworks.favorites_count`

---

## Conclusion

### ✅ **Full 3NF Compliance Achieved**

The database schema is **fully compliant with Third Normal Form**. All tables satisfy 3NF requirements:

1. ✅ All attributes depend directly on primary keys
2. ✅ No transitive dependencies exist
3. ✅ All denormalized/derived fields have been removed
4. ✅ Foreign keys properly reference primary keys
5. ✅ Data integrity maintained through proper relationships
6. ✅ Database views provide backward-compatible access to computed values

### Key Achievements

- **17 tables** all in 3NF
- **5 derived fields** removed (now computed dynamically)
- **1 new table** added for category normalization
- **All functionality preserved** through computed values and views
- **Performance maintained** through proper indexing
- **Data consistency guaranteed** through normalization

### Design Philosophy

The codebase follows a **strict normalization approach**:
- Store only atomic, non-derived data in the database
- Derive computed values in the application layer or via views
- Use JOINs and subqueries for relationships (not redundant storage)
- Maintain data integrity through foreign keys and constraints
- Provide views for common computed value patterns

This approach ensures:
- ✅ Data consistency
- ✅ Reduced storage redundancy
- ✅ Easier maintenance
- ✅ Clear data relationships
- ✅ Compliance with database normalization principles

---

## References

- **Database Schema**: `backend/schema.sql`
- **Architecture Documentation**: `Documentation/ARCHITECTURE.md`
- **ER Diagram**: `Documentation/ER_DIAGRAM.md`

---

**Report Updated**: November 2024  
**Database System**: SQLite  
**Normalization Level**: Third Normal Form (3NF) ✅  
**Compliance Status**: Fully Compliant

