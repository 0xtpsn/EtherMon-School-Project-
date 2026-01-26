import json
import sqlite3
from pathlib import Path

import pytest

from backend import db as db_module
from backend.app import create_app, DB_PATH as app_db_path


@pytest.fixture()
def client(tmp_path, monkeypatch):
    test_db = tmp_path / "test.db"
    monkeypatch.setattr(db_module, "DB_PATH", test_db)
    monkeypatch.setattr("backend.app.DB_PATH", test_db)
    db_module.init_db(sample=False)

    app = create_app()
    app.config.update({"TESTING": True})

    with app.test_client() as client:
        yield client


def register(client, username, email, role):
    resp = client.post(
        "/api/register",
        json={"username": username, "email": email, "password": "pass123", "role": role},
    )
    assert resp.status_code == 201


def login(client, identifier):
    resp = client.post("/api/login", json={"identifier": identifier, "password": "pass123"})
    assert resp.status_code == 200
    return resp.get_json()


def logout(client):
    client.post("/api/logout")


def create_sample_auction(client, title="Sunset NFT"):
    resp = client.post(
        "/api/auctions",
        json={
            "title": title,
            "description": "Beautiful digital art",
            "category": "Digital",
            "start_price": 100,
            "end_time": "2099-01-01T00:00:00Z",
        },
    )
    assert resp.status_code == 201
    return resp.get_json()["auction_id"]


def test_registration_and_login_flow(client):
    register(client, "alice", "alice@example.com", "seller")
    data = login(client, "alice")
    assert data["role"] == "seller"
    assert data["username"] == "alice"


def test_seller_creates_auction(client):
    register(client, "seller1", "seller1@example.com", "seller")
    login(client, "seller1")
    auction_id = create_sample_auction(client)
    assert isinstance(auction_id, int)

    resp = client.get("/api/auctions")
    assert resp.status_code == 200
    auctions = resp.get_json()
    assert any(a["id"] == auction_id for a in auctions)


def test_buyer_browses_and_searches(client):
    register(client, "seller2", "seller2@example.com", "seller")
    login(client, "seller2")
    create_sample_auction(client, "Galaxy Piece")
    logout(client)

    register(client, "buyer1", "buyer1@example.com", "buyer")
    login(client, "buyer1")

    resp = client.get("/api/auctions?sort=price&q=Galaxy")
    assert resp.status_code == 200
    data = resp.get_json()
    assert any("Galaxy" in a["title"] for a in data)

    search_resp = client.get("/api/search?q=Galaxy")
    assert search_resp.status_code == 200
    search_data = search_resp.get_json()
    assert any("Galaxy" in art["title"] for art in search_data["artworks"])


def test_bidding_flow(client):
    register(client, "seller3", "seller3@example.com", "seller")
    login(client, "seller3")
    auction_id = create_sample_auction(client, "Crystal")
    logout(client)

    register(client, "buyer2", "buyer2@example.com", "buyer")
    login(client, "buyer2")

    bid_resp = client.post(f"/api/auctions/{auction_id}/bids", json={"amount": 150})
    assert bid_resp.status_code == 200
    assert bid_resp.get_json()["status"] == "bid_placed"

    my_bids_resp = client.get("/api/me/bids")
    assert my_bids_resp.status_code == 200
    bids = my_bids_resp.get_json()
    assert any(b["auction_id"] == auction_id for b in bids)


def test_closing_auction_sets_winner(client):
    register(client, "seller4", "seller4@example.com", "seller")
    login(client, "seller4")
    auction_id = create_sample_auction(client, "Rare Item")
    logout(client)

    register(client, "buyer3", "buyer3@example.com", "buyer")
    login(client, "buyer3")
    client.post(f"/api/auctions/{auction_id}/bids", json={"amount": 200})
    logout(client)

    login(client, "seller4")
    close_resp = client.post(f"/api/auctions/{auction_id}/close")
    assert close_resp.status_code == 200
    winner_id = close_resp.get_json()["winner_id"]
    assert winner_id is not None

    my_auctions_resp = client.get("/api/me/auctions")
    assert my_auctions_resp.status_code == 200
    auctions = my_auctions_resp.get_json()
    auction = next(a for a in auctions if a["id"] == auction_id)
    assert auction["status"] == "closed"


def test_artwork_creation_and_listing(client):
    register(client, "seller5", "seller5@example.com", "seller")
    user_data = login(client, "seller5")
    
    # Create artwork
    resp = client.post(
        "/api/artworks",
        json={
            "title": "Test Artwork",
            "description": "A test piece",
            "category": "Digital",
            "image_url": "https://example.com/image.jpg",
            "price": 50.0,
            "is_listed": True,
        },
    )
    assert resp.status_code == 201
    artwork_id = resp.get_json()["artwork_id"]
    assert isinstance(artwork_id, int)
    
    # Verify artwork appears in listings
    resp = client.get("/api/artworks?listed=true")
    assert resp.status_code == 200
    artworks = resp.get_json()
    assert any(a["id"] == artwork_id for a in artworks)


def test_artwork_detail_and_favorites(client):
    register(client, "seller6", "seller6@example.com", "seller")
    login(client, "seller6")
    
    # Create artwork
    resp = client.post(
        "/api/artworks",
        json={
            "title": "Favorite Test",
            "description": "Test description",
            "category": "Abstract",
            "image_url": "https://example.com/fav.jpg",
            "price": 75.0,
        },
    )
    artwork_id = resp.get_json()["artwork_id"]
    logout(client)
    
    # Register buyer and favorite artwork
    register(client, "buyer4", "buyer4@example.com", "buyer")
    login(client, "buyer4")
    
    # Get artwork detail
    resp = client.get(f"/api/artworks/{artwork_id}")
    assert resp.status_code == 200
    artwork = resp.get_json()["artwork"]
    assert artwork["title"] == "Favorite Test"
    
    # Add to favorites
    resp = client.post(f"/api/artworks/{artwork_id}/favorite", json={"favorite": True})
    assert resp.status_code == 200
    assert resp.get_json()["favorited"] is True


def test_balance_and_transactions(client):
    register(client, "buyer5", "buyer5@example.com", "buyer")
    login(client, "buyer5")
    
    # Check initial balance
    resp = client.get("/api/balance")
    assert resp.status_code == 200
    balance = resp.get_json()
    assert "available_balance" in balance
    assert balance["available_balance"] == 0
    
    # Make a deposit
    resp = client.post("/api/deposits", json={"amount": 100.0})
    assert resp.status_code == 200
    
    # Check updated balance
    resp = client.get("/api/balance")
    balance = resp.get_json()
    assert balance["available_balance"] == 100.0
    
    # Check transactions
    resp = client.get("/api/transactions")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "transactions" in data
    assert len(data["transactions"]) > 0
    assert any(t["type"] == "deposit" for t in data["transactions"])


def test_bid_on_artwork_endpoint(client):
    register(client, "seller7", "seller7@example.com", "seller")
    login(client, "seller7")
    
    # Create artwork with auction
    resp = client.post(
        "/api/artworks",
        json={
            "title": "Auction Art",
            "description": "For auction",
            "category": "Digital",
            "image_url": "https://example.com/auction.jpg",
        },
    )
    artwork_id = resp.get_json()["artwork_id"]
    
    # List as auction
    resp = client.post(
        f"/api/artworks/{artwork_id}/list",
        json={
            "type": "auction",
            "start_price": 100.0,
            "end_time": "2099-12-31T00:00:00Z",
        },
    )
    assert resp.status_code == 200
    logout(client)
    
    # Buyer places bid
    register(client, "buyer6", "buyer6@example.com", "buyer")
    login(client, "buyer6")
    
    # Deposit funds first
    client.post("/api/deposits", json={"amount": 200.0})
    
    # Place bid using artwork_id endpoint
    resp = client.post(f"/api/artworks/{artwork_id}/bids", json={"amount": 150.0})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "bid_placed"


def test_artwork_update_and_delist(client):
    register(client, "seller8", "seller8@example.com", "seller")
    login(client, "seller8")
    
    # Create artwork
    resp = client.post(
        "/api/artworks",
        json={
            "title": "Original Title",
            "description": "Original description",
            "category": "Digital",
            "image_url": "https://example.com/art.jpg",
            "price": 100.0,
            "is_listed": True,
        },
    )
    artwork_id = resp.get_json()["artwork_id"]
    
    # Update artwork
    resp = client.put(
        f"/api/artworks/{artwork_id}",
        json={"title": "Updated Title", "price": 150.0},
    )
    assert resp.status_code == 200
    
    # Verify update
    resp = client.get(f"/api/artworks/{artwork_id}")
    artwork = resp.get_json()["artwork"]
    assert artwork["title"] == "Updated Title"
    assert artwork["price"] == 150.0
    
    # Delist artwork
    resp = client.post(f"/api/artworks/{artwork_id}/delist")
    assert resp.status_code == 200
    
    # Verify delisted
    resp = client.get(f"/api/artworks/{artwork_id}")
    artwork = resp.get_json()["artwork"]
    assert artwork["is_listed"] is False


def test_search_functionality(client):
    register(client, "seller9", "seller9@example.com", "seller")
    login(client, "seller9")
    
    # Create multiple artworks
    client.post(
        "/api/artworks",
        json={
            "title": "Galaxy Art",
            "description": "Space themed",
            "category": "Digital",
            "image_url": "https://example.com/galaxy.jpg",
            "price": 200.0,
        },
    )
    client.post(
        "/api/artworks",
        json={
            "title": "Ocean View",
            "description": "Beach scene",
            "category": "Photography",
            "image_url": "https://example.com/ocean.jpg",
            "price": 150.0,
        },
    )
    logout(client)
    
    # Search for artworks
    resp = client.get("/api/search?q=Galaxy")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "artworks" in data
    assert any("Galaxy" in art["title"] for art in data["artworks"])
    
    # Search by category
    resp = client.get("/api/artworks?category=Photography")
    assert resp.status_code == 200
    artworks = resp.get_json()
    assert all(art["category"] == "Photography" for art in artworks)
