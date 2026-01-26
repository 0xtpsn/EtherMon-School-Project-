# ArtMart - Digital Art Marketplace

A full-stack digital art marketplace with auction capabilities, built with React, TypeScript, Flask, and SQLite.

## Features

- **Artwork Management**: Create, list, and manage digital artworks (fixed-price listings with optional expiry and auctions)
- **Auction System**: Time-limited auctions with reserve prices, quick bids, and automatic closing jobs
- **User Profiles**: Customizable artist/collector profiles, role-aware default bios, social links, and watchlists
- **Watchlist System**: Monitor auctions or fixed-price pieces, receive outbid/ending alerts, and manage favorites
- **Balance System**: Internal ledger for deposits, withdrawals, and automated refunds when auctions settle
- **Notifications**: In-app feed plus opt-in email notifications with per-type preferences (bid, sale, watchlist, etc.)
- **Search & Discovery**: Multi-view (card grid & analytics table) search with category/status/price filters, sorting, and shareable URLs
- **Role-Based Access Control**: Buyer, seller, and "both" roles with server-side enforcement on protected routes
- **Security & Account Recovery**: Password reset via email tokens, rate limiting, input validation, and session management

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS + shadcn/ui components
- React Router v6

**Backend:**
- Flask (Python) REST API
- SQLite database
- APScheduler for background jobs
- SMTP support for email notifications

## Prerequisites

- Node.js v18 or higher
- Python 3.8 or higher
- npm (comes with Node.js)
- pip (Python package manager)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/managerdotapp/art-offchain-avenue.git
cd art-offchain-avenue
```

### 2. Install Dependencies

**Frontend:**
```bash
npm install
```

**Backend:**
```bash
# Using pip directly
pip install -r backend/requirements.txt

# Or using a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
```

### 3. Initialize Database

```bash
python -m backend.db
```

To seed with sample data:
```bash
python -c "from backend.db import init_db; init_db(sample=True)"
```

### 4. Run the Application

**Terminal 1 - Backend:**
```bash
python -m backend.app
``` 
Backend runs at `http://localhost:5000`

**Terminal 2 - Frontend:**
```bash
npm run dev
```
Frontend runs at `http://localhost:5173`

## Environment Variables

**Frontend:**
- `VITE_API_BASE_URL` - API base URL (defaults to `http://localhost:5000/api`)

**Backend:**
- `FLASK_SECRET_KEY` - Secret key for sessions (defaults to `dev-secret-key`)
- `SMTP_HOST` - SMTP server hostname (optional, for email notifications)
- `SMTP_PORT` - SMTP port (defaults to 587)
- `SMTP_USER` - SMTP username (optional)
- `SMTP_PASSWORD` - SMTP password (optional)
- `SMTP_FROM` - From email address (optional)

See `SETUP_EMAIL.md` for detailed email configuration.

## API Documentation

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/session` - Get current session
- `POST /api/password/change` - Change password

### Artworks
- `GET /api/artworks` - List artworks (with filters)
- `GET /api/artworks/<id>` - Get artwork details
- `POST /api/artworks` - Create artwork (seller only)
- `PUT /api/artworks/<id>` - Update artwork
- `POST /api/artworks/<id>/list` - List artwork for sale/auction (supports fixed-price with expiry and timed auctions with reserve price)
- `POST /api/artworks/<id>/bids` - Place bid
- `POST /api/artworks/<id>/purchase` - Purchase artwork
- `POST /api/artworks/<id>/watch` - Toggle watchlist status

### Auctions
- `GET /api/auctions` - List auctions
- `GET /api/auctions/<id>` - Get auction details
- `POST /api/auctions` - Create auction
- `POST /api/auctions/<id>/bids` - Place bid on auction

### User & Profile
- `GET /api/me/profile` - Get own profile
- `GET /api/profiles/<identifier>` - Get user profile (includes watchlist_artworks for own profile)
- `PUT /api/me/profile` - Update profile
- `GET /api/me/auctions` - Get my auctions
- `GET /api/me/bids` - Get my bids

### Balance & Transactions
- `GET /api/balance` - Get balance
- `POST /api/deposits` - Make deposit
- `POST /api/withdrawals` - Request withdrawal
- `GET /api/transactions` - Get transaction history

### Other
- `GET /api/search?q=<query>` - Search artworks and users
- `GET /api/recommendations` - Get artwork recommendations
- `GET /api/notifications` - Get notifications
- `POST /api/notifications/mark-read` - Mark notification as read

## Testing

Run backend tests:
```bash
pytest tests/ -v
```

With coverage:
```bash
pytest tests/ --cov=backend --cov-report=html
```

## Project Structure

```
art-offchain-avenue/
├── backend/           # Flask backend
│   ├── routes/        # API route handlers
│   ├── services/      # Business logic
│   ├── repositories/  # Data access layer
│   ├── middleware/    # Auth, rate limiting, etc.
│   └── schema.sql     # Database schema
├── src/               # React frontend
│   ├── api/          # API client modules
│   ├── components/   # React components
│   ├── pages/        # Page components
│   └── context/      # React context providers
└── tests/            # Backend tests
```

## Documentation

- `ARCHITECTURE.md` - System architecture and design decisions
- `CHANGELOG.md` - Detailed changelog of all updates and features
- `ER_DIAGRAM.md` - Entity-Relationship diagram
- `SETUP_INSTRUCTIONS.md` - Detailed setup guide
- `SETUP_EMAIL.md` - Email configuration guide
- `CONTRIBUTING.md` - Development setup and contribution guidelines
- `backend/schema.sql` - Complete database schema

## License

This project is for educational purposes as part of a database systems course assignment.
