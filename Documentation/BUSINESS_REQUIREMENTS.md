# ArtMart - Business Requirements Document

## Table of Contents
1. [Business Requirements](#1-business-requirements)
2. [Assumptions](#2-assumptions)
3. [Functionalities](#3-functionalities)
4. [Additional Technical Details](#4-additional-technical-details)

---

## 1. Business Requirements

### 1.1 Core Business Model
- **Platform Type**: Digital art marketplace connecting artists (sellers) and collectors (buyers)
- **Revenue Model**: Platform fee of 2.5% deducted from seller proceeds on all sales
- **Listing Types**: 
  - Fixed-price listings (immediate purchase)
  - Timed auctions (competitive bidding)
- **Payment System**: Internal balance system for transactions (no external payment integration)

### 1.2 User Management Requirements
- **Registration**: Users must register with unique username and email
- **User Roles**: Two roles - `buyer` and `seller` (enforced at database level)
  - Sellers can create artworks
  - Buyers can purchase/bid on artworks
  - Users can perform both roles (buyer and seller)
- **Profile Customization**: 
  - Display name, bio, avatar, banner
  - Social links (Twitter, Instagram, website)
  - Contact email (optional, privacy-controlled)
- **Authentication**:
  - Password reset via email token
  - Session-based authentication with secure password hashing
  - Google OAuth support (optional)

### 1.3 Artwork Management Requirements
- **Artwork Creation** (Sellers only):
  - Title, description, category, image upload (max 10MB)
  - Supported formats: JPG, PNG, GIF, SVG, WEBP
- **Ownership Tracking**:
  - `artist_id`: Original creator (immutable)
  - `owner_id`: Current owner (transfers on sale)
- **Listing Options**:
  - Display only (not for sale)
  - Listed as fixed price
  - Listed as timed auction
- **Fixed-Price Listings**:
  - Optional expiry dates (24 hours to 30 days, or never)
  - Automatic delisting if not purchased by expiry
- **Artwork Editing**:
  - Artists can edit artwork details (title, description, price) if not sold
  - Price limit: maximum $1,000,000 per artwork

### 1.4 Auction System Requirements
- **Auction Constraints**:
  - One active auction per artwork (enforced by UNIQUE constraint)
  - Fixed end time (no extensions)
- **Auction Parameters**:
  - Start price (required, minimum $0.01)
  - Reserve price (optional, must be >= start price)
  - Duration: 6 hours to 7 days
- **Auction Processing**:
  - Automatic processing: background job processes ended auctions every 5 minutes
  - Winner determination: highest active bid at auction end time
  - Reserve price enforcement: if final bid < reserve price, sale does not complete
- **Auction Cancellation**:
  - Seller can cancel auction
  - All bids refunded automatically

### 1.5 Bidding Requirements
- **Bid Rules**:
  - Minimum bid increment: $1 above current bid
  - One active bid per user per auction (new bid replaces previous)
  - Users cannot bid on their own auctions
  - Balance requirement: sufficient available balance to place bid
- **Bid Features**:
  - Bid expiration: optional expiry (30 mins to 3 days, or until auction ends)
  - Bid visibility: all bids are publicly visible
  - Bid history: complete audit trail maintained

### 1.6 Balance & Transaction Requirements
- **Balance System**:
  - Internal ledger system (no external payment integration)
  - Balance components:
    - `available_balance`: Funds available for bidding/purchasing
    - `pending_balance`: Funds locked in active bids
- **Transaction Types**:
  - `deposit`: Add funds to balance
  - `withdrawal`: Request funds withdrawal
  - `purchase`: Direct artwork purchase
  - `sale`: Artwork sold (seller receives payment)
  - `bid`: Funds locked when placing bid
  - `bid_refund`: Refund when outbid or auction cancelled
- **Automatic Balance Management**:
  - Bids lock funds in pending balance
  - Winning bid: pending → spent, ownership transfers
  - Losing bids: pending → available (refunded)
  - Sales: payment added to seller's available balance (minus 2.5% platform fee)

### 1.7 Search & Discovery Requirements
- **Search Functionality**:
  - Search artworks and users by keyword
  - Real-time search with debouncing
- **Filtering Options**:
  - Category (Photography, Digital Art, Painting, Illustration, 3D Art, Pixel Art, Generative, etc.)
  - Listing status (all, listed, auctions, unlisted)
  - Price range (min/max)
- **Sorting Options**:
  - Newest/Oldest
  - Price: Low to High / High to Low
  - Alphabetical (A-Z / Z-A)
- **View Modes**:
  - Grid view (card layout)
  - Table view (analytics layout with detailed information)
- **Shareable URLs**: Search URLs with filter parameters can be shared

### 1.8 Notification Requirements
- **Notification Types**:
  - In-app notifications for all relevant events
  - Email notifications (optional, user-configurable)
- **Notification Categories**:
  - `bid`: Bid placed, outbid, bid refunded
  - `sale`: Artwork sold, payment received
  - `like`: Someone liked your artwork
  - `watchlist_outbid`: New bid on watched artwork
  - `watchlist_ending`: Watched auction ending soon
  - `auction_sold`: Auction sold, payment received
  - `auction_won`: Auction won, ownership transferred
- **User Preferences**:
  - Per-type notification preferences (users can enable/disable each type)
  - Email delivery via SMTP (Resend API support)

### 1.9 User Interaction Requirements
- **Favorites System**:
  - Users can like/bookmark artworks
  - Public favorites count displayed on artworks
- **Watchlist System**:
  - Users can watch auctions/fixed-price listings
  - Drag-and-drop reordering (own watchlist)
  - Notifications for outbid and ending soon
- **Activity Feed**:
  - Public activity log (bids, purchases, sales)
  - Paginated display
- **Price History**:
  - Historical price records for artworks
  - Tracks all sales and listing prices
- **View Tracking**:
  - Unique views per user per day
  - Total view count displayed

### 1.10 Security Requirements
- **Password Security**:
  - Werkzeug secure password hashing
  - Password length validation (minimum requirements)
- **Rate Limiting**:
  - Per-endpoint rate limiting (registration, login, password reset)
  - Configurable limits per IP/user
- **Input Validation**:
  - Comprehensive validation on all inputs
  - Email format validation
  - Username format validation (alphanumeric + underscores, 3-30 chars)
- **SQL Injection Prevention**:
  - Parameterized queries throughout
- **Session Management**:
  - Flask secure sessions
  - Session timeout handling
- **CORS**:
  - Configured for frontend-backend communication
- **File Upload Security**:
  - File type validation (whitelist approach)
  - File size limits (10MB max)

---

## 2. Assumptions

### 2.1 Technical Assumptions
- **Database**: SQLite database (single-file, suitable for development/small-scale production)
- **Payment Integration**: No external payment gateway integration (internal balance system only)
- **Email Service**: SMTP server available (Resend API supported)
- **File Storage**: Local filesystem (`uploads/` directory)
- **Background Jobs**: APScheduler for auction processing
- **Architecture**: Frontend-backend separation (React frontend, Flask REST API backend)

### 2.2 Business Assumptions
- Users understand digital art marketplace concepts
- Platform fee (2.5%) is acceptable to sellers
- Internal balance system is sufficient (no real money transactions)
- Auction durations are fixed (no extensions or "going once, going twice" mechanics)
- Reserve prices are optional but binding when set
- One artwork = one active auction (no multiple simultaneous auctions)

### 2.3 User Behavior Assumptions
- Users will maintain sufficient balance for bidding
- Users understand bid expiration mechanics
- Users will check notifications regularly
- Artists will provide accurate artwork information
- Buyers will respect auction end times

### 2.4 Data Assumptions
- Artwork images are digital files (not physical art)
- Ownership transfers are immediate and irreversible
- Price history is maintained for audit purposes
- Activity logs are permanent (no deletion)
- User data is retained for historical purposes

### 2.5 Operational Assumptions
- Background job runs reliably (5-minute intervals)
- Database backups are handled externally
- Email delivery is reliable (SMTP server availability)
- File uploads are stored permanently (no automatic cleanup)
- System uptime is sufficient for auction processing

---

## 3. Functionalities

### 3.1 Authentication & User Management
- ✅ User registration (username, email, password, role)
- ✅ User login (email/username + password)
- ✅ Google OAuth login (optional)
- ✅ Password reset via email token
- ✅ Password change (authenticated users)
- ✅ Session management (get current session)
- ✅ User logout

### 3.2 Artwork Management
- ✅ Create artwork (sellers only)
- ✅ Upload artwork image (drag-and-drop or file picker)
- ✅ List artwork for sale (fixed price or auction)
- ✅ Update artwork details (title, description, price)
- ✅ Delist artwork (remove from sale)
- ✅ View artwork details (with full information)
- ✅ Browse artworks (homepage with categories)
- ✅ View trending artworks (based on views, likes, activity)
- ✅ View artwork recommendations (personalized suggestions)

### 3.3 Auction Management
- ✅ Create auction (with start price, reserve price, duration)
- ✅ View active auctions (live auctions page)
- ✅ View auction details (bids, end time, current bid)
- ✅ Cancel auction (seller only, refunds all bids)
- ✅ Automatic auction processing (background job)
- ✅ Auction winner determination (highest bid at end time)
- ✅ Reserve price enforcement

### 3.4 Bidding System
- ✅ Place bid on auction
- ✅ Update existing bid (increase amount)
- ✅ View bid history (all bids on an auction)
- ✅ Bid expiration management (optional expiry times)
- ✅ Automatic bid refunds (when outbid or auction cancelled)
- ✅ Bid validation (minimum increment, balance check)

### 3.5 Purchase System
- ✅ Direct purchase (fixed-price listings)
- ✅ Purchase confirmation dialog
- ✅ Balance validation (sufficient funds check)
- ✅ Automatic ownership transfer
- ✅ Transaction recording
- ✅ Platform fee calculation and deduction

### 3.6 Balance Management
- ✅ View balance (available, pending, totals)
- ✅ Deposit funds (add to balance)
- ✅ Request withdrawal (remove from balance)
- ✅ View transaction history (all transactions)
- ✅ Balance updates (automatic on bids, purchases, sales)
- ✅ Transaction status tracking (completed, pending, failed, cancelled)

### 3.7 Search & Discovery
- ✅ Search artworks (keyword search)
- ✅ Search users (keyword search)
- ✅ Filter artworks (category, status, price range)
- ✅ Sort artworks (newest, price, alphabetical)
- ✅ Grid view (card layout)
- ✅ Table view (analytics layout)
- ✅ Shareable search URLs
- ✅ Real-time search with debouncing

### 3.8 User Profiles
- ✅ View profile (own or other users)
- ✅ Edit profile (display name, bio, social links, avatar, banner)
- ✅ View owned artworks (with filtering: all, listed, unlisted, auction)
- ✅ View liked artworks
- ✅ View watchlist (with drag-and-drop reordering)
- ✅ View activity feed (bids, purchases, sales)
- ✅ View bid history (all user's bids)
- ✅ View created artworks count

### 3.9 Notifications
- ✅ View notifications (in-app notification feed)
- ✅ Mark notification as read
- ✅ Notification preferences (enable/disable per type)
- ✅ Email notifications (optional, per preference)
- ✅ Notification bell (unread count indicator)
- ✅ Notification filtering and pagination

### 3.10 User Interactions
- ✅ Like/unlike artwork (favorites)
- ✅ Add/remove from watchlist
- ✅ Share artwork (copy link to clipboard)
- ✅ View artwork activity (bids, purchases, sales)
- ✅ View price history (historical prices)
- ✅ View artwork views count

### 3.11 Settings
- ✅ Profile settings (edit profile information)
- ✅ Notification preferences (per-type toggles)
- ✅ Password change
- ✅ Account security settings
- ✅ Privacy settings (show/hide contact email)

### 3.12 Background Jobs
- ✅ Auction processing (every 5 minutes)
- ✅ Automatic auction closure
- ✅ Winner determination
- ✅ Balance updates
- ✅ Ownership transfers
- ✅ Notification sending
- ✅ Bid refund processing

---

## 4. Additional Technical Details

### 4.1 Database Design
- **Normalization**: Third Normal Form (3NF) compliant schema
- **Computed Values**: 
  - `current_bid` and `highest_bidder_id` calculated dynamically from bids table
  - `total_earned` and `total_spent` calculated from transactions table
- **Foreign Key Constraints**: 
  - CASCADE for dependent records (bids, favorites, watchlist)
  - RESTRICT for critical relationships (users → artworks)
- **Indexes**: Performance optimization for common queries
- **Views**: Convenience queries for computed values

### 4.2 API Architecture
- **Design Pattern**: RESTful API design
- **Data Format**: JSON request/response format
- **Error Handling**: Appropriate HTTP status codes with error messages
- **Rate Limiting**: Applied on sensitive endpoints
- **Request Validation**: Middleware for input validation
- **Layered Architecture**:
  - Routes (thin controllers)
  - Services (business logic)
  - Repositories (data access)
  - Database (SQLite)

### 4.3 Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Architecture**: Component-based architecture
- **Routing**: React Router for navigation
- **Data Fetching**: React Query for API calls
- **State Management**: Context API for session management
- **UI Components**: shadcn/ui component library
- **Styling**: Tailwind CSS
- **Responsive Design**: Mobile-friendly responsive design

### 4.4 Security Features
- **Authentication**: Session-based with secure password hashing
- **Authorization**: Role-based access control (buyer/seller)
- **Input Sanitization**: Comprehensive validation and sanitization
- **SQL Injection Prevention**: Parameterized queries
- **XSS Prevention**: React's built-in XSS protection
- **CSRF Protection**: Session-based CSRF protection
- **File Upload Security**: Type and size validation

### 4.5 Performance Considerations
- **Database Indexing**: Strategic indexes on frequently queried columns
- **Query Optimization**: Efficient SQL queries with proper joins
- **Caching**: React Query caching for API responses
- **Lazy Loading**: Component lazy loading where appropriate
- **Image Optimization**: Efficient image handling and storage

### 4.6 Scalability Considerations
- **Database**: SQLite suitable for small to medium scale
- **File Storage**: Local filesystem (can be migrated to cloud storage)
- **Background Jobs**: APScheduler for reliable job processing
- **API Design**: Stateless REST API for horizontal scaling potential

---

## 5. Business Rules Summary

### 5.1 Artwork Rules
1. Only sellers can create artworks
2. Artwork price cannot exceed $1,000,000
3. Artwork ownership transfers immediately upon sale
4. Artist ID is immutable (original creator always tracked)
5. Artworks can be delisted at any time by owner

### 5.2 Auction Rules
1. One active auction per artwork maximum
2. Auction end time is fixed (no extensions)
3. Reserve price must be >= start price
4. Auction can be cancelled by seller (all bids refunded)
5. Winner is highest bidder at auction end time
6. If final bid < reserve price, sale does not complete

### 5.3 Bidding Rules
1. Minimum bid increment: $1 above current bid
2. Users cannot bid on their own auctions
3. One active bid per user per auction
4. New bid replaces previous bid from same user
5. Bids require sufficient available balance
6. Bids can have optional expiration times

### 5.4 Balance Rules
1. Available balance required for purchases and bids
2. Bids lock funds in pending balance
3. Winning bids: pending → spent
4. Losing bids: pending → available (refunded)
5. Platform fee (2.5%) deducted from seller proceeds
6. All transactions are recorded in transaction history

### 5.5 User Rules
1. Username must be unique
2. Email must be unique
3. Users can have both buyer and seller roles
4. Profile information is publicly visible
5. Contact email visibility is user-controlled

---

## 6. Future Enhancements (Not Currently Implemented)

### 6.1 Potential Features
- Two-factor authentication (2FA) - infrastructure ready in schema
- Artwork bundles/collections functionality
- Advanced analytics dashboard
- Social features (following, messaging)
- Review and rating system
- Escrow system for high-value transactions
- Multiple currency support
- Mobile app (iOS/Android)

### 6.2 Technical Improvements
- Migration to PostgreSQL for production scale
- Cloud storage integration (AWS S3, Cloudinary)
- Real-time bidding with WebSockets
- Advanced search with full-text search
- Recommendation engine improvements
- Automated testing suite expansion

---

**Document Version**: 1.0  
**Last Updated**: 2025  
**Status**: Production Ready

