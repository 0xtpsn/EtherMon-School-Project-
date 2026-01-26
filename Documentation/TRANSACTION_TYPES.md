# Transaction Types in ArtMart Database

This document lists all transaction activity types currently set up in the `transactions` table.

## Database Schema

The `transactions` table has the following structure:
- `id` (INTEGER PRIMARY KEY)
- `user_id` (INTEGER, FK → users.id)
- `type` (TEXT NOT NULL) - **Transaction type**
- `amount` (REAL NOT NULL)
- `status` (TEXT NOT NULL) - **Transaction status** (`pending`, `completed`, `cancelled`)
- `description` (TEXT)
- `artwork_id` (INTEGER, FK → artworks.id, nullable)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

---

## Transaction Types

### 1. **`deposit`**
- **Purpose**: User adds funds to their wallet
- **Status**: `completed`
- **Description**: "Manual deposit"
- **Artwork ID**: `NULL`
- **Balance Impact**: Increases `available_balance`
- **Location**: `backend/app.py` - `/api/deposits` endpoint (line ~2066)

### 2. **`withdrawal`**
- **Purpose**: User withdraws funds from their wallet
- **Status**: `pending` (initially)
- **Description**: "Manual withdrawal"
- **Artwork ID**: `NULL`
- **Balance Impact**: Moves funds from `available_balance` to `pending_balance`
- **Location**: `backend/app.py` - `/api/withdrawals` endpoint (line ~2097)

### 3. **`bid`**
- **Purpose**: User places a bid on an auction
- **Status**: `pending` (funds on hold until auction ends)
- **Description**: "Bid placed"
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Moves funds from `available_balance` to `pending_balance`
- **Location**: `backend/app.py` - `place_bid_on_artwork` function (line ~1688)
- **Note**: Status changes to `completed` when user wins auction, or `cancelled` when auction ends and user loses

### 4. **`bid_increase`**
- **Purpose**: User increases their existing bid amount
- **Status**: `pending` (funds on hold until auction ends)
- **Description**: "Bid increased"
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Moves additional funds from `available_balance` to `pending_balance`
- **Location**: `backend/app.py` - `place_bid_on_artwork` function (line ~1639)
- **Note**: Status changes to `completed` when user wins auction, or `cancelled` when auction ends and user loses

### 5. **`bid_decrease`**
- **Purpose**: User decreases their existing bid amount (via bid update)
- **Status**: `completed`
- **Description**: "Bid amount adjusted"
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Returns excess funds from `pending_balance` to `available_balance`
- **Location**: `backend/app.py` - `update_bid` function (line ~1845)

### 6. **`bid_refund`**
- **Purpose**: Refund bid funds when auction is cancelled or user loses auction
- **Status**: `completed`
- **Description**: 
  - "Auction cancelled - bid refunded" (when auction cancelled)
  - "Auction ended - bid refunded" (when user loses auction)
  - "Bid cancelled" (when user manually cancels bid)
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Moves funds from `pending_balance` back to `available_balance`
- **Location**: 
  - `backend/app.py` - `refund_active_bids` function (line ~117)
  - `backend/app.py` - `cancel_bid` endpoint (line ~1888)
  - `backend/services/auction_service.py` - `process_ended_auction` (line ~247)

### 7. **`purchase`**
- **Purpose**: User purchases an artwork (direct purchase or auction win)
- **Status**: `completed`
- **Description**: 
  - "Artwork purchase" (direct purchase)
  - "Auction won" (auction purchase)
  - "Offer accepted - Artwork purchase" (offer acceptance)
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Deducts full purchase amount from buyer's `available_balance` (or `pending_balance` for offers)
- **Location**: 
  - `backend/app.py` - `purchase_artwork` endpoint (line ~1399)
  - `backend/app.py` - `_process_ended_auction` function (line ~273)
  - `backend/routes/artworks.py` - `accept_offer` function (line ~368)
  - `backend/services/auction_service.py` - `process_ended_auction` (line ~158)

### 8. **`sale`**
- **Purpose**: Seller receives payment for artwork sale
- **Status**: `completed`
- **Description**: 
  - "Artwork sold" (direct sale)
  - "Auction sold" (auction sale)
  - "Offer accepted - Artwork sold" (offer acceptance)
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Adds sale amount (after 2.5% platform fee) to seller's `available_balance`
- **Location**: 
  - `backend/app.py` - `purchase_artwork` endpoint (line ~1407)
  - `backend/app.py` - `_process_ended_auction` function (line ~281)
  - `backend/routes/artworks.py` - `accept_offer` function (line ~375)
  - `backend/services/auction_service.py` - `process_ended_auction` (line ~166)

### 9. **`offer`** ⚠️ **NOT CURRENTLY IMPLEMENTED**
- **Purpose**: User submits an offer on an unlisted artwork (funds should be on hold)
- **Status**: Should be `pending` (funds on hold)
- **Description**: "Offer placed on artwork - funds on hold"
- **Artwork ID**: Set to artwork ID
- **Balance Impact**: Should move funds from `available_balance` to `pending_balance`
- **Location**: **Missing** - Should be in `backend/routes/artworks.py` - `submit_offer` function (line ~217)
- **Current State**: The `submit_offer` function only creates an `activity` record with `activity_type='offer'` but does NOT create a transaction record or move funds to `pending_balance`
- **Note**: This functionality was mentioned in the summary but is not currently implemented in the codebase

---

## Transaction Status Values

### `pending`
- Transaction is in progress
- Funds are on hold (`pending_balance`)
- Used for: `bid`, `bid_increase`, `offer`, `withdrawal`

### `completed`
- Transaction has finished successfully
- Funds have been transferred
- Used for: `deposit`, `bid_refund`, `bid_decrease`, `purchase`, `sale`

### `cancelled`
- Transaction was cancelled/refunded
- Funds have been returned
- Used for: `bid`, `bid_increase`, `offer` (when auction ends and user loses, or offer is declined/cancelled)

---

## Transaction Flow Examples

### Auction Bid Flow:
1. User places bid → `bid` transaction (`pending`) → funds move to `pending_balance`
2. User increases bid → `bid_increase` transaction (`pending`) → additional funds to `pending_balance`
3. **If user wins:**
   - `bid` and `bid_increase` transactions → status changes to `completed`
   - `purchase` transaction (`completed`) → funds deducted from `pending_balance`
   - `sale` transaction (`completed`) → seller receives payment
4. **If user loses:**
   - `bid` and `bid_increase` transactions → status changes to `cancelled`
   - `bid_refund` transaction (`completed`) → funds returned to `available_balance`

### Offer Flow (Expected):
1. User submits offer → `offer` transaction (`pending`) → funds move to `pending_balance`
2. **If accepted:**
   - `offer` transaction → status changes to `completed`
   - `purchase` transaction (`completed`) → funds deducted from `pending_balance`
   - `sale` transaction (`completed`) → seller receives payment
3. **If declined/cancelled:**
   - `offer` transaction → status changes to `cancelled`
   - Funds returned to `available_balance`

### Direct Purchase Flow:
1. User purchases artwork → `purchase` transaction (`completed`) → funds deducted from `available_balance`
2. Seller receives payment → `sale` transaction (`completed`) → funds added to seller's `available_balance`

---

## Notes

1. **Platform Fee**: All `sale` transactions reflect the amount after a 2.5% platform fee deduction
2. **Balance Tracking**: The `balances` table tracks `available_balance` and `pending_balance` separately
3. **Transaction Linking**: Some transactions are linked to activity records via `transaction_id` in the `activity` table
4. **Auction ID**: Bid-related transactions may have an `auction_id` (via JOIN with `auctions` table) for reference

---

## Frontend Display

Transaction types are displayed in `src/pages/Balance.tsx` with user-friendly labels:
- `deposit` → "Deposit"
- `withdrawal` → "Withdrawal"
- `bid` → "Auction Bid"
- `bid_refund` → "Bid Refunded"
- `bid_increase` → "Bid Updated"
- `bid_decrease` → "Bid Reduced"
- `purchase` → "Artwork Purchased"
- `sale` → "Artwork Sold"
- `offer` → "Offer Placed" (if implemented)

