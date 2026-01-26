# 🎮 Transforming ArtMart → PokéChain: Development Roadmap

## What We Have Now

| Layer | Current (ArtMart - Web2) | Tech |
|-------|--------------------------|------|
| **Frontend** | React + Vite + TailwindCSS | TypeScript |
| **Backend** | Flask + SQLite | Python |
| **Database** | `auction.db` (SQLite) | Artists, artworks, bids, auctions |
| **Smart Contracts** | `ProjectINO.sol` (ERC721A) | Minting, whitelist, withdraw |

---

## What Needs to Change

The existing contract is a **minting contract** for an INO (Initial NFT Offering). For a **trading marketplace**, we need:

### 1. New Trading Contract (Create from scratch)

`ProjectINO.sol` handles minting, but we need a **separate Marketplace contract** that:
- Lists NFTs for sale (fixed price)
- Lists NFTs for auction
- Handles escrow (holds NFT during auction)
- Processes purchases (transfers NFT + ETH)
- Implements `withdraw()` pattern for sellers to claim funds

```
NFT Contract (ProjectINO.sol)     Marketplace Contract (NEW)
       ↓                                  ↓
  Mints Pokémon NFTs            Handles listings, bids, trades
       ↓                                  ↓
       └──────── Both interact ──────────┘
```

### 2. Modify `ProjectINO.sol` for Pokémon

- Change name: `"Project INO"` → `"PokéChain"`
- Add Pokémon metadata structure (type, HP, attacks, rarity)
- Consider: Do users mint their own? Or do we pre-mint all cards?

---

## 3. Frontend Changes

| Current (ArtMart) | Change To (PokéChain) |
|-------------------|----------------------|
| Upload artwork image | Select Pokémon to mint (or show existing NFTs owned) |
| List artwork for sale | Call `Marketplace.listItem(tokenId, price)` |
| Place bid | Call `Marketplace.placeBid(tokenId)` payable |
| Buy now | Call `Marketplace.buyItem(tokenId)` payable |
| Wallet auth | Already needed - connect MetaMask |

**Add:**
- Wallet connection (ethers.js or wagmi)
- Read user's owned NFTs from the contract
- Display listings from Marketplace contract events

---

## 4. Backend Changes

The Flask backend currently stores everything in SQLite. For Web3:

| Keep in SQLite (Off-chain) | Move to Blockchain (On-chain) |
|---------------------------|------------------------------|
| User profiles, usernames | NFT ownership (ERC721) |
| Artwork descriptions | NFT metadata (IPFS or on-chain) |
| Chat/messages | - |
| **Caching/indexing** of on-chain data | Listings, bids, sales (smart contract) |

**The backend becomes an indexer:**
- Listen to contract events (`ItemListed`, `ItemSold`, `BidPlaced`)
- Cache on-chain data in SQLite for fast queries
- Serve the frontend (so it doesn't have to call the RPC constantly)

---

## 5. Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React App     │────▶│   Flask API      │────▶│   SQLite        │
│   (Frontend)    │     │   (Indexer)      │     │   (Cache)       │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │ ethers.js             │ web3.py (listen to events)
         ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Hardhat Blockchain                      │
│  ┌─────────────────┐        ┌─────────────────────────────────┐ │
│  │ PokéChain.sol   │        │ Marketplace.sol                 │ │
│  │ (ERC721A NFTs)  │◀──────▶│ (Listings, Auctions, Trades)    │ │
│  └─────────────────┘        └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Step-by-Step Execution Order

### Phase 1: Smart Contracts First
- [ ] Create `Marketplace.sol` (listings, bids, buys)
- [ ] Modify `ProjectINO.sol` → `PokemonNFT.sol` with Pokémon metadata
- [ ] Write tests in Hardhat
- [ ] Deploy scripts for local testnet

### Phase 2: Frontend Web3 Integration
- [ ] Add wallet connection (ethers.js / wagmi)
- [ ] Create contract hooks (read listings, place bid, buy)
- [ ] Replace API calls with contract calls for trading actions

### Phase 3: Backend as Indexer
- [ ] Add web3.py to listen to contract events
- [ ] Update SQLite schema (index tokenIds, events)
- [ ] Serve cached listings to frontend

### Phase 4: UI Reskin
- [ ] Replace "Artwork" terminology with "Pokémon Card"
- [ ] Update card designs to show Pokémon stats

---

## Existing NFT Contract Assessment

`ProjectINO.sol` has:
- ✅ ERC721A (gas-efficient batch minting)
- ✅ Merkle proof whitelist
- ✅ Reveal mechanism
- ✅ Withdraw function
- ❌ No transfer marketplace hooks
- ❌ No on-chain metadata (Pokémon stats)
- ❌ No trading/listing logic

**Verdict:** Keep it for minting, but need a new `Marketplace.sol` for trading.
