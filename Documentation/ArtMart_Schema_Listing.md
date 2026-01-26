# ArtMart Database Schema Listing

## COMP0178 Database Fundamentals - Group 24

---

## Overview

This document provides the complete database schema for the ArtMart online auction system. The schema consists of **10 tables** with a total of **93 attributes**, translated from the ER diagram following the methodology taught in COMP0178 Week 2 lectures.

---

## Table of Contents

1. [User](#1-user)
2. [Balance](#2-balance)
3. [Artwork](#3-artwork)
4. [Auction](#4-auction)
5. [Bid](#5-bid)
6. [Transaction](#6-transaction)
7. [PriceHistory](#7-pricehistory)
8. [Activity](#8-activity)
9. [Watchlist](#9-watchlist)
10. [Favorite](#10-favorite)

---

## 1. User

### ER Translation

- **Source Entity**: User (strong entity)
- **Translation Rule**: Strong entities create one table with all simple attributes (Lecture Week 2, Slide 39)

### Schema

```sql
CREATE TABLE User (
    -- Primary Key
    userId              INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Authentication (Candidate Keys)
    username            VARCHAR(50)     NOT NULL UNIQUE,
    email               VARCHAR(255)    NOT NULL UNIQUE,
    passwordHash        VARCHAR(255)    NOT NULL,
    
    -- Role
    role                ENUM('buyer', 'seller') NOT NULL,
    
    -- Profile Information
    displayName         VARCHAR(100)    NULL,
    bio                 TEXT            NULL,
    avatarUrl           VARCHAR(500)    NULL,
    bannerUrl           VARCHAR(500)    NULL,
    
    -- Social Links
    twitterUrl          VARCHAR(500)    NULL,
    instagramUrl        VARCHAR(500)    NULL,
    websiteUrl          VARCHAR(500)    NULL,
    
    -- Notification Preferences
    notifyBid           BOOLEAN         NOT NULL DEFAULT TRUE,
    notifySale          BOOLEAN         NOT NULL DEFAULT TRUE,
    notifyLike          BOOLEAN         NOT NULL DEFAULT TRUE,
    notifyWatchlistOutbid   BOOLEAN     NOT NULL DEFAULT TRUE,
    notifyWatchlistEnding   BOOLEAN     NOT NULL DEFAULT TRUE,
    notifyAuctionWon    BOOLEAN         NOT NULL DEFAULT TRUE,
    emailEnabled        BOOLEAN         NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| userId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| username | VARCHAR(50) | NOT NULL, UNIQUE | Candidate Key |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Candidate Key |
| passwordHash | VARCHAR(255) | NOT NULL | Simple attribute |
| role | ENUM | NOT NULL | Simple attribute |
| displayName | VARCHAR(100) | NULL | Simple attribute |
| bio | TEXT | NULL | Simple attribute |
| avatarUrl | VARCHAR(500) | NULL | Simple attribute |
| bannerUrl | VARCHAR(500) | NULL | Simple attribute |
| twitterUrl | VARCHAR(500) | NULL | Simple attribute (social links) |
| instagramUrl | VARCHAR(500) | NULL | Simple attribute (social links) |
| websiteUrl | VARCHAR(500) | NULL | Simple attribute (social links) |
| notifyBid | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| notifySale | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| notifyLike | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| notifyWatchlistOutbid | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| notifyWatchlistEnding | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| notifyAuctionWon | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| emailEnabled | BOOLEAN | NOT NULL, DEFAULT TRUE | Simple attribute |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |
| updatedAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 21 attributes**

---

## 2. Balance

### ER Translation

- **Source Entity**: Balance (weak entity, dependent on User)
- **Relationship**: User — Balance (1:1 mandatory on both sides)
- **Translation Rule**: For 1:1 mandatory relationships, userId serves as both PK and FK (Lecture Week 2, Slide 42-43)

### Schema

```sql
CREATE TABLE Balance (
    -- Primary Key (also Foreign Key to User)
    userId              INTEGER         PRIMARY KEY,
    
    -- Balance Details
    availableBalance    DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    pendingBalance      DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
    
    -- Timestamps
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraint
    CONSTRAINT fk_balance_user
        FOREIGN KEY (userId) REFERENCES User(userId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT chk_available_balance_non_negative
        CHECK (availableBalance >= 0),
    CONSTRAINT chk_pending_balance_non_negative
        CHECK (pendingBalance >= 0)
);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| userId | INTEGER | PK, FK→User | 1:1 relationship (User has Balance) |
| availableBalance | DECIMAL(12,2) | NOT NULL, DEFAULT 0.00, CHECK >= 0 | Simple attribute |
| pendingBalance | DECIMAL(12,2) | NOT NULL, DEFAULT 0.00, CHECK >= 0 | Simple attribute |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |
| updatedAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 5 attributes**

### Derived Value

| Derived | Calculation |
|---------|-------------|
| totalBalance | availableBalance + pendingBalance |

---

## 3. Artwork

### ER Translation

- **Source Entity**: Artwork (strong entity)
- **Relationships**: 
  - User —(creates)→ Artwork (1:*) → artistId FK
  - User —(owns)→ Artwork (1:*) → ownerId FK
- **Translation Rule**: For 1:* relationships, add "1"'s PK to "many" as FK (Lecture Week 2, Slide 40)

### Schema

```sql
CREATE TABLE Artwork (
    -- Primary Key
    artworkId           INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Foreign Keys (Two relationships to User with role names)
    artistId            INTEGER         NOT NULL,   -- Creator (immutable)
    ownerId             INTEGER         NOT NULL,   -- Current owner (transfers on sale)
    
    -- Artwork Details
    title               VARCHAR(200)    NOT NULL,
    description         TEXT            NULL,
    imageUrl            VARCHAR(500)    NOT NULL,
    
    -- Category (ENUM attribute, not separate entity)
    category            ENUM('Abstract', 'Digital', 'Photography', '3DArt', 'PixelArt', 'Illustration') NOT NULL,
    
    -- Listing Information
    listingType         ENUM('display', 'fixedPrice', 'auction', 'unlisted') NOT NULL DEFAULT 'display',
    price               DECIMAL(12,2)   NULL,
    listingExpiry       DATETIME        NULL,
    
    -- Statistics
    views               INTEGER         NOT NULL DEFAULT 0,
    
    -- Timestamps
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_artwork_artist
        FOREIGN KEY (artistId) REFERENCES User(userId)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_artwork_owner
        FOREIGN KEY (ownerId) REFERENCES User(userId)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT chk_price_positive
        CHECK (price IS NULL OR price >= 0),
    CONSTRAINT chk_views_non_negative
        CHECK (views >= 0),
    CONSTRAINT chk_price_required_for_fixed
        CHECK (listingType != 'fixedPrice' OR price IS NOT NULL)
);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| artworkId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| artistId | INTEGER | FK→User, NOT NULL | 1:* relationship (User creates Artwork) - Role: Artist |
| ownerId | INTEGER | FK→User, NOT NULL | 1:* relationship (User owns Artwork) - Role: Owner |
| title | VARCHAR(200) | NOT NULL | Simple attribute |
| description | TEXT | NULL | Simple attribute |
| imageUrl | VARCHAR(500) | NOT NULL | Simple attribute |
| category | ENUM | NOT NULL | Simple attribute (not separate entity) |
| listingType | ENUM | NOT NULL, DEFAULT 'display' | Simple attribute |
| price | DECIMAL(12,2) | NULL | Simple attribute |
| listingExpiry | DATETIME | NULL | Simple attribute |
| views | INTEGER | NOT NULL, DEFAULT 0 | Simple attribute |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |
| updatedAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 13 attributes**

---

## 4. Auction

### ER Translation

- **Source Entity**: Auction (strong entity)
- **Relationship**: Artwork —(has)→ Auction (1:0..1)
- **Translation Rule**: For 1:1 optional relationship, add FK with UNIQUE constraint (Lecture Week 2, Slide 43-44)

### Schema

```sql
CREATE TABLE Auction (
    -- Primary Key
    auctionId           INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Foreign Key (UNIQUE enforces one active auction per artwork)
    artworkId           INTEGER         NOT NULL UNIQUE,
    
    -- Pricing
    startPrice          DECIMAL(12,2)   NOT NULL,
    reservePrice        DECIMAL(12,2)   NULL,
    
    -- Timing
    startTime           DATETIME        NOT NULL,
    endTime             DATETIME        NOT NULL,
    
    -- Status
    status              ENUM('active', 'ended', 'sold', 'unsold', 'cancelled') NOT NULL DEFAULT 'active',
    
    -- Timestamps
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraint
    CONSTRAINT fk_auction_artwork
        FOREIGN KEY (artworkId) REFERENCES Artwork(artworkId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT chk_start_price_positive
        CHECK (startPrice >= 0.01),
    CONSTRAINT chk_reserve_gte_start
        CHECK (reservePrice IS NULL OR reservePrice >= startPrice),
    CONSTRAINT chk_end_after_start
        CHECK (endTime > startTime)
);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| auctionId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| artworkId | INTEGER | FK→Artwork, NOT NULL, UNIQUE | 1:0..1 relationship (Artwork has Auction) |
| startPrice | DECIMAL(12,2) | NOT NULL, CHECK >= 0.01 | Simple attribute |
| reservePrice | DECIMAL(12,2) | NULL | Simple attribute (optional) |
| startTime | DATETIME | NOT NULL | Simple attribute |
| endTime | DATETIME | NOT NULL | Simple attribute |
| status | ENUM | NOT NULL, DEFAULT 'active' | Simple attribute |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |
| updatedAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 9 attributes**

### Derived Values

| Derived | Calculation |
|---------|-------------|
| seller | Artwork.ownerId via artworkId |
| winner | Highest active bid from Bid table |
| currentBid | MAX(bidAmount) from Bid table WHERE status = 'active' |
| duration | endTime - startTime |

---

## 5. Bid

### ER Translation

- **Source Entity**: Bid (strong entity)
- **Relationships**:
  - Auction —(has)→ Bid (1:*)
  - User —(places)→ Bid (1:*)
- **Translation Rule**: For 1:* relationships, add "1"'s PK to "many" as FK (Lecture Week 2, Slide 40)

### Schema

```sql
CREATE TABLE Bid (
    -- Primary Key
    bidId               INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Foreign Keys
    auctionId           INTEGER         NOT NULL,
    userId              INTEGER         NOT NULL,   -- Bidder
    
    -- Bid Details
    bidAmount           DECIMAL(12,2)   NOT NULL,
    status              ENUM('active', 'outbid', 'won', 'refunded', 'expired', 'replaced') NOT NULL DEFAULT 'active',
    
    -- Optional Expiry
    expiresAt           DATETIME        NULL,
    
    -- Timestamps
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_bid_auction
        FOREIGN KEY (auctionId) REFERENCES Auction(auctionId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_bid_user
        FOREIGN KEY (userId) REFERENCES User(userId)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT chk_bid_amount_positive
        CHECK (bidAmount >= 0.01)
);

-- Index for common queries
CREATE INDEX idx_bid_auction_status ON Bid(auctionId, status);
CREATE INDEX idx_bid_user ON Bid(userId);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| bidId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| auctionId | INTEGER | FK→Auction, NOT NULL | 1:* relationship (Auction has Bid) |
| userId | INTEGER | FK→User, NOT NULL | 1:* relationship (User places Bid) - Role: Bidder |
| bidAmount | DECIMAL(12,2) | NOT NULL, CHECK >= 0.01 | Simple attribute |
| status | ENUM | NOT NULL, DEFAULT 'active' | Simple attribute |
| expiresAt | DATETIME | NULL | Simple attribute (optional) |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |
| updatedAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 8 attributes**

---

## 6. Transaction

### ER Translation

- **Source Entity**: Transaction (strong entity)
- **Relationships**:
  - User —(has)→ Transaction (1:*)
  - Artwork —(involved in)→ Transaction (1:*) - optional
  - Auction —(involved in)→ Transaction (1:*) - optional
  - Bid —(involved in)→ Transaction (1:*) - optional
- **Translation Rule**: For 1:* relationships with optional participation, FK is NULLABLE (Lecture Week 2, Slide 40)

### Schema

```sql
CREATE TABLE Transaction (
    -- Primary Key
    transactionId       INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- User (mandatory)
    userId              INTEGER         NOT NULL,
    
    -- Transaction Details
    type                ENUM('deposit', 'withdrawal', 'purchase', 'sale', 'bid', 'bid_refund', 'auction_won', 'auction_sale') NOT NULL,
    amount              DECIMAL(12,2)   NOT NULL,
    platformFee         DECIMAL(12,2)   NULL,       -- For sale/auction_sale only
    netAmount           DECIMAL(12,2)   NULL,       -- For sale/auction_sale only
    status              ENUM('completed', 'pending', 'cancelled') NOT NULL DEFAULT 'completed',
    
    -- Related Entities (optional, depends on transaction type)
    artworkId           INTEGER         NULL,
    auctionId           INTEGER         NULL,
    bidId               INTEGER         NULL,
    
    -- Timestamps
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_transaction_user
        FOREIGN KEY (userId) REFERENCES User(userId)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_transaction_artwork
        FOREIGN KEY (artworkId) REFERENCES Artwork(artworkId)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_transaction_auction
        FOREIGN KEY (auctionId) REFERENCES Auction(auctionId)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    CONSTRAINT fk_transaction_bid
        FOREIGN KEY (bidId) REFERENCES Bid(bidId)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT chk_amount_positive
        CHECK (amount > 0),
    CONSTRAINT chk_platform_fee_non_negative
        CHECK (platformFee IS NULL OR platformFee >= 0),
    CONSTRAINT chk_net_amount_positive
        CHECK (netAmount IS NULL OR netAmount > 0)
);

-- Indexes for common queries
CREATE INDEX idx_transaction_user ON Transaction(userId);
CREATE INDEX idx_transaction_type ON Transaction(type);
CREATE INDEX idx_transaction_created ON Transaction(createdAt);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| transactionId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| userId | INTEGER | FK→User, NOT NULL | 1:* relationship (User has Transaction) |
| type | ENUM | NOT NULL | Simple attribute |
| amount | DECIMAL(12,2) | NOT NULL, CHECK > 0 | Simple attribute |
| platformFee | DECIMAL(12,2) | NULL | Simple attribute (sale types only) |
| netAmount | DECIMAL(12,2) | NULL | Simple attribute (sale types only) |
| status | ENUM | NOT NULL, DEFAULT 'completed' | Simple attribute |
| artworkId | INTEGER | FK→Artwork, NULL | 1:* relationship (optional) |
| auctionId | INTEGER | FK→Auction, NULL | 1:* relationship (optional) |
| bidId | INTEGER | FK→Bid, NULL | 1:* relationship (optional) |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |
| updatedAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 12 attributes**

---

## 7. PriceHistory

### ER Translation

- **Source Entity**: PriceHistory (strong entity)
- **Relationships**:
  - Artwork —(has)→ PriceHistory (1:*)
  - User —(sells in)→ PriceHistory (1:*) - Role: Seller
  - User —(buys in)→ PriceHistory (1:*) - Role: Buyer
  - Auction —(recorded in)→ PriceHistory (1:0..1) - optional

### Schema

```sql
CREATE TABLE PriceHistory (
    -- Primary Key
    priceHistoryId      INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Artwork (mandatory)
    artworkId           INTEGER         NOT NULL,
    
    -- Sale Participants (two relationships to User)
    sellerId            INTEGER         NOT NULL,
    buyerId             INTEGER         NOT NULL,
    
    -- Sale Details
    salePrice           DECIMAL(12,2)   NOT NULL,
    saleType            ENUM('fixedPrice', 'auction') NOT NULL,
    
    -- Related Auction (optional, NULL for fixed-price sales)
    auctionId           INTEGER         NULL,
    
    -- Timestamp (single, immutable record)
    soldAt              DATETIME        NOT NULL,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_pricehistory_artwork
        FOREIGN KEY (artworkId) REFERENCES Artwork(artworkId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_pricehistory_seller
        FOREIGN KEY (sellerId) REFERENCES User(userId)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_pricehistory_buyer
        FOREIGN KEY (buyerId) REFERENCES User(userId)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_pricehistory_auction
        FOREIGN KEY (auctionId) REFERENCES Auction(auctionId)
        ON DELETE SET NULL
        ON UPDATE CASCADE,
    
    -- Check Constraints
    CONSTRAINT chk_sale_price_positive
        CHECK (salePrice > 0),
    CONSTRAINT chk_seller_not_buyer
        CHECK (sellerId != buyerId),
    CONSTRAINT chk_auction_required_for_auction_type
        CHECK (saleType != 'auction' OR auctionId IS NOT NULL)
);

-- Index for artwork price history lookup
CREATE INDEX idx_pricehistory_artwork ON PriceHistory(artworkId, soldAt);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| priceHistoryId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| artworkId | INTEGER | FK→Artwork, NOT NULL | 1:* relationship (Artwork has PriceHistory) |
| sellerId | INTEGER | FK→User, NOT NULL | 1:* relationship (User sells) - Role: Seller |
| buyerId | INTEGER | FK→User, NOT NULL | 1:* relationship (User buys) - Role: Buyer |
| salePrice | DECIMAL(12,2) | NOT NULL, CHECK > 0 | Simple attribute |
| saleType | ENUM | NOT NULL | Simple attribute |
| auctionId | INTEGER | FK→Auction, NULL | 1:0..1 relationship (optional) |
| soldAt | DATETIME | NOT NULL | Timestamp (single, immutable) |

**Total: 8 attributes**

---

## 8. Activity

### ER Translation

- **Source Entity**: Activity (strong entity)
- **Relationships**:
  - User —(receives)→ Activity (1:*) - Role: Recipient
  - User —(triggers)→ Activity (1:*) - Role: Trigger (optional)
  - Artwork —(involved in)→ Activity (1:*) - optional
  - Auction —(involved in)→ Activity (1:*) - optional
  - Bid —(involved in)→ Activity (1:*) - optional

### Schema

```sql
CREATE TABLE Activity (
    -- Primary Key
    activityId          INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Recipient (mandatory)
    userId              INTEGER         NOT NULL,
    
    -- Activity Details
    type                ENUM(
                            'bid_placed', 'outbid', 'bid_refunded',
                            'sale', 'purchase', 'like',
                            'auction_won', 'auction_sold', 'auction_cancelled', 'auction_unsold',
                            'watchlist_outbid', 'watchlist_ending', 'watchlist_listed',
                            'watchlist_auction_started', 'watchlist_price_changed', 'watchlist_sold'
                        ) NOT NULL,
    isRead              BOOLEAN         NOT NULL DEFAULT FALSE,
    
    -- Related Entities (optional)
    artworkId           INTEGER         NULL,
    auctionId           INTEGER         NULL,
    bidId               INTEGER         NULL,
    triggeredByUserId   INTEGER         NULL,   -- Who caused this activity
    
    -- Timestamp (single, no updatedAt needed)
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_activity_user
        FOREIGN KEY (userId) REFERENCES User(userId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_activity_artwork
        FOREIGN KEY (artworkId) REFERENCES Artwork(artworkId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_activity_auction
        FOREIGN KEY (auctionId) REFERENCES Auction(auctionId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_activity_bid
        FOREIGN KEY (bidId) REFERENCES Bid(bidId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_activity_triggered_by
        FOREIGN KEY (triggeredByUserId) REFERENCES User(userId)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_activity_user_read ON Activity(userId, isRead);
CREATE INDEX idx_activity_user_created ON Activity(userId, createdAt);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| activityId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| userId | INTEGER | FK→User, NOT NULL | 1:* relationship (User receives Activity) - Role: Recipient |
| type | ENUM | NOT NULL | Simple attribute |
| isRead | BOOLEAN | NOT NULL, DEFAULT FALSE | Simple attribute |
| artworkId | INTEGER | FK→Artwork, NULL | 1:* relationship (optional) |
| auctionId | INTEGER | FK→Auction, NULL | 1:* relationship (optional) |
| bidId | INTEGER | FK→Bid, NULL | 1:* relationship (optional) |
| triggeredByUserId | INTEGER | FK→User, NULL | 1:* relationship (User triggers Activity) - Role: Trigger |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 9 attributes**

---

## 9. Watchlist

### ER Translation

- **Source Entity**: Watchlist (associative entity for User watching Artwork)
- **Relationships**:
  - User —(has)→ Watchlist (1:*)
  - Artwork —(watched in)→ Watchlist (1:*)
- **Additional Attribute**: position (for drag-and-drop ordering)
- **Translation Rule**: Uses separate PK (watchlistId) due to additional ordering attribute

### Schema

```sql
CREATE TABLE Watchlist (
    -- Primary Key
    watchlistId         INTEGER         PRIMARY KEY AUTO_INCREMENT,
    
    -- Foreign Keys
    userId              INTEGER         NOT NULL,
    artworkId           INTEGER         NOT NULL,
    
    -- Ordering
    position            INTEGER         NOT NULL,
    
    -- Timestamp
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_watchlist_user
        FOREIGN KEY (userId) REFERENCES User(userId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_watchlist_artwork
        FOREIGN KEY (artworkId) REFERENCES Artwork(artworkId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    
    -- Unique Constraint (user can only watch an artwork once)
    CONSTRAINT uq_user_artwork
        UNIQUE (userId, artworkId),
    
    -- Check Constraint
    CONSTRAINT chk_position_positive
        CHECK (position >= 0)
);

-- Index for user's watchlist ordered by position
CREATE INDEX idx_watchlist_user_position ON Watchlist(userId, position);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| watchlistId | INTEGER | PK, AUTO_INCREMENT | Primary Key |
| userId | INTEGER | FK→User, NOT NULL | 1:* relationship (User has Watchlist) |
| artworkId | INTEGER | FK→Artwork, NOT NULL | 1:* relationship (Artwork watched in Watchlist) |
| position | INTEGER | NOT NULL, CHECK >= 0 | Relationship attribute (for ordering) |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 5 attributes**

---

## 10. Favorite

### ER Translation

- **Source Entity**: Favorite (junction table for User ↔ Artwork many-to-many)
- **Relationship**: User —(favorites)→ Artwork (*:*)
- **Translation Rule**: For *:* relationships, create dedicated relationship table with PKs from both entities (Lecture Week 2, Slide 46)

### Schema

```sql
CREATE TABLE Favorite (
    -- Composite Primary Key
    userId              INTEGER         NOT NULL,
    artworkId           INTEGER         NOT NULL,
    
    -- Timestamp
    createdAt           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Primary Key
    PRIMARY KEY (userId, artworkId),
    
    -- Foreign Key Constraints
    CONSTRAINT fk_favorite_user
        FOREIGN KEY (userId) REFERENCES User(userId)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_favorite_artwork
        FOREIGN KEY (artworkId) REFERENCES Artwork(artworkId)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- Index for counting likes per artwork
CREATE INDEX idx_favorite_artwork ON Favorite(artworkId);
```

### Attribute Summary

| Attribute | Type | Constraints | ER Mapping |
|-----------|------|-------------|------------|
| userId | INTEGER | PPK, FK→User, NOT NULL | Part of composite PK, *:* relationship |
| artworkId | INTEGER | PPK, FK→Artwork, NOT NULL | Part of composite PK, *:* relationship |
| createdAt | DATETIME | NOT NULL, DEFAULT | Timestamp |

**Total: 3 attributes**

---

## Schema Summary

### Table Statistics

| Table | Attributes | Primary Key | Foreign Keys | Indexes |
|-------|------------|-------------|--------------|---------|
| User | 21 | userId | 0 | 2 (username, email) |
| Balance | 5 | userId | 1 | 0 |
| Artwork | 13 | artworkId | 2 | 0 |
| Auction | 9 | auctionId | 1 | 0 |
| Bid | 8 | bidId | 2 | 2 |
| Transaction | 12 | transactionId | 4 | 3 |
| PriceHistory | 8 | priceHistoryId | 4 | 1 |
| Activity | 9 | activityId | 5 | 2 |
| Watchlist | 5 | watchlistId | 2 | 1 |
| Favorite | 3 | (userId, artworkId) | 2 | 1 |
| **Total** | **93** | - | **23** | **12** |

### Relationship Translation Summary

| Relationship Type | ER Rule | Implementation |
|-------------------|---------|----------------|
| 1:1 Mandatory both | Combine or PK=FK | Balance.userId is PK and FK |
| 1:1 Optional | FK with UNIQUE | Auction.artworkId UNIQUE |
| 1:* | FK in "many" side | All 1:* relationships |
| *:* | Junction table | Favorite (userId, artworkId) |
| Multiple relationships same entities | Role names | artistId, ownerId in Artwork |

### ENUM Value Reference

| Table | Attribute | Values |
|-------|-----------|--------|
| User | role | 'buyer', 'seller' |
| Artwork | category | 'Abstract', 'Digital', 'Photography', '3DArt', 'PixelArt', 'Illustration' |
| Artwork | listingType | 'display', 'fixedPrice', 'auction', 'unlisted' |
| Auction | status | 'active', 'ended', 'sold', 'unsold', 'cancelled' |
| Bid | status | 'active', 'outbid', 'won', 'refunded', 'expired', 'replaced' |
| Transaction | type | 'deposit', 'withdrawal', 'purchase', 'sale', 'bid', 'bid_refund', 'auction_won', 'auction_sale' |
| Transaction | status | 'completed', 'pending', 'cancelled' |
| PriceHistory | saleType | 'fixedPrice', 'auction' |
| Activity | type | (16 values - see Activity schema) |
