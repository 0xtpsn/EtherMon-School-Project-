#!/usr/bin/env python3
"""
Update all metadata files to use IPFS image URLs
"""

import os
import json
from pathlib import Path

# Configuration
METADATA_DIR = Path(__file__).parent / "metadata"
IPFS_FOLDER_CID = "QmZUjHFwxKNkq61mzzc2XGPHHvL9L1cHSZb3tWtVYPkA2v"
IPFS_BASE_URL = f"ipfs://{IPFS_FOLDER_CID}"

def update_metadata(file_path):
    """Update the image URL in a metadata file"""
    try:
        with open(file_path, 'r') as f:
            metadata = json.load(f)
        
        # Get the token ID from the filename
        token_id = file_path.stem  # e.g., "25" from "25.json"
        
        # Update the image URL to IPFS format
        metadata["image"] = f"{IPFS_BASE_URL}/{token_id}.png"
        
        with open(file_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        return True
    except Exception as e:
        print(f"Error updating {file_path}: {e}")
        return False

def main():
    print(f"Updating metadata to use IPFS URL: {IPFS_BASE_URL}")
    print("-" * 50)
    
    # Get all JSON files
    files = sorted(METADATA_DIR.glob("*.json"), key=lambda x: int(x.stem))
    total = len(files)
    
    print(f"Found {total} metadata files to update")
    
    success = 0
    for i, file_path in enumerate(files, 1):
        if update_metadata(file_path):
            success += 1
            if i % 200 == 0 or i == total:
                print(f"[{i}/{total}] Updated...")
    
    print("-" * 50)
    print(f"Complete! {success}/{total} files updated successfully.")
    
    # Show example
    if success > 0:
        example_path = METADATA_DIR / "25.json"
        if example_path.exists():
            with open(example_path, 'r') as f:
                print("\nExample (Pikachu):")
                print(json.dumps(json.load(f), indent=2))

if __name__ == "__main__":
    main()
