"""
Upload images and metadata directories to Lighthouse IPFS.
Uses the raw API with streaming to handle 1025 files.
"""
import requests
import os
import sys
from pathlib import Path

API_KEY = "d2d4ff1d.16970dbbfc764e09ada671b3687f5d92"
UPLOAD_URL = "https://node.lighthouse.storage/api/v0/add"

def upload_directory(dir_path: str, label: str):
    """Upload a directory to Lighthouse and return the directory CID."""
    p = Path(dir_path)
    files_list = sorted(p.iterdir(), key=lambda f: f.name)
    total = len(files_list)
    print(f"\n{'='*50}")
    print(f"Uploading {label}: {total} files from {dir_path}")
    print(f"{'='*50}")

    # Lighthouse API: send all files as multipart with wrap-with-directory
    # Upload in chunks to avoid connection timeout
    CHUNK_SIZE = 100
    all_cids = []

    for start in range(0, total, CHUNK_SIZE):
        end = min(start + CHUNK_SIZE, total)
        chunk_files = files_list[start:end]

        # Build multipart files list
        file_handles = []
        files_payload = []
        for f in chunk_files:
            fh = open(f, 'rb')
            file_handles.append(fh)
            files_payload.append(('file', (f.name, fh)))

        try:
            print(f"  Uploading batch {start+1}-{end}/{total}...", end=" ", flush=True)
            params = {"wrap-with-directory": "true"} if CHUNK_SIZE >= total else {}
            resp = requests.post(
                UPLOAD_URL,
                headers={"Authorization": f"Bearer {API_KEY}"},
                files=files_payload,
                params=params,
                timeout=300,
            )

            if resp.status_code == 200:
                # Lighthouse returns NDJSON — one line per file + directory
                lines = resp.text.strip().split('\n')
                for line in lines:
                    import json
                    data = json.loads(line)
                    all_cids.append(data)
                    if data.get('Name') == '':
                        # This is the directory wrapper CID
                        print(f"OK — Directory CID: {data['Hash']}")
                    else:
                        pass  # individual file
                if not any(d.get('Name') == '' for d in all_cids):
                    last = json.loads(lines[-1])
                    print(f"OK — Last CID: {last.get('Hash', 'unknown')}")
            else:
                print(f"FAILED (HTTP {resp.status_code})")
                print(f"  Response: {resp.text[:500]}")
        except Exception as e:
            print(f"ERROR: {e}")
        finally:
            for fh in file_handles:
                fh.close()

    # Print summary
    dir_entries = [d for d in all_cids if d.get('Name') == '']
    if dir_entries:
        print(f"\n>>> {label} DIRECTORY CID: {dir_entries[-1]['Hash']}")
        return dir_entries[-1]['Hash']
    elif all_cids:
        print(f"\n>>> No directory wrapper found. Individual CIDs uploaded.")
        return None
    return None

if __name__ == "__main__":
    # Upload images first
    images_cid = upload_directory("./metadata-pokemon/images", "IMAGES")

    # Then metadata
    metadata_cid = upload_directory("./metadata-pokemon/metadata", "METADATA")

    print(f"\n{'='*50}")
    print("SUMMARY")
    print(f"{'='*50}")
    if images_cid:
        print(f"Images CID:   {images_cid}")
        print(f"  Test URL:   https://gateway.lighthouse.storage/ipfs/{images_cid}/1.png")
    if metadata_cid:
        print(f"Metadata CID: {metadata_cid}")
        print(f"  Test URL:   https://gateway.lighthouse.storage/ipfs/{metadata_cid}/1.json")
