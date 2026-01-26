// SPDX-License-Identifier: MIT
// ═══════════════════════════════════════════════════════════════════════════════
//                    POKECHAIN MARKETPLACE - IMPLEMENTATION PLAN
// ═══════════════════════════════════════════════════════════════════════════════
// 
// This document outlines the action plan for building the combined Trading + Auction
// marketplace contract for the PokéChain NFT project.
//
// ═══════════════════════════════════════════════════════════════════════════════

/*
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CONTRACT STRUCTURE                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

PokemonMarketplace.sol
├── Imports (OpenZeppelin)
│   ├── IERC721.sol          - Interface for NFT transfers
│   ├── ReentrancyGuard.sol  - Prevent reentrancy attacks
│   ├── Pausable.sol         - Emergency stop mechanism
│   └── Ownable.sol          - Admin access control
│
├── State Variables
│   ├── nftContract          - Reference to PokemonNFT contract
│   ├── platformFee          - Optional: % fee on sales (e.g., 2.5%)
│   ├── listings             - Mapping of tokenId => Listing struct
│   ├── auctions             - Mapping of tokenId => Auction struct
│   └── pendingReturns       - Mapping of address => ETH owed (outbid refunds)
│
├── Fixed-Price Functions
│   ├── listItem()           - Create a listing
│   ├── updateListing()      - Change price
│   ├── cancelListing()      - Remove listing
│   └── buyItem()            - Purchase at listed price
│
├── Auction Functions
│   ├── createAuction()      - Start an auction
│   ├── placeBid()           - Bid on an auction
│   ├── endAuction()         - Finalize when time expires
│   ├── cancelAuction()      - Cancel (only if no bids)
│   └── withdraw()           - Claim outbid refunds
│
└── Admin Functions
    ├── pause()              - Emergency stop
    ├── unpause()            - Resume operations
    └── setFee()             - Update platform fee


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 1: DATA STRUCTURES                               │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Define Listing struct:
    struct Listing {
        address seller;
        uint256 price;
        bool active;
    }

[ ] Define Auction struct:
    struct Auction {
        address seller;
        uint256 startingPrice;
        uint256 highestBid;
        address highestBidder;
        uint256 endTime;
        bool active;
        bool settled;          // Prevent double-settlement
    }

[ ] State mappings:
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Auction) public auctions;
    mapping(address => uint256) public pendingReturns;


┌─────────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 2: FIXED-PRICE SALES                                │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] listItem(uint256 tokenId, uint256 price)
    - Require: caller owns the NFT
    - Require: contract is approved to transfer
    - Require: not already listed or in auction
    - Store listing data
    - Emit: ItemListed(tokenId, seller, price)

[ ] cancelListing(uint256 tokenId)
    - Require: caller is the seller
    - Delete listing
    - Emit: ListingCancelled(tokenId)

[ ] updateListing(uint256 tokenId, uint256 newPrice)
    - Require: caller is the seller
    - Update price
    - Emit: ListingUpdated(tokenId, newPrice)

[ ] buyItem(uint256 tokenId) payable nonReentrant
    - Require: listing is active
    - Require: msg.value >= price
    - Delete listing FIRST (reentrancy guard pattern)
    - Transfer NFT: seller → buyer
    - Transfer ETH: buyer → seller (minus platform fee if any)
    - Refund excess ETH to buyer
    - Emit: ItemSold(tokenId, seller, buyer, price)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                            PHASE 3: AUCTIONS                                     │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] createAuction(uint256 tokenId, uint256 startingPrice, uint256 duration)
    - Require: caller owns NFT
    - Require: approved to transfer
    - Require: not already listed or in auction
    - Require: duration between 1 hour and 7 days
    - Store auction data with endTime = block.timestamp + duration
    - Emit: AuctionCreated(tokenId, seller, startingPrice, endTime)

[ ] placeBid(uint256 tokenId) payable nonReentrant
    - Require: auction is active
    - Require: auction not expired
    - Require: bid > highestBid (and >= startingPrice if first bid)
    - If previous bidder exists:
        pendingReturns[previousBidder] += previousBid
    - Update highestBid and highestBidder
    - Emit: BidPlaced(tokenId, bidder, amount)

[ ] endAuction(uint256 tokenId) nonReentrant
    - Require: auction exists and not settled
    - Require: block.timestamp >= endTime
    - Mark as settled
    - If there's a winner:
        - Transfer NFT: seller → winner
        - Transfer ETH: to seller (minus platform fee)
    - If no bids:
        - Just mark as ended, NFT stays with seller
    - Emit: AuctionEnded(tokenId, winner, winningBid)

[ ] cancelAuction(uint256 tokenId)
    - Require: caller is seller
    - Require: no bids placed yet (highestBidder == address(0))
    - Delete auction
    - Emit: AuctionCancelled(tokenId)

[ ] withdraw() nonReentrant
    - Get amount = pendingReturns[msg.sender]
    - Set pendingReturns[msg.sender] = 0 FIRST (reentrancy guard)
    - Transfer amount to caller
    - Emit: FundsWithdrawn(msg.sender, amount)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 4: SECURITY FEATURES                              │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] ReentrancyGuard
    - Apply `nonReentrant` modifier to: buyItem, placeBid, endAuction, withdraw
    - Critical for any function that transfers ETH

[ ] Pausable (Emergency Stop)
    - pause() - onlyOwner, stops all trading
    - unpause() - onlyOwner, resumes operations
    - Apply `whenNotPaused` to: listItem, buyItem, createAuction, placeBid

[ ] Access Control
    - onlyOwner for admin functions (pause, unpause, setFee)
    - Seller-only checks for cancel/update operations

[ ] Integer Overflow Protection
    - Solidity 0.8+ has built-in overflow checks ✓
    - No SafeMath needed

[ ] Checks-Effects-Interactions Pattern
    - Always update state BEFORE external calls
    - Example: delete listing before transferring ETH


┌─────────────────────────────────────────────────────────────────────────────────┐
│                             PHASE 5: EVENTS                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Define all events for frontend/indexer:

event ItemListed(uint256 indexed tokenId, address indexed seller, uint256 price);
event ListingCancelled(uint256 indexed tokenId);
event ListingUpdated(uint256 indexed tokenId, uint256 newPrice);
event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);

event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 startingPrice, uint256 endTime);
event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount);
event AuctionEnded(uint256 indexed tokenId, address winner, uint256 amount);
event AuctionCancelled(uint256 indexed tokenId);

event FundsWithdrawn(address indexed user, uint256 amount);


┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 6: TESTING                                       │
└─────────────────────────────────────────────────────────────────────────────────┘

[ ] Unit Tests (Hardhat/Chai):
    - List and buy flow
    - List and cancel flow
    - Auction create, bid, end flow
    - Auction with no bids
    - Outbid refund withdrawal
    - Reentrancy attack test
    - Pause/unpause test
    - Unauthorized access tests

[ ] Edge Cases:
    - Buying unlisted item (should revert)
    - Bidding on expired auction (should revert)
    - Ending auction early (should revert)
    - Double-ending auction (should revert)


┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION ORDER                                         │
└─────────────────────────────────────────────────────────────────────────────────┘

1. [ ] Create contract skeleton with imports and state variables
2. [ ] Implement Fixed-Price: listItem, cancelListing, buyItem
3. [ ] Write tests for Fixed-Price
4. [ ] Implement Auctions: createAuction, placeBid, endAuction, withdraw
5. [ ] Write tests for Auctions
6. [ ] Add Pausable emergency stop
7. [ ] Add platform fee logic (optional)
8. [ ] Final security review
9. [ ] Deploy script for local Hardhat network

*/
