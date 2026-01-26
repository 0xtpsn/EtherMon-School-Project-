
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


I have some questions:
1) For the marketplace contract, when a user list NFTs for sale, the NFTs will be transferred to the marketplace as a deposit (the seller can click cancel from our frontend and receive their NFT back but needs to pay the gas fee) and when the user lists the item for sale, the seller will pay the gas fee to transfer the NFT to the marketplace. If the item gets sold, the seller will receive the ETH and the buyer will receive the NFT. The ETH will be directly sent into the seller's wallet. This is what basically Opensea or Blur does. 
2) List for Auction - Lets do the same flow for what Opensea does in the backend in their contract and on their site
3) I'm not sure if Opensea holds the NFT in the contract or what
4) Does Opensea processes the NFT + ETH? We should probably follow whatever Opensea has going on already for the Trading Contract
5) I'm not sure if Opensea has a withdraw functions for sellers to claim funds since whenever trading occurs, it just goes direct to user's wallet instead of users having to interact with the contract (i might be wrong). But we can have a withdraw function just in case if anything occurs. 