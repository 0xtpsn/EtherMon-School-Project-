# ArtMart Database - Query Listing

## COMP0178 Database Fundamentals - Group 24

---

## Overview

This document provides a comprehensive listing of all database queries required to implement the ArtMart online auction system. Queries are organized by the capability requirements specified in the coursework brief.

---

## Table of Contents

### Core Functionality
1. [C1: User Registration (10%)](#c1-user-registration-10)
2. [C2: Auction Creation (10%)](#c2-auction-creation-10)
3. [C3: Search and Browse (15%)](#c3-search-and-browse-15)
4. [C4: Bidding System (15%)](#c4-bidding-system-15)

### Extra Functionality
5. [E1-E4: Additional Features (20%)](#e1-e4-additional-features-20)
6. [E5: Watchlist with Notifications (5%)](#e5-watchlist-with-notifications-5)
7. [E6: Collaborative Filtering (5%)](#e6-collaborative-filtering-5)

### Supporting Queries
8. [Balance Management](#balance-management)
9. [Transaction History](#transaction-history)
10. [Activity & Notifications](#activity--notifications)

---

## C1: User Registration (10%)

> "Users can register with the system and create accounts. Users have roles of seller or buyer with different privileges."

---

### C1.1 Create New User Account

**Purpose**: Register a new user with the system

```sql
-- Insert new user
INSERT INTO User (
    username,
    email,
    passwordHash,
    role,
    displayName,
    createdAt,
    updatedAt
) VALUES (
    :username,
    :email,
    :passwordHash,
    :role,
    :displayName,
    NOW(),
    NOW()
);

-- Get the new user's ID
SET @newUserId = LAST_INSERT_ID();

-- Create associated balance record (1:1 mandatory)
INSERT INTO Balance (
    userId,
    availableBalance,
    pendingBalance,
    createdAt,
    updatedAt
) VALUES (
    @newUserId,
    0.00,
    0.00,
    NOW(),
    NOW()
);
```

**File Context**: `register.php` or `auth/register.php`

---

### C1.2 Check Username Availability

**Purpose**: Verify username is not already taken during registration

```sql
SELECT COUNT(*) AS count
FROM User
WHERE username = :username;
```

**Usage**: Returns 0 if available, 1 if taken

---

### C1.3 Check Email Availability

**Purpose**: Verify email is not already registered

```sql
SELECT COUNT(*) AS count
FROM User
WHERE email = :email;
```

---

### C1.4 User Login Authentication

**Purpose**: Retrieve user credentials for login verification

```sql
SELECT 
    userId,
    username,
    email,
    passwordHash,
    role,
    displayName,
    avatarUrl
FROM User
WHERE username = :usernameOrEmail
   OR email = :usernameOrEmail;
```

**File Context**: `login.php` or `auth/login.php`

---

### C1.5 Get User Profile

**Purpose**: Retrieve full user profile information

```sql
SELECT 
    u.userId,
    u.username,
    u.email,
    u.role,
    u.displayName,
    u.bio,
    u.avatarUrl,
    u.bannerUrl,
    u.twitterUrl,
    u.instagramUrl,
    u.websiteUrl,
    u.createdAt,
    b.availableBalance,
    b.pendingBalance,
    (b.availableBalance + b.pendingBalance) AS totalBalance
FROM User u
JOIN Balance b ON u.userId = b.userId
WHERE u.userId = :userId;
```

**File Context**: `profile.php`

---

### C1.6 Update User Profile

**Purpose**: Update user profile information

```sql
UPDATE User
SET 
    displayName = :displayName,
    bio = :bio,
    avatarUrl = :avatarUrl,
    bannerUrl = :bannerUrl,
    twitterUrl = :twitterUrl,
    instagramUrl = :instagramUrl,
    websiteUrl = :websiteUrl,
    updatedAt = NOW()
WHERE userId = :userId;
```

**File Context**: `profile_edit.php` or `settings.php`

---

### C1.7 Update User Role (Upgrade to Seller)

**Purpose**: Allow buyer to become a seller

```sql
UPDATE User
SET 
    role = 'seller',
    updatedAt = NOW()
WHERE userId = :userId
  AND role = 'buyer';
```

**Note**: Sellers retain all buyer privileges

---

### C1.8 Get User Notification Preferences

**Purpose**: Retrieve notification settings for a user

```sql
SELECT 
    notifyBid,
    notifySale,
    notifyLike,
    notifyWatchlistOutbid,
    notifyWatchlistEnding,
    notifyAuctionWon,
    emailEnabled
FROM User
WHERE userId = :userId;
```

---

### C1.9 Update Notification Preferences

**Purpose**: Update user's notification settings

```sql
UPDATE User
SET 
    notifyBid = :notifyBid,
    notifySale = :notifySale,
    notifyLike = :notifyLike,
    notifyWatchlistOutbid = :notifyWatchlistOutbid,
    notifyWatchlistEnding = :notifyWatchlistEnding,
    notifyAuctionWon = :notifyAuctionWon,
    emailEnabled = :emailEnabled,
    updatedAt = NOW()
WHERE userId = :userId;
```

---

### C1.10 Change Password

**Purpose**: Update user's password

```sql
UPDATE User
SET 
    passwordHash = :newPasswordHash,
    updatedAt = NOW()
WHERE userId = :userId;
```

---

## C2: Auction Creation (10%)

> "Sellers can create auctions for particular items, setting suitable conditions and features of the items including the item description, categorisation, starting price, reserve price and end date."

---

### C2.1 Create New Artwork

**Purpose**: Seller uploads a new artwork to the system

```sql
INSERT INTO Artwork (
    artistId,
    ownerId,
    title,
    description,
    imageUrl,
    category,
    listingType,
    price,
    listingExpiry,
    views,
    createdAt,
    updatedAt
) VALUES (
    :userId,           -- artistId (creator)
    :userId,           -- ownerId (initially same as artist)
    :title,
    :description,
    :imageUrl,
    :category,         -- 'Abstract', 'Digital', etc.
    :listingType,      -- 'display', 'fixedPrice', 'auction', 'unlisted'
    :price,            -- NULL for auction, set for fixedPrice
    :listingExpiry,    -- NULL or expiry datetime
    0,                 -- initial views
    NOW(),
    NOW()
);
```

**File Context**: `artwork_create.php` or `upload.php`

---

### C2.2 Create Auction for Artwork

**Purpose**: Create a timed auction for an artwork

```sql
-- First, update artwork listing type
UPDATE Artwork
SET 
    listingType = 'auction',
    price = NULL,
    updatedAt = NOW()
WHERE artworkId = :artworkId
  AND ownerId = :userId;

-- Then create the auction record
INSERT INTO Auction (
    artworkId,
    startPrice,
    reservePrice,
    startTime,
    endTime,
    status,
    createdAt,
    updatedAt
) VALUES (
    :artworkId,
    :startPrice,
    :reservePrice,      -- Can be NULL
    :startTime,         -- When auction begins
    :endTime,           -- When auction ends
    'active',
    NOW(),
    NOW()
);
```

**File Context**: `auction_create.php`

---

### C2.3 Create Fixed-Price Listing

**Purpose**: List artwork at a fixed price (Buy Now)

```sql
UPDATE Artwork
SET 
    listingType = 'fixedPrice',
    price = :price,
    listingExpiry = :expiryDate,
    updatedAt = NOW()
WHERE artworkId = :artworkId
  AND ownerId = :userId;
```

---

### C2.4 Get Seller's Artworks

**Purpose**: Retrieve all artworks owned by a seller

```sql
SELECT 
    a.artworkId,
    a.title,
    a.description,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.views,
    a.createdAt,
    auc.auctionId,
    auc.startPrice,
    auc.reservePrice,
    auc.endTime,
    auc.status AS auctionStatus,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS bidCount,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.ownerId = :userId
ORDER BY a.createdAt DESC;
```

**File Context**: `my_artworks.php` or `seller_dashboard.php`

---

### C2.5 Get Artwork Details (For Editing)

**Purpose**: Retrieve artwork details for the edit form

```sql
SELECT 
    a.artworkId,
    a.artistId,
    a.ownerId,
    a.title,
    a.description,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.listingExpiry,
    auc.auctionId,
    auc.startPrice,
    auc.reservePrice,
    auc.startTime,
    auc.endTime,
    auc.status AS auctionStatus
FROM Artwork a
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.artworkId = :artworkId
  AND a.ownerId = :userId;
```

---

### C2.6 Update Artwork Details

**Purpose**: Edit artwork information (before auction starts or for non-auction items)

```sql
UPDATE Artwork
SET 
    title = :title,
    description = :description,
    category = :category,
    imageUrl = COALESCE(:newImageUrl, imageUrl),
    updatedAt = NOW()
WHERE artworkId = :artworkId
  AND ownerId = :userId;
```

---

### C2.7 Cancel Auction

**Purpose**: Seller cancels an auction (if no bids or allowed by business rules)

```sql
-- Check if auction can be cancelled (no active bids)
SELECT COUNT(*) AS activeBids
FROM Bid
WHERE auctionId = :auctionId
  AND status = 'active';

-- If activeBids = 0, proceed with cancellation
UPDATE Auction
SET 
    status = 'cancelled',
    updatedAt = NOW()
WHERE auctionId = :auctionId;

-- Reset artwork listing type
UPDATE Artwork
SET 
    listingType = 'display',
    updatedAt = NOW()
WHERE artworkId = (SELECT artworkId FROM Auction WHERE auctionId = :auctionId);
```

---

### C2.8 Get Categories for Dropdown

**Purpose**: Provide category options for artwork creation form

```sql
-- Categories are ENUM values, can be retrieved from schema or hardcoded
-- This query gets distinct categories currently in use
SELECT DISTINCT category
FROM Artwork
ORDER BY category;
```

**Note**: In practice, ENUM values are often defined in application code

---

## C3: Search and Browse (15%)

> "Buyers can search the system for particular kinds of item being auctioned and can browse and visually re-arrange listings of items within categories."

---

### C3.1 Search Artworks by Keyword

**Purpose**: Full-text search across artwork titles and descriptions

```sql
SELECT 
    a.artworkId,
    a.title,
    a.description,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.views,
    u.userId AS artistId,
    u.username AS artistUsername,
    u.displayName AS artistName,
    auc.auctionId,
    auc.endTime,
    auc.status AS auctionStatus,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS bidCount,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
JOIN User u ON a.artistId = u.userId
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.listingType IN ('fixedPrice', 'auction')
  AND (
      a.title LIKE CONCAT('%', :searchTerm, '%')
      OR a.description LIKE CONCAT('%', :searchTerm, '%')
      OR u.username LIKE CONCAT('%', :searchTerm, '%')
      OR u.displayName LIKE CONCAT('%', :searchTerm, '%')
  )
ORDER BY a.createdAt DESC
LIMIT :limit OFFSET :offset;
```

**File Context**: `search.php`

---

### C3.2 Browse by Category

**Purpose**: Get all artworks in a specific category

```sql
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.views,
    u.username AS artistUsername,
    u.displayName AS artistName,
    auc.auctionId,
    auc.endTime,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
JOIN User u ON a.artistId = u.userId
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.category = :category
  AND a.listingType IN ('fixedPrice', 'auction')
ORDER BY a.createdAt DESC
LIMIT :limit OFFSET :offset;
```

**File Context**: `browse.php?category=Digital`

---

### C3.3 Browse All Active Listings

**Purpose**: Get all currently available artworks for sale/auction

```sql
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.views,
    u.username AS artistUsername,
    u.displayName AS artistName,
    u.avatarUrl AS artistAvatar,
    auc.auctionId,
    auc.startPrice,
    auc.endTime,
    auc.status AS auctionStatus,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS bidCount,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
JOIN User u ON a.artistId = u.userId
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.listingType IN ('fixedPrice', 'auction')
  AND (a.listingType != 'auction' OR auc.status = 'active')
ORDER BY a.createdAt DESC
LIMIT :limit OFFSET :offset;
```

**File Context**: `browse.php` or `marketplace.php`

---

### C3.4 Sort Listings by Different Criteria

**Purpose**: Allow users to sort browse results

```sql
-- Sort by Price (Low to High)
SELECT a.*, 
    COALESCE(
        (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active'),
        auc.startPrice,
        a.price
    ) AS sortPrice
FROM Artwork a
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.listingType IN ('fixedPrice', 'auction')
ORDER BY sortPrice ASC
LIMIT :limit OFFSET :offset;

-- Sort by Price (High to Low)
-- Same as above with ORDER BY sortPrice DESC

-- Sort by Ending Soon (Auctions)
SELECT a.*, auc.endTime
FROM Artwork a
JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.listingType = 'auction'
  AND auc.status = 'active'
ORDER BY auc.endTime ASC
LIMIT :limit OFFSET :offset;

-- Sort by Most Popular (Views)
SELECT a.*
FROM Artwork a
WHERE a.listingType IN ('fixedPrice', 'auction')
ORDER BY a.views DESC
LIMIT :limit OFFSET :offset;

-- Sort by Most Liked
SELECT a.*, COUNT(f.userId) AS likeCount
FROM Artwork a
LEFT JOIN Favorite f ON a.artworkId = f.artworkId
WHERE a.listingType IN ('fixedPrice', 'auction')
GROUP BY a.artworkId
ORDER BY likeCount DESC
LIMIT :limit OFFSET :offset;

-- Sort by Newest
SELECT a.*
FROM Artwork a
WHERE a.listingType IN ('fixedPrice', 'auction')
ORDER BY a.createdAt DESC
LIMIT :limit OFFSET :offset;

-- Sort by Most Bids
SELECT a.*, COUNT(b.bidId) AS bidCount
FROM Artwork a
JOIN Auction auc ON a.artworkId = auc.artworkId
LEFT JOIN Bid b ON auc.auctionId = b.auctionId
WHERE a.listingType = 'auction'
GROUP BY a.artworkId
ORDER BY bidCount DESC
LIMIT :limit OFFSET :offset;
```

---

### C3.5 Filter by Multiple Criteria

**Purpose**: Combined filtering (category, price range, listing type)

```sql
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    u.displayName AS artistName,
    auc.endTime,
    COALESCE(
        (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active'),
        auc.startPrice,
        a.price
    ) AS currentPrice,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
JOIN User u ON a.artistId = u.userId
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.listingType IN ('fixedPrice', 'auction')
  AND (:category IS NULL OR a.category = :category)
  AND (:listingType IS NULL OR a.listingType = :listingType)
  AND (:minPrice IS NULL OR COALESCE(
      (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active'),
      auc.startPrice,
      a.price
  ) >= :minPrice)
  AND (:maxPrice IS NULL OR COALESCE(
      (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active'),
      auc.startPrice,
      a.price
  ) <= :maxPrice)
ORDER BY a.createdAt DESC
LIMIT :limit OFFSET :offset;
```

---

### C3.6 Get Single Artwork Details

**Purpose**: View full details of a single artwork

```sql
SELECT 
    a.artworkId,
    a.title,
    a.description,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.listingExpiry,
    a.views,
    a.createdAt,
    
    -- Artist info
    artist.userId AS artistId,
    artist.username AS artistUsername,
    artist.displayName AS artistName,
    artist.avatarUrl AS artistAvatar,
    artist.bio AS artistBio,
    
    -- Owner info (if different from artist)
    owner.userId AS ownerId,
    owner.username AS ownerUsername,
    owner.displayName AS ownerName,
    
    -- Auction info (if applicable)
    auc.auctionId,
    auc.startPrice,
    auc.reservePrice,
    auc.startTime,
    auc.endTime,
    auc.status AS auctionStatus,
    
    -- Derived values
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS bidCount,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount,
    (SELECT COUNT(*) FROM Watchlist WHERE artworkId = a.artworkId) AS watchCount

FROM Artwork a
JOIN User artist ON a.artistId = artist.userId
JOIN User owner ON a.ownerId = owner.userId
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.artworkId = :artworkId;
```

**File Context**: `artwork.php?id=123`

---

### C3.7 Increment View Count

**Purpose**: Track artwork views

```sql
UPDATE Artwork
SET 
    views = views + 1,
    updatedAt = NOW()
WHERE artworkId = :artworkId;
```

**Note**: Consider implementing view tracking with session checks to prevent refresh abuse

---

### C3.8 Get Artwork Price History

**Purpose**: Show historical sales for an artwork

```sql
SELECT 
    ph.priceHistoryId,
    ph.salePrice,
    ph.saleType,
    ph.soldAt,
    seller.username AS sellerUsername,
    seller.displayName AS sellerName,
    buyer.username AS buyerUsername,
    buyer.displayName AS buyerName
FROM PriceHistory ph
JOIN User seller ON ph.sellerId = seller.userId
JOIN User buyer ON ph.buyerId = buyer.userId
WHERE ph.artworkId = :artworkId
ORDER BY ph.soldAt DESC;
```

---

### C3.9 Get Category Counts

**Purpose**: Show number of listings per category for navigation

```sql
SELECT 
    category,
    COUNT(*) AS count
FROM Artwork
WHERE listingType IN ('fixedPrice', 'auction')
GROUP BY category
ORDER BY count DESC;
```

---

### C3.10 Search with Pagination Count

**Purpose**: Get total count for pagination

```sql
SELECT COUNT(*) AS total
FROM Artwork a
JOIN User u ON a.artistId = u.userId
WHERE a.listingType IN ('fixedPrice', 'auction')
  AND (
      a.title LIKE CONCAT('%', :searchTerm, '%')
      OR a.description LIKE CONCAT('%', :searchTerm, '%')
      OR u.username LIKE CONCAT('%', :searchTerm, '%')
  );
```

---

## C4: Bidding System (15%)

> "Buyers can bid for items and see the bids other users make as they are received. The system will manage the auction until the set end time and award the item to the highest bidder. The system should confirm to both the winner and seller of an auction its outcome."

---

### C4.1 Place a Bid

**Purpose**: Submit a new bid on an auction

```sql
-- Step 1: Verify auction is active and bid is valid
SELECT 
    auc.auctionId,
    auc.artworkId,
    auc.startPrice,
    auc.endTime,
    auc.status,
    a.ownerId AS sellerId,
    COALESCE(MAX(b.bidAmount), auc.startPrice - 1) AS currentHighBid
FROM Auction auc
JOIN Artwork a ON auc.artworkId = a.artworkId
LEFT JOIN Bid b ON auc.auctionId = b.auctionId AND b.status = 'active'
WHERE auc.auctionId = :auctionId
GROUP BY auc.auctionId;

-- Step 2: Check user has sufficient balance
SELECT availableBalance
FROM Balance
WHERE userId = :userId;

-- Step 3: If user already has an active bid, mark it as replaced
UPDATE Bid
SET 
    status = 'replaced',
    updatedAt = NOW()
WHERE auctionId = :auctionId
  AND userId = :userId
  AND status = 'active';

-- Step 4: Refund the previous bid amount to available balance
UPDATE Balance
SET 
    availableBalance = availableBalance + :previousBidAmount,
    pendingBalance = pendingBalance - :previousBidAmount,
    updatedAt = NOW()
WHERE userId = :userId;

-- Step 5: Mark previous high bidder as outbid
UPDATE Bid
SET 
    status = 'outbid',
    updatedAt = NOW()
WHERE auctionId = :auctionId
  AND status = 'active'
  AND userId != :userId;

-- Step 6: Insert the new bid
INSERT INTO Bid (
    auctionId,
    userId,
    bidAmount,
    status,
    createdAt,
    updatedAt
) VALUES (
    :auctionId,
    :userId,
    :bidAmount,
    'active',
    NOW(),
    NOW()
);

-- Step 7: Lock bid amount in user's balance
UPDATE Balance
SET 
    availableBalance = availableBalance - :bidAmount,
    pendingBalance = pendingBalance + :bidAmount,
    updatedAt = NOW()
WHERE userId = :userId;

-- Step 8: Record the bid transaction
INSERT INTO Transaction (
    userId,
    type,
    amount,
    status,
    artworkId,
    auctionId,
    bidId,
    createdAt,
    updatedAt
) VALUES (
    :userId,
    'bid',
    :bidAmount,
    'completed',
    :artworkId,
    :auctionId,
    LAST_INSERT_ID(),
    NOW(),
    NOW()
);
```

**File Context**: `place_bid.php` or `api/bid.php`

---

### C4.2 Get Current Bid Status

**Purpose**: Retrieve current auction state for display

```sql
SELECT 
    auc.auctionId,
    auc.startPrice,
    auc.reservePrice,
    auc.startTime,
    auc.endTime,
    auc.status,
    TIMESTAMPDIFF(SECOND, NOW(), auc.endTime) AS secondsRemaining,
    a.artworkId,
    a.title,
    a.imageUrl,
    a.ownerId AS sellerId,
    
    -- Current winning bid
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    
    -- Number of bids
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS totalBids,
    
    -- Current high bidder
    (SELECT userId FROM Bid WHERE auctionId = auc.auctionId AND status = 'active' ORDER BY bidAmount DESC LIMIT 1) AS highBidderId,
    
    -- Reserve met?
    (SELECT MAX(bidAmount) >= auc.reservePrice FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS reserveMet

FROM Auction auc
JOIN Artwork a ON auc.artworkId = a.artworkId
WHERE auc.auctionId = :auctionId;
```

---

### C4.3 Get Bid History for Auction

**Purpose**: Display all bids on an auction

```sql
SELECT 
    b.bidId,
    b.bidAmount,
    b.status,
    b.createdAt,
    u.userId,
    u.username,
    u.displayName,
    u.avatarUrl
FROM Bid b
JOIN User u ON b.userId = u.userId
WHERE b.auctionId = :auctionId
ORDER BY b.bidAmount DESC, b.createdAt ASC;
```

**File Context**: `auction.php` or `api/bids.php`

---

### C4.4 Get User's Active Bids

**Purpose**: Show user their current active bids

```sql
SELECT 
    b.bidId,
    b.bidAmount,
    b.status,
    b.createdAt,
    auc.auctionId,
    auc.endTime,
    auc.status AS auctionStatus,
    a.artworkId,
    a.title,
    a.imageUrl,
    COALESCE(MAX(b2.bidAmount), auc.startPrice) AS currentHighBid,
    (b.bidAmount = MAX(b2.bidAmount)) AS isWinning
FROM Bid b
JOIN Auction auc ON b.auctionId = auc.auctionId
JOIN Artwork a ON auc.artworkId = a.artworkId
LEFT JOIN Bid b2 ON auc.auctionId = b2.auctionId AND b2.status = 'active'
WHERE b.userId = :userId
  AND b.status IN ('active', 'outbid')
  AND auc.status = 'active'
GROUP BY b.bidId
ORDER BY auc.endTime ASC;
```

**File Context**: `my_bids.php`

---

### C4.5 End Auction (Scheduled Task)

**Purpose**: Process auctions that have reached their end time

```sql
-- Step 1: Find auctions that need to be ended
SELECT 
    auc.auctionId,
    auc.artworkId,
    auc.reservePrice,
    a.ownerId AS sellerId,
    a.title AS artworkTitle,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS winningBid,
    (SELECT userId FROM Bid WHERE auctionId = auc.auctionId AND status = 'active' ORDER BY bidAmount DESC LIMIT 1) AS winnerId
FROM Auction auc
JOIN Artwork a ON auc.artworkId = a.artworkId
WHERE auc.status = 'active'
  AND auc.endTime <= NOW();
```

**File Context**: `cron/end_auctions.php` (scheduled task)

---

### C4.6 Process Successful Auction (Reserve Met)

**Purpose**: Complete auction when reserve is met

```sql
-- Step 1: Update auction status
UPDATE Auction
SET 
    status = 'sold',
    updatedAt = NOW()
WHERE auctionId = :auctionId;

-- Step 2: Mark winning bid
UPDATE Bid
SET 
    status = 'won',
    updatedAt = NOW()
WHERE auctionId = :auctionId
  AND status = 'active'
  AND bidAmount = :winningBidAmount;

-- Step 3: Refund outbid users
UPDATE Bid
SET 
    status = 'refunded',
    updatedAt = NOW()
WHERE auctionId = :auctionId
  AND status = 'outbid';

-- (For each outbid user)
UPDATE Balance
SET 
    availableBalance = availableBalance + :refundAmount,
    pendingBalance = pendingBalance - :refundAmount,
    updatedAt = NOW()
WHERE userId = :outbidUserId;

-- Step 4: Transfer artwork ownership
UPDATE Artwork
SET 
    ownerId = :winnerId,
    listingType = 'display',
    price = NULL,
    updatedAt = NOW()
WHERE artworkId = :artworkId;

-- Step 5: Process payment - Winner's transaction
INSERT INTO Transaction (userId, type, amount, status, artworkId, auctionId, createdAt, updatedAt)
VALUES (:winnerId, 'auction_won', :winningBid, 'completed', :artworkId, :auctionId, NOW(), NOW());

-- Step 6: Move winner's pending to completed (balance already locked)
UPDATE Balance
SET 
    pendingBalance = pendingBalance - :winningBid,
    updatedAt = NOW()
WHERE userId = :winnerId;

-- Step 7: Pay seller (minus platform fee)
SET @platformFee = :winningBid * 0.025;
SET @netAmount = :winningBid - @platformFee;

INSERT INTO Transaction (userId, type, amount, platformFee, netAmount, status, artworkId, auctionId, createdAt, updatedAt)
VALUES (:sellerId, 'auction_sale', :winningBid, @platformFee, @netAmount, 'completed', :artworkId, :auctionId, NOW(), NOW());

UPDATE Balance
SET 
    availableBalance = availableBalance + @netAmount,
    updatedAt = NOW()
WHERE userId = :sellerId;

-- Step 8: Record in price history
INSERT INTO PriceHistory (artworkId, sellerId, buyerId, salePrice, saleType, auctionId, soldAt)
VALUES (:artworkId, :sellerId, :winnerId, :winningBid, 'auction', :auctionId, NOW());
```

---

### C4.7 Process Unsuccessful Auction (No Bids or Reserve Not Met)

**Purpose**: Handle auction ending without a sale

```sql
-- Step 1: Update auction status
UPDATE Auction
SET 
    status = 'unsold',
    updatedAt = NOW()
WHERE auctionId = :auctionId;

-- Step 2: Refund all bidders
UPDATE Bid
SET 
    status = 'expired',
    updatedAt = NOW()
WHERE auctionId = :auctionId
  AND status IN ('active', 'outbid');

-- (For each bidder)
UPDATE Balance
SET 
    availableBalance = availableBalance + :bidAmount,
    pendingBalance = pendingBalance - :bidAmount,
    updatedAt = NOW()
WHERE userId = :bidderId;

-- Record refund transaction
INSERT INTO Transaction (userId, type, amount, status, auctionId, bidId, createdAt, updatedAt)
VALUES (:bidderId, 'bid_refund', :bidAmount, 'completed', :auctionId, :bidId, NOW(), NOW());

-- Step 3: Reset artwork listing
UPDATE Artwork
SET 
    listingType = 'display',
    updatedAt = NOW()
WHERE artworkId = :artworkId;
```

---

### C4.8 Notify Auction Winner

**Purpose**: Create activity notification for winner

```sql
INSERT INTO Activity (
    userId,
    type,
    artworkId,
    auctionId,
    bidId,
    triggeredByUserId,
    createdAt
) VALUES (
    :winnerId,
    'auction_won',
    :artworkId,
    :auctionId,
    :winningBidId,
    :sellerId,
    NOW()
);
```

---

### C4.9 Notify Seller of Auction Result

**Purpose**: Create activity notification for seller

```sql
-- If sold
INSERT INTO Activity (userId, type, artworkId, auctionId, triggeredByUserId, createdAt)
VALUES (:sellerId, 'auction_sold', :artworkId, :auctionId, :winnerId, NOW());

-- If unsold
INSERT INTO Activity (userId, type, artworkId, auctionId, createdAt)
VALUES (:sellerId, 'auction_unsold', :artworkId, :auctionId, NOW());
```

---

### C4.10 Notify Outbid Users

**Purpose**: Alert users when they've been outbid

```sql
INSERT INTO Activity (
    userId,
    type,
    artworkId,
    auctionId,
    bidId,
    triggeredByUserId,
    createdAt
) VALUES (
    :outbidUserId,
    'outbid',
    :artworkId,
    :auctionId,
    :newBidId,
    :newBidderId,
    NOW()
);
```

---

### C4.11 Get Real-Time Bid Updates (Polling)

**Purpose**: Check for new bids since last update

```sql
SELECT 
    b.bidId,
    b.bidAmount,
    b.createdAt,
    u.username,
    u.displayName
FROM Bid b
JOIN User u ON b.userId = u.userId
WHERE b.auctionId = :auctionId
  AND b.createdAt > :lastCheckTime
ORDER BY b.createdAt DESC;
```

**File Context**: `api/poll_bids.php` (AJAX endpoint)

---

## E1-E4: Additional Features (20%)

> "Extra functionality related to core features requiring usage of a database."

---

### E1: Fixed-Price Purchase (Buy Now)

---

#### E1.1 Purchase Fixed-Price Artwork

**Purpose**: Complete immediate purchase of fixed-price artwork

```sql
-- Step 1: Verify artwork is available
SELECT 
    a.artworkId,
    a.ownerId AS sellerId,
    a.price,
    a.listingType,
    a.title
FROM Artwork a
WHERE a.artworkId = :artworkId
  AND a.listingType = 'fixedPrice'
  AND a.price IS NOT NULL;

-- Step 2: Check buyer balance
SELECT availableBalance
FROM Balance
WHERE userId = :buyerId;

-- Step 3: Deduct from buyer
UPDATE Balance
SET 
    availableBalance = availableBalance - :price,
    updatedAt = NOW()
WHERE userId = :buyerId;

-- Step 4: Record buyer transaction
INSERT INTO Transaction (userId, type, amount, status, artworkId, createdAt, updatedAt)
VALUES (:buyerId, 'purchase', :price, 'completed', :artworkId, NOW(), NOW());

-- Step 5: Pay seller (minus fee)
SET @platformFee = :price * 0.025;
SET @netAmount = :price - @platformFee;

UPDATE Balance
SET 
    availableBalance = availableBalance + @netAmount,
    updatedAt = NOW()
WHERE userId = :sellerId;

-- Step 6: Record seller transaction
INSERT INTO Transaction (userId, type, amount, platformFee, netAmount, status, artworkId, createdAt, updatedAt)
VALUES (:sellerId, 'sale', :price, @platformFee, @netAmount, 'completed', :artworkId, NOW(), NOW());

-- Step 7: Transfer ownership
UPDATE Artwork
SET 
    ownerId = :buyerId,
    listingType = 'display',
    price = NULL,
    listingExpiry = NULL,
    updatedAt = NOW()
WHERE artworkId = :artworkId;

-- Step 8: Record price history
INSERT INTO PriceHistory (artworkId, sellerId, buyerId, salePrice, saleType, soldAt)
VALUES (:artworkId, :sellerId, :buyerId, :price, 'fixedPrice', NOW());

-- Step 9: Notify seller
INSERT INTO Activity (userId, type, artworkId, triggeredByUserId, createdAt)
VALUES (:sellerId, 'sale', :artworkId, :buyerId, NOW());

-- Step 10: Notify buyer
INSERT INTO Activity (userId, type, artworkId, triggeredByUserId, createdAt)
VALUES (:buyerId, 'purchase', :artworkId, :sellerId, NOW());
```

---

### E2: Favorites/Likes System

---

#### E2.1 Like an Artwork

**Purpose**: Add artwork to user's favorites

```sql
INSERT INTO Favorite (userId, artworkId, createdAt)
VALUES (:userId, :artworkId, NOW())
ON DUPLICATE KEY UPDATE createdAt = createdAt;  -- Ignore if already liked
```

---

#### E2.2 Unlike an Artwork

**Purpose**: Remove artwork from favorites

```sql
DELETE FROM Favorite
WHERE userId = :userId
  AND artworkId = :artworkId;
```

---

#### E2.3 Check if User Liked Artwork

**Purpose**: Determine like status for UI

```sql
SELECT COUNT(*) AS liked
FROM Favorite
WHERE userId = :userId
  AND artworkId = :artworkId;
```

---

#### E2.4 Get User's Liked Artworks

**Purpose**: Display user's favorites

```sql
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    u.displayName AS artistName,
    f.createdAt AS likedAt,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS totalLikes
FROM Favorite f
JOIN Artwork a ON f.artworkId = a.artworkId
JOIN User u ON a.artistId = u.userId
WHERE f.userId = :userId
ORDER BY f.createdAt DESC;
```

---

#### E2.5 Get Artwork Like Count

**Purpose**: Display number of likes on artwork

```sql
SELECT COUNT(*) AS likeCount
FROM Favorite
WHERE artworkId = :artworkId;
```

---

#### E2.6 Notify Artist of New Like

**Purpose**: Create notification when artwork is liked

```sql
INSERT INTO Activity (userId, type, artworkId, triggeredByUserId, createdAt)
VALUES (
    (SELECT artistId FROM Artwork WHERE artworkId = :artworkId),
    'like',
    :artworkId,
    :likerId,
    NOW()
);
```

---

### E3: User Dashboard & Statistics

---

#### E3.1 Get Seller Dashboard Stats

**Purpose**: Summary statistics for seller

```sql
SELECT
    -- Total artworks
    (SELECT COUNT(*) FROM Artwork WHERE ownerId = :userId) AS totalArtworks,
    
    -- Active listings
    (SELECT COUNT(*) FROM Artwork WHERE ownerId = :userId AND listingType IN ('fixedPrice', 'auction')) AS activeListings,
    
    -- Total sales
    (SELECT COUNT(*) FROM PriceHistory WHERE sellerId = :userId) AS totalSales,
    
    -- Total revenue
    (SELECT COALESCE(SUM(netAmount), 0) FROM Transaction WHERE userId = :userId AND type IN ('sale', 'auction_sale')) AS totalRevenue,
    
    -- Total views
    (SELECT COALESCE(SUM(views), 0) FROM Artwork WHERE artistId = :userId) AS totalViews,
    
    -- Total likes received
    (SELECT COUNT(*) FROM Favorite f JOIN Artwork a ON f.artworkId = a.artworkId WHERE a.artistId = :userId) AS totalLikes;
```

---

#### E3.2 Get Buyer Dashboard Stats

**Purpose**: Summary statistics for buyer

```sql
SELECT
    -- Total purchases
    (SELECT COUNT(*) FROM PriceHistory WHERE buyerId = :userId) AS totalPurchases,
    
    -- Total spent
    (SELECT COALESCE(SUM(amount), 0) FROM Transaction WHERE userId = :userId AND type IN ('purchase', 'auction_won')) AS totalSpent,
    
    -- Active bids
    (SELECT COUNT(DISTINCT auctionId) FROM Bid WHERE userId = :userId AND status IN ('active', 'outbid')) AS activeBids,
    
    -- Won auctions
    (SELECT COUNT(*) FROM Bid WHERE userId = :userId AND status = 'won') AS auctionsWon,
    
    -- Items in collection
    (SELECT COUNT(*) FROM Artwork WHERE ownerId = :userId) AS collectionSize,
    
    -- Watchlist count
    (SELECT COUNT(*) FROM Watchlist WHERE userId = :userId) AS watchlistCount;
```

---

#### E3.3 Get Recent Sales for Seller

**Purpose**: List of recent sales

```sql
SELECT 
    ph.priceHistoryId,
    ph.salePrice,
    ph.saleType,
    ph.soldAt,
    a.artworkId,
    a.title,
    a.imageUrl,
    buyer.username AS buyerUsername,
    buyer.displayName AS buyerName,
    t.platformFee,
    t.netAmount
FROM PriceHistory ph
JOIN Artwork a ON ph.artworkId = a.artworkId
JOIN User buyer ON ph.buyerId = buyer.userId
LEFT JOIN Transaction t ON t.artworkId = ph.artworkId 
    AND t.userId = ph.sellerId 
    AND t.type IN ('sale', 'auction_sale')
WHERE ph.sellerId = :userId
ORDER BY ph.soldAt DESC
LIMIT 10;
```

---

### E4: Artist Profiles & Following

---

#### E4.1 Get Artist Public Profile

**Purpose**: Display artist profile page

```sql
SELECT 
    u.userId,
    u.username,
    u.displayName,
    u.bio,
    u.avatarUrl,
    u.bannerUrl,
    u.twitterUrl,
    u.instagramUrl,
    u.websiteUrl,
    u.createdAt AS memberSince,
    
    -- Statistics
    (SELECT COUNT(*) FROM Artwork WHERE artistId = u.userId) AS artworksCreated,
    (SELECT COUNT(*) FROM Artwork WHERE ownerId = u.userId AND listingType IN ('fixedPrice', 'auction')) AS currentListings,
    (SELECT COUNT(*) FROM PriceHistory WHERE sellerId = u.userId) AS totalSales,
    (SELECT COUNT(*) FROM Favorite f JOIN Artwork a ON f.artworkId = a.artworkId WHERE a.artistId = u.userId) AS totalLikes

FROM User u
WHERE u.userId = :artistId
  AND u.role = 'seller';
```

---

#### E4.2 Get Artist's Artworks

**Purpose**: Display artworks by a specific artist

```sql
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    a.views,
    auc.endTime,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.artistId = :artistId
  AND a.listingType != 'unlisted'
ORDER BY a.createdAt DESC;
```

---

## E5: Watchlist with Notifications (5%)

> "Buyers can watch auctions on items and receive emailed updates on bids on those items including notifications when they are outbid."

---

### E5.1 Add to Watchlist

**Purpose**: Add artwork to user's watchlist

```sql
-- Get the next position
SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition
FROM Watchlist
WHERE userId = :userId;

-- Insert watchlist entry
INSERT INTO Watchlist (userId, artworkId, position, createdAt)
VALUES (:userId, :artworkId, :nextPosition, NOW())
ON DUPLICATE KEY UPDATE position = position;  -- Ignore if already watching
```

---

### E5.2 Remove from Watchlist

**Purpose**: Remove artwork from watchlist

```sql
DELETE FROM Watchlist
WHERE userId = :userId
  AND artworkId = :artworkId;
```

---

### E5.3 Check if User is Watching Artwork

**Purpose**: Determine watchlist status for UI

```sql
SELECT watchlistId, position
FROM Watchlist
WHERE userId = :userId
  AND artworkId = :artworkId;
```

---

### E5.4 Get User's Watchlist

**Purpose**: Display user's watched artworks

```sql
SELECT 
    w.watchlistId,
    w.position,
    w.createdAt AS watchedSince,
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    u.displayName AS artistName,
    auc.auctionId,
    auc.startPrice,
    auc.endTime,
    auc.status AS auctionStatus,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS bidCount
FROM Watchlist w
JOIN Artwork a ON w.artworkId = a.artworkId
JOIN User u ON a.artistId = u.userId
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE w.userId = :userId
ORDER BY w.position ASC;
```

**File Context**: `watchlist.php`

---

### E5.5 Reorder Watchlist

**Purpose**: Update positions after drag-and-drop reorder

```sql
-- Update position for moved item
UPDATE Watchlist
SET position = :newPosition
WHERE watchlistId = :watchlistId
  AND userId = :userId;

-- Shift other items (if moving up)
UPDATE Watchlist
SET position = position + 1
WHERE userId = :userId
  AND position >= :newPosition
  AND position < :oldPosition
  AND watchlistId != :watchlistId;

-- Shift other items (if moving down)
UPDATE Watchlist
SET position = position - 1
WHERE userId = :userId
  AND position <= :newPosition
  AND position > :oldPosition
  AND watchlistId != :watchlistId;
```

---

### E5.6 Notify Watchers of New Bid

**Purpose**: Create notifications for all watchers when a new bid is placed

```sql
INSERT INTO Activity (userId, type, artworkId, auctionId, bidId, triggeredByUserId, createdAt)
SELECT 
    w.userId,
    'watchlist_outbid',
    :artworkId,
    :auctionId,
    :bidId,
    :bidderId,
    NOW()
FROM Watchlist w
JOIN User u ON w.userId = u.userId
WHERE w.artworkId = :artworkId
  AND w.userId != :bidderId
  AND u.notifyWatchlistOutbid = TRUE;
```

---

### E5.7 Notify Watchers of Auction Ending Soon

**Purpose**: Alert watchers when auction is about to end

```sql
-- Find auctions ending within specified time (e.g., 1 hour)
INSERT INTO Activity (userId, type, artworkId, auctionId, createdAt)
SELECT 
    w.userId,
    'watchlist_ending',
    a.artworkId,
    auc.auctionId,
    NOW()
FROM Watchlist w
JOIN Artwork a ON w.artworkId = a.artworkId
JOIN Auction auc ON a.artworkId = auc.artworkId
JOIN User u ON w.userId = u.userId
WHERE auc.status = 'active'
  AND auc.endTime BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 1 HOUR)
  AND u.notifyWatchlistEnding = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM Activity 
      WHERE userId = w.userId 
        AND type = 'watchlist_ending' 
        AND auctionId = auc.auctionId
  );
```

**File Context**: `cron/notify_ending_soon.php`

---

### E5.8 Notify Watchers When Artwork Listed

**Purpose**: Alert watchers when watched artwork is listed for sale

```sql
INSERT INTO Activity (userId, type, artworkId, triggeredByUserId, createdAt)
SELECT 
    w.userId,
    CASE 
        WHEN :listingType = 'auction' THEN 'watchlist_auction_started'
        ELSE 'watchlist_listed'
    END,
    :artworkId,
    :sellerId,
    NOW()
FROM Watchlist w
JOIN User u ON w.userId = u.userId
WHERE w.artworkId = :artworkId
  AND w.userId != :sellerId;
```

---

### E5.9 Get Users to Email for Watchlist Updates

**Purpose**: Retrieve users who should receive email notifications

```sql
SELECT 
    u.userId,
    u.email,
    u.displayName,
    a.title AS artworkTitle,
    act.type AS activityType
FROM Activity act
JOIN User u ON act.userId = u.userId
JOIN Artwork a ON act.artworkId = a.artworkId
WHERE act.type LIKE 'watchlist_%'
  AND act.isRead = FALSE
  AND u.emailEnabled = TRUE
  AND (
      (act.type = 'watchlist_outbid' AND u.notifyWatchlistOutbid = TRUE) OR
      (act.type = 'watchlist_ending' AND u.notifyWatchlistEnding = TRUE) OR
      (act.type IN ('watchlist_listed', 'watchlist_auction_started', 'watchlist_price_changed', 'watchlist_sold'))
  );
```

---

## E6: Collaborative Filtering (5%)

> "Buyers can receive recommendations for items to bid on based on collaborative filtering (i.e., 'you might want to bid on the sorts of things other people, who have also bid on the sorts of things you have previously bid on, are currently bidding on')."

---

### E6.1 Find Similar Users (Based on Bidding History)

**Purpose**: Identify users with similar bidding patterns

```sql
-- Find users who bid on the same auctions as the target user
SELECT 
    b2.userId AS similarUserId,
    COUNT(DISTINCT b2.auctionId) AS commonBids,
    COUNT(DISTINCT b2.auctionId) / 
        (SELECT COUNT(DISTINCT auctionId) FROM Bid WHERE userId = :userId) AS similarity
FROM Bid b1
JOIN Bid b2 ON b1.auctionId = b2.auctionId AND b1.userId != b2.userId
WHERE b1.userId = :userId
GROUP BY b2.userId
HAVING commonBids >= 2
ORDER BY similarity DESC
LIMIT 20;
```

---

### E6.2 Get Recommendations Based on Similar Users' Bids

**Purpose**: Recommend auctions that similar users are bidding on

```sql
-- Get artworks that similar users have bid on but target user hasn't
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    auc.auctionId,
    auc.endTime,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    COUNT(DISTINCT similar_bids.userId) AS similarUserBidCount,
    AVG(similar_users.similarity) AS avgSimilarity
FROM (
    -- Similar users subquery
    SELECT 
        b2.userId,
        COUNT(DISTINCT b2.auctionId) / 
            (SELECT COUNT(DISTINCT auctionId) FROM Bid WHERE userId = :userId) AS similarity
    FROM Bid b1
    JOIN Bid b2 ON b1.auctionId = b2.auctionId AND b1.userId != b2.userId
    WHERE b1.userId = :userId
    GROUP BY b2.userId
    HAVING COUNT(DISTINCT b2.auctionId) >= 2
) AS similar_users
JOIN Bid similar_bids ON similar_users.userId = similar_bids.userId
JOIN Auction auc ON similar_bids.auctionId = auc.auctionId
JOIN Artwork a ON auc.artworkId = a.artworkId
WHERE auc.status = 'active'
  AND auc.endTime > NOW()
  AND NOT EXISTS (
      SELECT 1 FROM Bid 
      WHERE userId = :userId AND auctionId = auc.auctionId
  )
  AND a.ownerId != :userId
GROUP BY a.artworkId
ORDER BY similarUserBidCount DESC, avgSimilarity DESC
LIMIT 10;
```

**File Context**: `recommendations.php` or `api/recommendations.php`

---

### E6.3 Alternative: Category-Based Recommendations

**Purpose**: Simpler recommendation based on category preferences

```sql
-- Find user's preferred categories based on bid history
WITH UserCategories AS (
    SELECT 
        a.category,
        COUNT(*) AS bidCount
    FROM Bid b
    JOIN Auction auc ON b.auctionId = auc.auctionId
    JOIN Artwork a ON auc.artworkId = a.artworkId
    WHERE b.userId = :userId
    GROUP BY a.category
    ORDER BY bidCount DESC
    LIMIT 3
)
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    auc.auctionId,
    auc.endTime,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    (SELECT COUNT(*) FROM Bid WHERE auctionId = auc.auctionId) AS bidCount
FROM Artwork a
JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.category IN (SELECT category FROM UserCategories)
  AND auc.status = 'active'
  AND auc.endTime > NOW()
  AND NOT EXISTS (
      SELECT 1 FROM Bid WHERE userId = :userId AND auctionId = auc.auctionId
  )
  AND a.ownerId != :userId
ORDER BY 
    (SELECT bidCount FROM UserCategories WHERE category = a.category) DESC,
    auc.endTime ASC
LIMIT 10;
```

---

### E6.4 Recommendations Based on Favorites

**Purpose**: Recommend items similar to user's liked artworks

```sql
-- Find artworks in same categories as user's favorites
WITH LikedCategories AS (
    SELECT 
        a.category,
        COUNT(*) AS likeCount
    FROM Favorite f
    JOIN Artwork a ON f.artworkId = a.artworkId
    WHERE f.userId = :userId
    GROUP BY a.category
)
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    a.category,
    a.listingType,
    a.price,
    auc.auctionId,
    auc.endTime,
    COALESCE(
        (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active'),
        auc.startPrice,
        a.price
    ) AS currentPrice,
    (SELECT COUNT(*) FROM Favorite WHERE artworkId = a.artworkId) AS likeCount
FROM Artwork a
LEFT JOIN Auction auc ON a.artworkId = auc.artworkId
WHERE a.category IN (SELECT category FROM LikedCategories)
  AND a.listingType IN ('fixedPrice', 'auction')
  AND NOT EXISTS (SELECT 1 FROM Favorite WHERE userId = :userId AND artworkId = a.artworkId)
  AND a.ownerId != :userId
ORDER BY 
    (SELECT likeCount FROM LikedCategories WHERE category = a.category) DESC,
    likeCount DESC
LIMIT 10;
```

---

### E6.5 "Users Who Bid on This Also Bid On..."

**Purpose**: Show related auctions on artwork detail page

```sql
SELECT 
    a.artworkId,
    a.title,
    a.imageUrl,
    auc.auctionId,
    auc.endTime,
    (SELECT MAX(bidAmount) FROM Bid WHERE auctionId = auc.auctionId AND status = 'active') AS currentBid,
    COUNT(DISTINCT b2.userId) AS commonBidders
FROM Bid b1
JOIN Bid b2 ON b1.userId = b2.userId AND b1.auctionId != b2.auctionId
JOIN Auction auc ON b2.auctionId = auc.auctionId
JOIN Artwork a ON auc.artworkId = a.artworkId
WHERE b1.auctionId = :currentAuctionId
  AND auc.status = 'active'
  AND auc.endTime > NOW()
GROUP BY a.artworkId
ORDER BY commonBidders DESC
LIMIT 5;
```

---

## Balance Management

---

### BM.1 Deposit Funds

**Purpose**: Add funds to user's balance

```sql
-- Update balance
UPDATE Balance
SET 
    availableBalance = availableBalance + :amount,
    updatedAt = NOW()
WHERE userId = :userId;

-- Record transaction
INSERT INTO Transaction (userId, type, amount, status, createdAt, updatedAt)
VALUES (:userId, 'deposit', :amount, 'completed', NOW(), NOW());
```

---

### BM.2 Request Withdrawal

**Purpose**: Initiate withdrawal (pending admin approval)

```sql
-- Check sufficient balance
SELECT availableBalance
FROM Balance
WHERE userId = :userId;

-- Lock the withdrawal amount
UPDATE Balance
SET 
    availableBalance = availableBalance - :amount,
    pendingBalance = pendingBalance + :amount,
    updatedAt = NOW()
WHERE userId = :userId
  AND availableBalance >= :amount;

-- Record pending transaction
INSERT INTO Transaction (userId, type, amount, status, createdAt, updatedAt)
VALUES (:userId, 'withdrawal', :amount, 'pending', NOW(), NOW());
```

---

### BM.3 Get Balance Summary

**Purpose**: Display user's current balance

```sql
SELECT 
    availableBalance,
    pendingBalance,
    (availableBalance + pendingBalance) AS totalBalance,
    updatedAt AS lastUpdated
FROM Balance
WHERE userId = :userId;
```

---

### BM.4 Get Balance History

**Purpose**: Show transaction history for balance

```sql
SELECT 
    transactionId,
    type,
    amount,
    platformFee,
    netAmount,
    status,
    createdAt,
    a.title AS artworkTitle
FROM Transaction t
LEFT JOIN Artwork a ON t.artworkId = a.artworkId
WHERE t.userId = :userId
ORDER BY t.createdAt DESC
LIMIT :limit OFFSET :offset;
```

---

## Transaction History

---

### TH.1 Get User's Full Transaction History

**Purpose**: Complete transaction log

```sql
SELECT 
    t.transactionId,
    t.type,
    t.amount,
    t.platformFee,
    t.netAmount,
    t.status,
    t.createdAt,
    a.artworkId,
    a.title AS artworkTitle,
    a.imageUrl AS artworkImage,
    auc.auctionId
FROM Transaction t
LEFT JOIN Artwork a ON t.artworkId = a.artworkId
LEFT JOIN Auction auc ON t.auctionId = auc.auctionId
WHERE t.userId = :userId
ORDER BY t.createdAt DESC
LIMIT :limit OFFSET :offset;
```

---

### TH.2 Get Transaction Summary by Type

**Purpose**: Aggregate transaction statistics

```sql
SELECT 
    type,
    COUNT(*) AS count,
    SUM(amount) AS totalAmount,
    SUM(COALESCE(platformFee, 0)) AS totalFees,
    SUM(COALESCE(netAmount, amount)) AS totalNet
FROM Transaction
WHERE userId = :userId
  AND status = 'completed'
GROUP BY type;
```

---

### TH.3 Get Transaction by ID

**Purpose**: View single transaction details

```sql
SELECT 
    t.*,
    a.title AS artworkTitle,
    a.imageUrl AS artworkImage,
    seller.displayName AS sellerName,
    buyer.displayName AS buyerName
FROM Transaction t
LEFT JOIN Artwork a ON t.artworkId = a.artworkId
LEFT JOIN User seller ON a.ownerId = seller.userId
LEFT JOIN User buyer ON t.userId = buyer.userId
WHERE t.transactionId = :transactionId
  AND t.userId = :userId;
```

---

## Activity & Notifications

---

### AN.1 Get User's Unread Notifications

**Purpose**: Display notification bell count and list

```sql
SELECT 
    act.activityId,
    act.type,
    act.isRead,
    act.createdAt,
    a.artworkId,
    a.title AS artworkTitle,
    a.imageUrl AS artworkImage,
    trigger_user.userId AS triggeredById,
    trigger_user.username AS triggeredByUsername,
    trigger_user.displayName AS triggeredByName
FROM Activity act
LEFT JOIN Artwork a ON act.artworkId = a.artworkId
LEFT JOIN User trigger_user ON act.triggeredByUserId = trigger_user.userId
WHERE act.userId = :userId
  AND act.isRead = FALSE
ORDER BY act.createdAt DESC
LIMIT 50;
```

---

### AN.2 Get Unread Notification Count

**Purpose**: Badge count for notification icon

```sql
SELECT COUNT(*) AS unreadCount
FROM Activity
WHERE userId = :userId
  AND isRead = FALSE;
```

---

### AN.3 Mark Notification as Read

**Purpose**: Update single notification status

```sql
UPDATE Activity
SET isRead = TRUE
WHERE activityId = :activityId
  AND userId = :userId;
```

---

### AN.4 Mark All Notifications as Read

**Purpose**: Clear all notifications

```sql
UPDATE Activity
SET isRead = TRUE
WHERE userId = :userId
  AND isRead = FALSE;
```

---

### AN.5 Get All Notifications (Paginated)

**Purpose**: Full notification history

```sql
SELECT 
    act.activityId,
    act.type,
    act.isRead,
    act.createdAt,
    a.artworkId,
    a.title AS artworkTitle,
    a.imageUrl AS artworkImage,
    auc.auctionId,
    b.bidAmount,
    trigger_user.username AS triggeredByUsername,
    trigger_user.displayName AS triggeredByName,
    trigger_user.avatarUrl AS triggeredByAvatar
FROM Activity act
LEFT JOIN Artwork a ON act.artworkId = a.artworkId
LEFT JOIN Auction auc ON act.auctionId = auc.auctionId
LEFT JOIN Bid b ON act.bidId = b.bidId
LEFT JOIN User trigger_user ON act.triggeredByUserId = trigger_user.userId
WHERE act.userId = :userId
ORDER BY act.createdAt DESC
LIMIT :limit OFFSET :offset;
```

---

### AN.6 Delete Old Notifications

**Purpose**: Cleanup old read notifications

```sql
DELETE FROM Activity
WHERE userId = :userId
  AND isRead = TRUE
  AND createdAt < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

---

## Query Summary

### Query Count by Capability

| Capability | Section | Query Count |
|------------|---------|-------------|
| C1 | User Registration | 10 |
| C2 | Auction Creation | 8 |
| C3 | Search and Browse | 10 |
| C4 | Bidding System | 11 |
| E1 | Fixed-Price Purchase | 1 (multi-step) |
| E2 | Favorites/Likes | 6 |
| E3 | Dashboard & Stats | 3 |
| E4 | Artist Profiles | 2 |
| E5 | Watchlist | 9 |
| E6 | Collaborative Filtering | 5 |
| - | Balance Management | 4 |
| - | Transaction History | 3 |
| - | Activity & Notifications | 6 |
| **Total** | | **78** |

### Query Types Distribution

| Type | Count | Percentage |
|------|-------|------------|
| SELECT | 52 | 67% |
| INSERT | 15 | 19% |
| UPDATE | 9 | 12% |
| DELETE | 2 | 2% |

---

## Implementation Notes

### Prepared Statements
All queries should use prepared statements with parameterized values (`:paramName`) to prevent SQL injection.

### Transaction Handling
Multi-step operations (like placing bids, completing purchases) should be wrapped in database transactions:

```php
$pdo->beginTransaction();
try {
    // Execute multiple queries
    $pdo->commit();
} catch (Exception $e) {
    $pdo->rollBack();
    throw $e;
}
```

### Indexing Recommendations
Based on query patterns, ensure indexes exist on:
- `Artwork(category, listingType)`
- `Artwork(artistId)`, `Artwork(ownerId)`
- `Auction(status, endTime)`
- `Bid(auctionId, status)`
- `Bid(userId)`
- `Activity(userId, isRead)`
- `Watchlist(userId)`
- `Favorite(artworkId)`

### Scheduled Tasks
The following queries require cron jobs:
- E5.7: Auction ending soon notifications (every 15 minutes)
- C4.5-C4.7: Auction ending processing (every minute)
- AN.6: Old notification cleanup (daily)
