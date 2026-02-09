"""
Seed the database with Pokémon NFT data from metadata-pokemon/metadata/*.json.
Replaces the old ArtMart sample data with real PokéChain NFT cards.

Usage:
    python -m backend.seed_pokemon
"""
import json
import glob
import random
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "auction.db"
METADATA_DIR = BASE_DIR / "metadata-pokemon" / "metadata"

# Rarity -> price range in ETH
RARITY_PRICE_RANGES = {
    "Common":    (0.01, 0.05),
    "Uncommon":  (0.05, 0.15),
    "Rare":      (0.15, 0.50),
    "Epic":      (0.50, 2.00),
    "Legendary": (2.00, 10.00),
}


def get_attribute(attributes: list, trait: str, default=None):
    """Extract an attribute value from the NFT metadata attributes list."""
    for attr in attributes:
        if attr.get("trait_type") == trait:
            return attr.get("value", default)
    return default


def seed_pokemon(limit: int = 150):
    """
    Seed the database with Pokémon NFT data.
    Default limit=150 for the original 150 Pokémon (Gen 1).
    """
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")

    # Create demo users if they don't exist
    from werkzeug.security import generate_password_hash

    trainers = [
        ("ash", "ash@pokechain.io", "seller", "Ash Ketchum"),
        ("misty", "misty@pokechain.io", "seller", "Misty"),
        ("brock", "brock@pokechain.io", "seller", "Brock"),
        ("gary", "gary@pokechain.io", "buyer", "Gary Oak"),
        ("nurse_joy", "nurse_joy@pokechain.io", "buyer", "Nurse Joy"),
    ]
    for username, email, role, display_name in trainers:
        conn.execute(
            """
            INSERT INTO users (username, email, password_hash, role, display_name)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(username) DO NOTHING
            """,
            (username, email, generate_password_hash("pokemon123"), role, display_name),
        )
    conn.commit()

    # Get all seller user IDs
    seller_rows = conn.execute(
        "SELECT id FROM users WHERE role = 'seller'"
    ).fetchall()
    seller_ids = [r["id"] for r in seller_rows]
    if not seller_ids:
        print("No sellers found!")
        return

    # Get all user IDs (for buyers)
    all_user_rows = conn.execute("SELECT id FROM users").fetchall()
    all_user_ids = [r["id"] for r in all_user_rows]

    # Clear existing artworks, auctions, bids, activity, etc.
    print("Clearing old data...")
    conn.execute("DELETE FROM bids")
    conn.execute("DELETE FROM auctions")
    conn.execute("DELETE FROM favorites")
    conn.execute("DELETE FROM watchlist")
    conn.execute("DELETE FROM notifications")
    conn.execute("DELETE FROM transactions")
    conn.execute("DELETE FROM activity")
    conn.execute("DELETE FROM price_history")
    conn.execute("DELETE FROM artworks")
    conn.commit()

    # Load Pokémon metadata files
    metadata_files = sorted(
        glob.glob(str(METADATA_DIR / "*.json")),
        key=lambda f: int(Path(f).stem)
    )

    if limit:
        metadata_files = metadata_files[:limit]

    print(f"Seeding {len(metadata_files)} Pokémon NFTs...")
    count = 0
    for filepath in metadata_files:
        with open(filepath) as f:
            data = json.load(f)

        attrs = data.get("attributes", [])
        name = data.get("name", f"Pokemon #{Path(filepath).stem}")
        description = data.get("description", "")
        image_url = data.get("image", "")
        pokemon_type = get_attribute(attrs, "Type", "Normal")
        rarity = get_attribute(attrs, "Rarity", "Common")
        hp = get_attribute(attrs, "HP", 50)
        attack = get_attribute(attrs, "Attack", 50)
        defense = get_attribute(attrs, "Defense", 50)
        pokedex = get_attribute(attrs, "Pokedex", int(Path(filepath).stem))

        # Build a richer description with stats
        full_description = (
            f"{description}\n\n"
            f"Type: {pokemon_type} | Rarity: {rarity}\n"
            f"HP: {hp} | ATK: {attack} | DEF: {defense}\n"
            f"Pokédex #{pokedex}"
        )

        # Price based on rarity
        price_range = RARITY_PRICE_RANGES.get(rarity, (0.01, 0.05))
        price = round(random.uniform(*price_range), 4)

        # Random owner (seller)
        artist_id = random.choice(seller_ids)
        owner_id = random.choice(all_user_ids)

        # Most are listed, some are not
        is_listed = 1 if random.random() < 0.8 else 0
        listing_type = "fixed" if is_listed else None

        # Use the Pokémon primary type as the category
        # Map to the allowed categories in the DB
        category = pokemon_type

        conn.execute(
            """
            INSERT INTO artworks (artist_id, owner_id, title, description, category, image_url, price, is_listed, listing_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (artist_id, owner_id, name, full_description, category, image_url, price, is_listed, listing_type),
        )
        count += 1

    conn.commit()

    # Create a few sample auctions on some rare/epic Pokémon
    artworks = conn.execute(
        """
        SELECT id, owner_id, price, title FROM artworks
        WHERE is_listed = 1
        ORDER BY price DESC
        LIMIT 8
        """
    ).fetchall()

    from datetime import datetime, timedelta

    for artwork in artworks[:6]:
        end_time = datetime.utcnow() + timedelta(hours=random.randint(2, 48))
        start_price = artwork["price"] * 0.5
        reserve_price = artwork["price"] * 1.2

        conn.execute(
            """
            UPDATE artworks SET listing_type = 'auction' WHERE id = ?
            """,
            (artwork["id"],),
        )
        conn.execute(
            """
            INSERT INTO auctions (artwork_id, seller_id, start_price, reserve_price, end_time, status)
            VALUES (?, ?, ?, ?, ?, 'open')
            """,
            (artwork["id"], artwork["owner_id"], round(start_price, 4), round(reserve_price, 4), end_time.isoformat()),
        )

    conn.commit()

    # Seed some balances for demo users
    for uid in all_user_ids:
        conn.execute(
            """
            INSERT OR IGNORE INTO balances (user_id, available_balance, pending_balance)
            VALUES (?, ?, 0)
            """,
            (uid, round(random.uniform(1.0, 50.0), 4)),
        )
    conn.commit()

    conn.close()
    print(f"✅ Seeded {count} Pokémon NFTs successfully!")
    print(f"✅ Created {min(6, len(artworks))} sample auctions")


if __name__ == "__main__":
    seed_pokemon(limit=150)  # Seed Gen 1 Pokémon
