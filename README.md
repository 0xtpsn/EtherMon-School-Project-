# PokéChain - Decentralized Pokémon NFT Trading Platform

A Web3 marketplace for trading Pokémon NFTs with fixed-price sales and auctions.

## 🚀 Quick Start

```bash
# Clone and install
cd smart_contracts/hardhat
npm install

# Run tests
npx hardhat test

# Start local blockchain
npx hardhat node

# Deploy contracts (in new terminal)
npx hardhat run scripts/deploy.js --network localhost
```

## 📁 Project Structure

```
ethermon/
├── smart_contracts/hardhat/
│   ├── contracts/
│   │   ├── PokechainNFT.sol         # ERC721A NFT contract
│   │   ├── PokechainMarketplace.sol # Trading + Auction contract
│   │   ├── ERC721A/                 # Gas-optimized NFT standard
│   │   ├── access/Ownable.sol       # Access control
│   │   └── utils/                   # ReentrancyGuard, Strings
│   ├── test/                        # 75 comprehensive tests
│   └── scripts/                     # Deployment scripts
├── metadata-pokemon/
│   ├── images/                      # 1025 Pokémon images
│   └── metadata/                    # OpenSea-format JSON files
└── frontend/                        # React + Vite application
```

## 🔗 Smart Contracts

### PokechainNFT.sol
| Feature | Implementation |
|---------|---------------|
| Standard | ERC721A (gas-optimized) |
| Supply | 1,025 (one per Pokémon) |
| Mint Price | 0.01 ETH |
| Per Wallet | Max 50 mints |
| Randomization | Blind box (Pokémon assigned on mint) |

**Key Functions:**
- `mint(quantity)` - Mint NFTs (when sale active)
- `toggleSale()` - Owner enables/disables minting
- `withdraw()` - Owner withdraws funds
- `getPokemonId(tokenId)` - Get assigned Pokémon

### PokechainMarketplace.sol
| Feature | Implementation |
|---------|---------------|
| Fixed-Price | List, buy, cancel, update listings |
| Auctions | Create, bid, end, cancel auctions |
| Platform Fee | 2.5% (configurable, max 10%) |
| Security | ReentrancyGuard, Pausable |

**Key Functions:**
- `listItem(tokenId, price)` - List for fixed price
- `buyItem(tokenId)` - Purchase listed NFT
- `createAuction(tokenId, startingPrice, duration)` - Start auction
- `placeBid(tokenId)` - Place bid on auction
- `endAuction(tokenId)` - Finalize auction
- `withdraw()` - Claim outbid refunds
- `getTokenStatus(tokenId)` - Check if listed/auctioned

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| Reentrancy Protection | `ReentrancyGuard` on all payable functions |
| Access Control | `Ownable` + custom modifiers |
| Overflow Protection | Solidity 0.8.14 built-in checks |
| Emergency Stop | `togglePause()` freezes marketplace |
| Pull Payment | Outbid funds in `pendingReturns`, users call `withdraw()` |
| Event Emission | All state changes emit events |

## 🧪 Testing

```bash
# Run all unit tests (81 tests)
npx hardhat test

# Run specific test file
npx hardhat test test/PokechainNFT.test.js
npx hardhat test test/PokechainMarketplace.test.js

# Run visual workflow demo
npx hardhat run scripts/test-workflow.js

# With gas reporting
REPORT_GAS=true npx hardhat test
```

**Test Coverage:**
- PokechainNFT: 32 tests
- PokechainMarketplace: 49 tests
- **Total: 81 unit tests**
- **Workflow Demo: 18 step-by-step scenarios**

## 📦 Metadata

All 1,025 Pokémon with OpenSea-compatible metadata:

```json
{
  "name": "Pikachu #25",
  "description": "Electric-type Pokémon from the Pokechain Collection",
  "image": "ipfs://bafybeiffqjps.../25.png",
  "attributes": [
    {"trait_type": "Type", "value": "Electric"},
    {"trait_type": "HP", "value": 35},
    {"trait_type": "Attack", "value": 55},
    {"trait_type": "Rarity", "value": "Uncommon"}
  ]
}
```

**IPFS Links:**
- Images: `bafybeiffqjpsyrwztgockxr43nkgw4sc3llpxgt3tmqdblgh4shajeccvm`
- Metadata: `bafybeienzjyalm2axjk3gx75mcrbjjjv2ej3j5guoaeddjifgryheut57m`

## 🛠️ Development

**Requirements:**
- Node.js v18+
- npm or yarn

**Environment:**
```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run local node
npx hardhat node

# Deploy to local
npx hardhat run scripts/deploy.js --network localhost
```

## 📄 License

MIT

## 👥 Team

[Your names here]

---

Built with Hardhat, ERC721A, and ❤️
