import sqlite3
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "auction.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

_PROFILE_COLUMNS = {
    "contact_email": "TEXT",
    "show_contact_email": "INTEGER DEFAULT 0",
    "notification_email": "INTEGER DEFAULT 1",
    "notification_bid": "INTEGER DEFAULT 1",
    "notification_sale": "INTEGER DEFAULT 1",
    "notification_like": "INTEGER DEFAULT 1",
    "notification_watchlist_outbid": "INTEGER DEFAULT 1",
    "notification_watchlist_ending": "INTEGER DEFAULT 1",
    "notification_auction_sold": "INTEGER DEFAULT 1",
}


def _ensure_runtime_migrations(conn: sqlite3.Connection) -> None:
    """Apply lightweight migrations that cannot be expressed via schema.sql."""
    # Check if users table exists first
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    )
    if not cursor.fetchone():
        return  # Table doesn't exist yet, skip migrations
    
    # Migrate users table
    cursor = conn.execute("PRAGMA table_info(users)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    for column, ddl in _PROFILE_COLUMNS.items():
        if column not in existing_columns:
            conn.execute(f"ALTER TABLE users ADD COLUMN {column} {ddl}")
    
    # Migrate bids table - add expires_at column if it doesn't exist
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='bids'"
    )
    if cursor.fetchone():
        cursor = conn.execute("PRAGMA table_info(bids)")
        existing_bid_columns = {row[1] for row in cursor.fetchall()}
        if "expires_at" not in existing_bid_columns:
            conn.execute("ALTER TABLE bids ADD COLUMN expires_at DATETIME")
    
    # Migrate users table - add google_id column if it doesn't exist
    cursor = conn.execute("PRAGMA table_info(users)")
    existing_user_columns = {row[1] for row in cursor.fetchall()}
    if "google_id" not in existing_user_columns:
        # SQLite doesn't support adding UNIQUE constraint directly in ALTER TABLE
        # So we add the column first, then create a unique index
        conn.execute("ALTER TABLE users ADD COLUMN google_id TEXT")
    
    # Create unique index on google_id if it doesn't exist
    # SQLite unique indexes allow multiple NULLs, which is what we want
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_google_id'"
    )
    if not cursor.fetchone():
        conn.execute("CREATE UNIQUE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL")
    # Make password_hash optional (for Google OAuth users)
    # Note: SQLite doesn't support ALTER COLUMN, so we'll handle this in application logic
    
    # Migrate artworks table - add listing_expires_at column if it doesn't exist
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='artworks'"
    )
    if cursor.fetchone():
        cursor = conn.execute("PRAGMA table_info(artworks)")
        existing_artwork_columns = {row[1] for row in cursor.fetchall()}
        if "listing_expires_at" not in existing_artwork_columns:
            conn.execute("ALTER TABLE artworks ADD COLUMN listing_expires_at DATETIME")
    
    # Create artwork_views table if it doesn't exist (for view tracking with deduplication)
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='artwork_views'"
    )
    if not cursor.fetchone():
        conn.execute("""
            CREATE TABLE IF NOT EXISTS artwork_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                artwork_id INTEGER NOT NULL,
                user_id INTEGER,
                ip_address TEXT,
                viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_artwork_views_artwork ON artwork_views(artwork_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_artwork_views_user ON artwork_views(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_artwork_views_date ON artwork_views(artwork_id, user_id, viewed_at)")
    
    # Note: Role constraint is CHECK(role IN ('buyer','seller'))
    # The 'both' role has been deprecated - all users should be either 'buyer' or 'seller'
    
    conn.commit()


def get_connection() -> sqlite3.Connection:
    """Create a new SQLite connection with row access by column name."""
    conn = sqlite3.connect(DB_PATH, timeout=20.0)  # 20 second timeout for busy database
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")  # Write-Ahead Logging for better concurrency
    conn.execute("PRAGMA busy_timeout = 20000;")  # 20 second busy timeout
    _ensure_runtime_migrations(conn)
    return conn


def init_db(sample: bool = False) -> None:
    """Initialise auction.db using schema.sql; optionally seed demo data."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn, open(SCHEMA_PATH, "r", encoding="utf-8") as schema_file:
        conn.executescript(schema_file.read())
        if sample:
            seed_demo(conn)


def seed_demo(conn: sqlite3.Connection) -> None:
    """Simple seed to create demo users/data for local testing."""
    from werkzeug.security import generate_password_hash

    users = [
        ("alice", "alice@example.com", "seller"),
        ("bob", "bob@example.com", "buyer"),
        ("carol", "carol@example.com", "buyer"),
    ]
    for username, email, role in users:
        conn.execute(
            """
            INSERT INTO users (username, email, password_hash, role, display_name)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(username) DO NOTHING
            """,
            (username, email, generate_password_hash("password123"), role, username.title()),
        )
    conn.commit()


if __name__ == "__main__":
    init_db(sample=True)
    print(f"Database initialised at {DB_PATH}")

