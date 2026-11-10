"""
Recover Amazon product photos.

Your meta_filtered.parquet was built with images dropped, so the app has no
product pictures. This streams the metadata again and keeps ONLY the image URLs
for the products you already have, then saves a small lookup file.

Run it from your ecommerce-project folder (the one with data/clean in it):

    python fetch_product_images.py

It writes:  data/clean/product_images.parquet
Then copy that file into the advisor's data/clean folder and restart the server.
"""

import json
import os

import pandas as pd
import requests

CATEGORY = "Home_and_Kitchen"
DATA_DIR = os.path.join("data", "clean")
OUT = os.path.join(DATA_DIR, "product_images.parquet")
BASE = "https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main"


def first_url(images):
    """Amazon stores a list of dicts: {thumb, large, hi_res, variant}."""
    if not images:
        return None
    for img in images:
        if not isinstance(img, dict):
            continue
        for key in ("large", "hi_res", "thumb"):
            url = img.get(key)
            if isinstance(url, str) and url.startswith("http"):
                return url
    return None


def main():
    meta_path = os.path.join(DATA_DIR, "meta_filtered.parquet")
    if not os.path.exists(meta_path):
        raise SystemExit(f"Can't find {meta_path}. Run this from your project folder.")

    wanted = set(pd.read_parquet(meta_path).parent_asin.astype(str))
    print(f"looking for photos for {len(wanted)} products")

    url = f"{BASE}/raw/meta_categories/meta_{CATEGORY}.jsonl"
    found = {}
    seen = 0

    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            seen += 1
            try:
                d = json.loads(line)
            except Exception:                            # noqa: BLE001
                continue

            asin = str(d.get("parent_asin", ""))
            if asin not in wanted or asin in found:
                continue

            u = first_url(d.get("images"))
            if u:
                found[asin] = u

            if len(found) % 50 == 0 and found:
                print(f"  {len(found)} / {len(wanted)} found  (read {seen:,} rows)")

            if len(found) >= len(wanted):
                break

    df = pd.DataFrame([{"parent_asin": k, "image": v} for k, v in found.items()])
    os.makedirs(DATA_DIR, exist_ok=True)
    df.to_parquet(OUT)
    print(f"\nsaved {len(df)} photo links to {OUT}")
    print("Now copy that file into the advisor's data/clean folder and restart it.")


if __name__ == "__main__":
    main()
