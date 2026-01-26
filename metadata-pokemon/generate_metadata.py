#!/usr/bin/env python3
"""
Pokémon NFT Metadata Generator
Fetches data from PokéAPI and generates OpenSea-compatible metadata + images
"""

import os
import json
import requests
import time
from pathlib import Path

# Configuration
BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "images"
METADATA_DIR = BASE_DIR / "metadata"
TOTAL_NFTS = 1025  # Max supply matches total available Pokémon
TOTAL_POKEMON = 1025  # Current total Pokémon in PokéAPI

# Create directories
IMAGES_DIR.mkdir(exist_ok=True)
METADATA_DIR.mkdir(exist_ok=True)

def get_pokemon_data(pokemon_id):
    """Fetch Pokémon data from PokéAPI"""
    try:
        response = requests.get(f"https://pokeapi.co/api/v2/pokemon/{pokemon_id}", timeout=10)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print(f"Error fetching Pokémon {pokemon_id}: {e}")
        return None

def download_image(url, save_path):
    """Download image from URL"""
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            with open(save_path, 'wb') as f:
                f.write(response.content)
            return True
    except Exception as e:
        print(f"Error downloading image: {e}")
    return False

def get_rarity(base_stat_total):
    """Determine rarity based on base stat total"""
    if base_stat_total >= 580:
        return "Legendary"
    elif base_stat_total >= 500:
        return "Epic"
    elif base_stat_total >= 400:
        return "Rare"
    elif base_stat_total >= 300:
        return "Uncommon"
    else:
        return "Common"

def generate_metadata(pokemon_id, pokemon_data):
    """Generate OpenSea-compatible metadata"""
    name = pokemon_data["name"].capitalize()
    
    # Get types
    types = [t["type"]["name"].capitalize() for t in pokemon_data["types"]]
    primary_type = types[0]
    
    # Get stats
    stats = {s["stat"]["name"]: s["base_stat"] for s in pokemon_data["stats"]}
    base_stat_total = sum(stats.values())
    
    # Get image URL (official artwork preferred, fallback to default sprite)
    image_url = (
        pokemon_data["sprites"]["other"]["official-artwork"]["front_default"] or
        pokemon_data["sprites"]["front_default"]
    )
    
    metadata = {
        "name": f"{name} #{pokemon_id}",
        "description": f"{primary_type}-type Pokémon from the Pokechain Collection. Catch, trade, and battle!",
        "image": f"images/{pokemon_id}.png",  # Relative path for local hosting
        "external_url": f"https://pokechain.io/pokemon/{pokemon_id}",
        "attributes": [
            {"trait_type": "Type", "value": primary_type},
            {"trait_type": "HP", "value": stats.get("hp", 0)},
            {"trait_type": "Attack", "value": stats.get("attack", 0)},
            {"trait_type": "Defense", "value": stats.get("defense", 0)},
            {"trait_type": "Sp. Attack", "value": stats.get("special-attack", 0)},
            {"trait_type": "Sp. Defense", "value": stats.get("special-defense", 0)},
            {"trait_type": "Speed", "value": stats.get("speed", 0)},
            {"trait_type": "Pokedex", "value": pokemon_data["id"]},
            {"trait_type": "Rarity", "value": get_rarity(base_stat_total)},
            {"trait_type": "Generation", "value": get_generation(pokemon_data["id"])}
        ]
    }
    
    # Add secondary type if exists
    if len(types) > 1:
        metadata["attributes"].insert(1, {"trait_type": "Secondary Type", "value": types[1]})
    
    return metadata, image_url

def get_generation(pokemon_id):
    """Determine generation based on Pokédex number"""
    if pokemon_id <= 151:
        return 1
    elif pokemon_id <= 251:
        return 2
    elif pokemon_id <= 386:
        return 3
    elif pokemon_id <= 493:
        return 4
    elif pokemon_id <= 649:
        return 5
    elif pokemon_id <= 721:
        return 6
    elif pokemon_id <= 809:
        return 7
    elif pokemon_id <= 905:
        return 8
    else:
        return 9

def main():
    print(f"Starting metadata generation for {TOTAL_NFTS} NFTs...")
    print(f"Images will be saved to: {IMAGES_DIR}")
    print(f"Metadata will be saved to: {METADATA_DIR}")
    print("-" * 50)
    
    success_count = 0
    error_count = 0
    
    for nft_id in range(1, TOTAL_NFTS + 1):
        # Map NFT ID to Pokémon ID (cycle if needed)
        pokemon_id = ((nft_id - 1) % TOTAL_POKEMON) + 1
        
        # Check if already processed
        metadata_path = METADATA_DIR / f"{nft_id}.json"
        image_path = IMAGES_DIR / f"{nft_id}.png"
        
        if metadata_path.exists() and image_path.exists():
            print(f"[{nft_id}/{TOTAL_NFTS}] Already exists, skipping...")
            success_count += 1
            continue
        
        print(f"[{nft_id}/{TOTAL_NFTS}] Fetching Pokémon #{pokemon_id}...", end=" ")
        
        pokemon_data = get_pokemon_data(pokemon_id)
        if not pokemon_data:
            print("FAILED (API error)")
            error_count += 1
            continue
        
        metadata, image_url = generate_metadata(nft_id, pokemon_data)
        
        # Save metadata
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Download image
        if image_url and download_image(image_url, image_path):
            print(f"OK - {metadata['name']}")
            success_count += 1
        else:
            print(f"OK (no image) - {metadata['name']}")
            success_count += 1
        
        # Rate limiting to avoid API throttling
        time.sleep(0.1)
    
    print("-" * 50)
    print(f"Complete! Success: {success_count}, Errors: {error_count}")
    print(f"Metadata: {METADATA_DIR}")
    print(f"Images: {IMAGES_DIR}")

if __name__ == "__main__":
    main()
