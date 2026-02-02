# Buyer & Seller Flow

## Overview

This document explains how buying and selling works on the PokechainMarketplace smart contract.

---

## Fixed-Price Sale Flow

### Step 1: Seller Lists NFT

```
Seller Action: listItem(tokenId, price)
```

| What Happens | Details |
|--------------|---------|
| Ownership check | Seller must own the NFT |
| Approval check | Marketplace must be approved to transfer |
| Listing created | Price and seller address stored |
| NFT stays with seller | No escrow - approval-based system |

---

### Step 2: Buyer Purchases NFT

```
Buyer Action: buyItem(tokenId) + sends ETH
```

**Transaction Flow:**

```
BUYER sends 1 ETH
        │
        ▼
┌───────────────────────────────────────┐
│  1. Listing deleted (security)        │
│  2. Calculate fee: 1 ETH × 2.5%       │
│     = 0.025 ETH                       │
│  3. Calculate seller proceeds:        │
│     = 1 ETH - 0.025 = 0.975 ETH       │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  TRANSFERS (atomic - all or nothing) │
├───────────────────────────────────────┤
│  → 0.025 ETH  →  Platform Wallet     │
│  → NFT        →  Buyer               │
│  → 0.975 ETH  →  Seller              │
└───────────────────────────────────────┘
```

---

### Result Summary

| Party | Before | After |
|-------|--------|-------|
| **Seller** | Owns NFT | Has 0.975 ETH (97.5%) |
| **Buyer** | Has 1 ETH | Owns NFT |
| **Platform** | - | Has 0.025 ETH (2.5% fee) |

---

## Auction Flow

### Step 1: Seller Creates Auction

```
Seller Action: createAuction(tokenId, startingPrice, duration)
```

- Duration: 1 hour to 7 days
- NFT stays with seller (no escrow)

### Step 2: Bidders Place Bids

```
Bidder Action: placeBid(tokenId) + sends ETH
```

- First bid must meet starting price
- Each new bid must exceed previous
- Outbid bidders get refunded to `pendingReturns`

### Step 3: Auction Ends

```
Anyone can call: endAuction(tokenId)
```

**Same fee split as fixed-price:**
- Winner gets NFT
- Seller gets 97.5% of winning bid
- Platform gets 2.5% fee (auto-sent)

---

## Key Security Features

| Feature | Purpose |
|---------|---------|
| **ReentrancyGuard** | Prevents attack during transfers |
| **Listing deleted first** | Can't buy same NFT twice |
| **Auto-send fees** | Fees never mix with bid deposits |
| **Atomic transfers** | All succeed or all revert |

---

## Code Reference

**Fixed-Price Buy:** `buyItem()` in `PokechainMarketplace.sol` (line 190)

**Auction End:** `endAuction()` in `PokechainMarketplace.sol` (line 296)
