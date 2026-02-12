# EtherMon

EtherMon is a full-stack NFT marketplace for Pokemon-themed assets with both on-chain and off-chain capabilities:

- On-chain NFT minting and marketplace/auction state (Sepolia)
- Off-chain user/account systems (auth, balances, notifications, profile metadata)
- React frontend (Vite + TypeScript)
- Flask backend (SQLite + scheduled jobs)
- Hardhat smart contract workspace

This README is the authoritative setup + architecture guide for running and understanding the entire repository.

## Table of Contents

1. Overview
2. Repository Layout
3. Tech Stack
4. Prerequisites
5. Environment Variables
6. Local Setup (End-to-End)
7. Running Frontend, Backend, and Contracts
8. Testing
9. Architecture Documentation
10. API/Data Flow Notes
11. Recent Fixes Covered in This Session
12. Troubleshooting
13. Demo Link

note: Demo Video can be found below

## Overview

EtherMon combines:

- `on-chain` truth for NFT ownership, listing/auction status, highest bids
- `off-chain` UX and business logic for profiles, balances, notifications, activity feeds, wallet-linked identities, and search

### Core product flows

- Mint Pokemon NFTs (ERC721a contract)
- List NFTs for fixed-price sale or auction
- Place/update/cancel bids
- Track profile activity, bids, and owned/liked assets
- Upload and edit profile metadata (avatar/banner/social links)

## Repository Layout

```text
ethermon/
├── src/                         # Frontend app (React + Vite + TS)
│   ├── pages/                   # Route-level views (Index, ArtDetail, Profile, etc.)
│   ├── hooks/                   # Web3 + API-driven data hooks
│   ├── api/                     # Typed frontend API clients
│   ├── config/                  # Contract addresses, ABI, IPFS settings
│   ├── components/              # Reusable UI and domain components
│   └── context/                 # Session + wallet context
├── backend/                     # Flask backend
│   ├── app.py                   # Main app factory + most API endpoints
│   ├── db.py                    # SQLite init + runtime migrations
│   ├── routes/                  # Blueprint routes (auth/artworks)
│   ├── services/                # Business services (auctions, auth, email, notifications)
│   ├── repositories/            # Data access layer
│   ├── middleware/              # Error handling, rate limiting, etc.
│   ├── jobs/                    # Background processing logic
│   └── requirements.txt
├── smart_contracts/hardhat/     # Hardhat workspace (Solidity contracts + tests + deploy scripts)
│   ├── contracts/
│   ├── scripts/
│   ├── test/
│   └── hardhat.config.js
├── metadata-pokemon/            # Metadata assets used by NFT views
├── uploads/                     # Uploaded media (backend)
├── Documentation/               # Project docs + action notes
├── tests/                       # Backend pytest tests
└── README.md
```

## Tech Stack

### Frontend

- React 18, TypeScript, Vite
- TailwindCSS + Radix UI + shadcn patterns
- ethers v6 for blockchain calls
- TanStack Query for data caching

### Backend

- Flask 3
- SQLite (`auction.db`)
- APScheduler (auction processing)

### Smart Contracts

- Solidity contracts in Hardhat
- NFT + marketplace/auction contracts
- Unit tests and deploy scripts

## Prerequisites

Install these before setup:

- Node.js 18+ (20+ recommended)
- npm 9+
- Python 3.9+
- `pip`
- (Optional) a virtualenv tool
- (Optional for contract deployment) funded Sepolia wallet + Alchemy + Etherscan keys

## Environment Variables

### Frontend (`.env` in repository root)

```bash
VITE_API_BASE_URL=http://localhost:5001/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id_optional
VITE_IPFS_GATEWAY=https://your-preferred-ipfs-gateway.optional
```

Note:

- Frontend code falls back to `http://localhost:5002/api` if `VITE_API_BASE_URL` is not set.
- Backend default port is `5001`, so set `VITE_API_BASE_URL` explicitly to avoid mismatch.

### Backend (`.env` in repository root or backend working directory)

```bash
FLASK_SECRET_KEY=change-me
FLASK_DEBUG=true
FLASK_PORT=5001

# Optional backend config
DATABASE_PATH=auction.db
UPLOAD_FOLDER=uploads
SCHEDULER_INTERVAL_MINUTES=1
PLATFORM_FEE_RATE=0.025
```

### Hardhat (`smart_contracts/hardhat/.env`)

```bash
API_URL=https://eth-sepolia.g.alchemy.com/v2/your-key
PRIVATE_KEY=your_private_key_without_0x
ETHERSCAN_API_KEY=your_etherscan_key
```

## Local Setup (End-to-End)

### 1. Install frontend dependencies

From repo root:

```bash
npm install
```

### 2. Install backend dependencies

From repo root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 3. Initialize DB (if needed)

Database is auto-initialized on first backend run if missing. Manual init:

```bash
python -m backend.db
```

### 4. (Optional) Install contract dependencies

```bash
cd smart_contracts/hardhat
npm install
cd ../..
```

## Running Frontend, Backend, and Contracts

### Backend

From repo root:

```bash
source .venv/bin/activate
python -m backend.app
```

- Default port: `5001` (or `FLASK_PORT`)
- API base path: `/api`

### Frontend

From repo root:

```bash
npm run dev
```

- Default port: `5173`
- Set `VITE_API_BASE_URL=http://localhost:5001/api` to align with backend

### Production build preview

```bash
npm run build
npm run preview
```

### Local smart contracts (optional local chain)

From `smart_contracts/hardhat`:

```bash
npx hardhat node
# in a second terminal
npx hardhat run scripts/deploy.js --network localhost
```

### Sepolia deploy (optional)

From `smart_contracts/hardhat`:

```bash
npx hardhat run scripts/deploy_alchemy.js --network sepolia
```

After deployment, update:

- `src/config/contracts.ts`
- ABI files in `src/config/abi/` if contract interfaces changed

## Testing

### Frontend lint/build

```bash
npm run lint
npm run build
```

### Backend tests

From repo root with venv activated:

```bash
pytest tests/test_app.py
```

### Smart contract tests

From `smart_contracts/hardhat`:

```bash
npx hardhat test
```

## Architecture Documentation

## 1) High-level system

can be found in architecture.png in root folder (see image)

```text
[Browser / React App]
      │
      ├── HTTP (session cookies) ─────────────► [Flask API + SQLite]
      │                                          ├── auth / profiles / balances / notifications
      │                                          ├── artwork + auction endpoints
      │                                          └── APScheduler auction settlement job
      │
      └── RPC (ethers.js) ─────────────────────► [Sepolia Contracts]
                                                 ├── PokechainNFT
                                                 └── PokechainMarketplace
```

## 2) Frontend architecture

### Routing

Defined in `src/App.tsx`:

- `/` Home
- `/nft/:tokenId` NFT detail
- `/profile/:username` Profile
- `/search`, `/balance`, `/create`, `/settings`, `/auth`, etc.

### Data access strategy

- `src/api/*`: backend API clients using `apiFetch`
- `src/hooks/useNFTDetail.ts`: direct on-chain NFT detail + auction + bid history
- `src/hooks/useOnChainBids.ts`: wallet bid discovery from chain events + auction state
- `src/hooks/useWalletActivity.ts`: wallet activity feed

### Context and state

- `SessionContext`: authenticated user/account state
- `WalletContext`: connected wallet address/provider
- UI state primarily in page-level components with hooks

## 3) Backend architecture

### Composition

- App factory: `backend/app.py:create_app()`
- DB layer: `backend/db.py`
- Blueprints: `backend/routes/*`
- Services: `backend/services/*`
- Repositories: `backend/repositories/*`
- Middleware: error handling/rate limit/CORS logic in app + middleware modules

### Database

- SQLite at repository root: `auction.db`
- Runtime migrations in `backend/db.py` (`_ensure_runtime_migrations`)
- Schema source: `backend/schema_refactored.sql` (+ runtime migration safety)

### Background jobs

- APScheduler runs ended-auction processing every `SCHEDULER_INTERVAL_MINUTES`

## 4) Smart contract architecture

### Contracts

- `PokechainNFT.sol`: NFT contract
- `PokechainMarketplace.sol`: fixed-price + auction + bidding

### Frontend contract config

- Addresses + chain constants: `src/config/contracts.ts`
- ABIs: `src/config/abi/*.json`

### Authentication model

- Backend uses cookie-based session auth (`credentials: include` from frontend)
- Session-backed endpoints require login

### Hybrid source-of-truth model

- On-chain: ownership, auction state, highest bidder, bid transaction history
- Off-chain: user profiles, balances, notifications, uploads, search indexing

### Why this matters

Some profile-level features aggregate multiple sources:

- backend profile payloads
- `/api/me/*` endpoints
- on-chain hooks

## Demo Link
https://www.youtube.com/watch?v=L39Xi8qF9xo