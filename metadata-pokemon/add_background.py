#!/usr/bin/env python3
"""
Add background color to all Pokemon images
"""

from PIL import Image
import os
from pathlib import Path

# Configuration
IMAGES_DIR = Path(__file__).parent / "images"
BACKGROUND_COLOR = (242, 240, 239)  # #F2F0EF in RGB

def add_background(image_path):
    """Add solid background to a transparent PNG"""
    try:
        # Open the image
        img = Image.open(image_path)
        
        # Convert to RGBA if not already
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Create a new image with the background color
        background = Image.new('RGBA', img.size, BACKGROUND_COLOR + (255,))
        
        # Composite the original image on top of the background
        background.paste(img, (0, 0), img)
        
        # Convert to RGB (removes alpha channel) and save
        final = background.convert('RGB')
        final.save(image_path, 'PNG')
        
        return True
    except Exception as e:
        print(f"Error processing {image_path}: {e}")
        return False

def main():
    print(f"Adding background color #F2F0EF to images in: {IMAGES_DIR}")
    print("-" * 50)
    
    # Get all PNG files
    images = sorted([f for f in IMAGES_DIR.glob("*.png")])
    total = len(images)
    
    print(f"Found {total} images to process")
    
    success = 0
    for i, img_path in enumerate(images, 1):
        if add_background(img_path):
            success += 1
            if i % 100 == 0 or i == total:
                print(f"[{i}/{total}] Processed...")
        else:
            print(f"[{i}/{total}] FAILED: {img_path.name}")
    
    print("-" * 50)
    print(f"Complete! {success}/{total} images processed successfully.")

if __name__ == "__main__":
    main()
