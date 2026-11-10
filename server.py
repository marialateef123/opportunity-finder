"""
AI Product Opportunity Advisor — Flask backend

Everything served here is read from the parquet files produced by the
analysis pipeline. Nothing about products, complaints, prices or
recommendations is hardcoded.

Run:
    pip install flask pandas pyarrow flask-cors
    python server.py

Serves the built React UI (from ./dist) plus the JSON API.
"""

import math
import os

import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", os.path.join(BASE_DIR, "data", "clean"))
DIST_DIR = os.path.join(BASE_DIR, "dist")

USD_TO_PKR = 280

app = Flask(__name__, static_folder=None)

try:
    from flask_cors import CORS
    CORS(app)
except ImportError:                                     # optional in production
    @app.after_request
    def _cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return resp


# ===========================================================================
# LOAD
# ===========================================================================
def _read_csv(name):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        try:
            return pd.read_csv(path)
        except Exception as exc:                        # noqa: BLE001
            print(f"  ! {name}: {exc}")
    return None


def _read(name):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        try:
            return pd.read_parquet(path)
        except Exception as exc:                        # noqa: BLE001
            print(f"  ! {name}: {exc}")
    return None


AMZ_NICHE = _read("opportunities.parquet")
DZ_NICHE  = _read("daraz_niche_gaps.parquet")
AMZ_PROD  = _read("features_full.parquet")
DZ_PROD   = _read("daraz_features_clustered.parquet")
VALIDATION = _read("validation_results.parquet")
AMZ_REVIEWS = _read("reviews_topics.parquet")
AMZ_META    = _read("meta_filtered.parquet")
AMZ_IMGFILE = _read("product_images.parquet")
DZ_REVIEWS  = _read("daraz_reviews_credible.parquet")
if DZ_REVIEWS is None:
    DZ_REVIEWS = _read_csv("daraz_reviews_credible.csv")

if AMZ_NICHE is None:
    raise SystemExit(
        f"\n  Could not find opportunities.parquet in:\n    {DATA_DIR}\n\n"
        f"  Put your parquet files there, or set the DATA_DIR environment "
        f"variable to point at the folder that has them.\n")

LOADED = {
    "opportunities.parquet":          AMZ_NICHE is not None,
    "daraz_niche_gaps.parquet":       DZ_NICHE is not None,
    "features_full.parquet":          AMZ_PROD is not None,
    "daraz_features_clustered.parquet": DZ_PROD is not None,
    "validation_results.parquet":     VALIDATION is not None,
    "reviews_topics.parquet":         AMZ_REVIEWS is not None,
    "daraz_reviews_credible":         DZ_REVIEWS is not None,
    "meta_filtered.parquet":          AMZ_META is not None,
    "product_images.parquet":         AMZ_IMGFILE is not None,
}


def _first_image(v):
    """Amazon metadata stores images as a list of dicts or a list of urls."""
    try:
        if v is None:
            return None
        if isinstance(v, str):
            return v if v.startswith("http") else None
        seq = list(v)
        if not seq:
            return None
        first = seq[0]
        if isinstance(first, dict):
            for k in ("large", "hi_res", "thumb", "variant"):
                u = first.get(k)
                if isinstance(u, str) and u.startswith("http"):
                    return u
            return None
        return first if isinstance(first, str) and first.startswith("http") else None
    except Exception:                                   # noqa: BLE001
        return None


AMZ_IMG = {}

# preferred: a dedicated lookup produced by fetch_product_images.py
if AMZ_IMGFILE is not None and {"parent_asin", "image"} <= set(AMZ_IMGFILE.columns):
    AMZ_IMG = {str(a): str(u) for a, u in
               zip(AMZ_IMGFILE.parent_asin, AMZ_IMGFILE.image) if isinstance(u, str)}

# fallback: an images column left in the metadata
if not AMZ_IMG and AMZ_META is not None and "images" in AMZ_META.columns:
    for _, _r in AMZ_META.iterrows():
        _u = _first_image(_r.get("images"))
        if _u:
            AMZ_IMG[str(_r.get("parent_asin"))] = _u

if AMZ_IMG:
    print(f"  product photos    : {len(AMZ_IMG)}")
else:
    print("  product photos    : none found — run fetch_product_images.py to add them")

# Pictures are decoration only — never data. Matched by category name.
IMAGES = {
    "Sheets & Pillowcases": "photo-1522771739844-6a9f6d5f14af",
    "Kitchen Utensils & Gadgets": "photo-1556909114-f6e7ad7d3136",
    "Bathroom Accessories": "photo-1552321554-5fefe8c9ef14",
    "Window Treatments": "photo-1513694203232-719a280e022f",
    "Blankets & Throws": "photo-1580301762395-83204d1f3ee1",
    "Comforters & Sets": "photo-1616627561950-9f746e330187",
    "Storage & Organization": "photo-1558618666-fcd25c85cd64",
    "Bedroom Furniture": "photo-1505693416388-ac5ce068fe85",
    "Mattress Pads & Toppers": "photo-1631049307264-da0ec9d70304",
    "Small Appliances": "photo-1570222094114-d054a817e56b",
    "Clothing & Closet Storage": "photo-1558997519-83ea9252edf8",
    "Dining & Entertaining": "photo-1555041469-a586c61ea9bc",
    "Bakeware": "photo-1486427944299-d1955d23e34d",
    "Decorative Pillows, Inserts & Covers": "photo-1586023492125-27b2c045efd7",
    "Kitchen & Table Linens": "photo-1584990347449-a40a4f5ba33e",
    "Window Treatment Hardware": "photo-1533779283484-8ad4940aa3a8",
    "Coffee, Tea & Espresso": "photo-1495474472287-4d71bcdd2085",
    "Cookware": "photo-1584990347193-4b0dbdc0f8f8",
}
FALLBACK_IMG = "photo-1441986300917-64674bd600d8"


def image_for(name):
    pid = IMAGES.get(name, FALLBACK_IMG)
    return f"https://images.unsplash.com/{pid}?w=640&h=420&fit=crop&auto=format&q=70"

# Amazon niche -> Daraz niche. approx=True where the two taxonomies differ.
MATCH = {
    "Bathroom Accessories":                 ("bathroom-accessories", False),
    "Storage & Organization":               ("storage-organizer",    False),
    "Kitchen Utensils & Gadgets":           ("kitchen-utensils",     False),
    "Bedroom Furniture":                    ("furniture",            False),
    "Window Treatments":                    ("home-decor",           False),
    "Decorative Pillows, Inserts & Covers": ("home-decor",           False),
    "Dining & Entertaining":                ("kitchen-utensils",     True),
    "Blankets & Throws":                    ("home-decor",           True),
    "Kitchen & Table Linens":               ("laundry",              True),
    "Small Appliances":                     ("lighting",             True),
}

# Plain-English wording for the aspect codes that appear in the parquet files
ASPECT = {
    "size":       ("Wrong size",      "Products often don't match the size buyers expected."),
    "quality":    ("Breaks too soon", "Buyers say the build quality is poor and things break."),
    "usability":  ("Hard to use",     "Buyers find these hard to use, clean or assemble."),
    "appearance": ("Looks different", "The item often looks different from the photos."),
    "shipping":   ("Damaged in post", "Items often arrive damaged or badly packed."),
    "price":      ("Not worth it",    "Buyers feel it isn't worth what they paid."),
    "delivery":   ("Slow delivery",   "Buyers report slow or unreliable delivery."),
    "smell":      ("Bad smell",       "Buyers mention a chemical or unpleasant smell."),
    "wrong_item": ("Wrong item sent", "Buyers often get the wrong item, or fewer than ordered."),
}


def txt(v, default=None):
    if v is None:
        return default
    if isinstance(v, float) and math.isnan(v):
        return default
    s = str(v)
    return default if s in ("None", "nan", "NaN", "") else s


def num(v, default=0.0):
    try:
        f = float(v)
        return default if math.isnan(f) else f
    except (TypeError, ValueError):
        return default


def minmax(series):
    lo, hi = series.min(), series.max()
    if hi <= lo:
        return series * 0
    return (series - lo) / (hi - lo)


def band(v, low, high, words):
    return words[0] if v < low else (words[1] if v < high else words[2])


# ===========================================================================
# BUILD CATALOGUE (identical scoring to the notebook pipeline)
# ===========================================================================
def build():
    df = AMZ_NICHE.copy()

    if "demand_per_product" not in df:
        df["demand_per_product"] = df["demand"] / df["n_products"].clip(lower=1)
    for col, default in (("quality_gap", 0.0), ("price_gaps", 0.0), ("hhi", 0.0),
                         ("mean_wilson", 0.5), ("n_stores", 0)):
        if col not in df:
            df[col] = default

    # scores — recomputed here only if the pipeline didn't already store them
    if "demand_score" not in df:
        df["demand_score"] = (minmax(pd.Series([math.log1p(x) for x in df.demand_per_product]))
                              + minmax(1 - df.hhi)) / 2
    if "quality_score" not in df:
        df["quality_score"] = (minmax(df.quality_gap) + minmax(1 - df.mean_wilson)) / 2
    if "price_score" not in df:
        df["price_score"] = minmax(df.price_gaps.clip(0, 3))

    dz_lookup = {}
    if DZ_NICHE is not None:
        for _, r in DZ_NICHE.iterrows():
            dz_lookup[str(r["niche"])] = r

    growth = {}
    if VALIDATION is not None and "growth_ratio" in VALIDATION:
        for _, r in VALIDATION.iterrows():
            growth[str(r["niche"])] = dict(
                growth_ratio=num(r.get("growth_ratio")),
                growth_per_product=num(r.get("growth_per_product")),
                reviews_after=num(r.get("reviews_2021_22")),
            )

    out = []
    for _, r in df.iterrows():
        name = str(r["niche"])
        aspect = txt(r.get("worst_aspect"))
        hhi = num(r.get("hhi"))

        item = dict(
            id=name.lower().replace(" ", "-").replace(",", "").replace("&", "and"),
            name=name,
            image=image_for(name),
            products=int(num(r.get("n_products"))),
            sellers=int(num(r.get("n_stores"))),
            reviews=int(num(r.get("demand"))),
            reviews_per_product=round(num(r.get("demand_per_product"))),
            price_usd=round(num(r.get("med_price")), 2),
            price_pkr=round(num(r.get("med_price")) * USD_TO_PKR),
            satisfaction=round(num(r.get("mean_wilson")), 3),
            concentration=round(hhi, 4),
            complaint_share=round(num(r.get("quality_gap")), 3),
            complaint=aspect,
            complaint_label=ASPECT.get(aspect, ("None found", ""))[0] if aspect else "None found",
            complaint_text=ASPECT.get(aspect, ("", "No single complaint stood out in the reviews."))[1]
            if aspect else "No single complaint stood out in the reviews.",
            price_gaps=int(num(r.get("price_gaps"))),
            demand_score=round(num(r.get("demand_score")), 4),
            quality_score=round(num(r.get("quality_score")), 4),
            price_score=round(num(r.get("price_score")), 4),
            room_score=round(1 - min(hhi / 0.35, 1), 4),
            has_opening=bool(num(r.get("quality_gap")) > 0 or num(r.get("price_gaps")) > 0),
        )

        item["demand_label"]     = band(item["demand_score"], .40, .65,
                                        ["Smaller market", "Steady demand", "High demand"])
        item["competition_label"] = band(hhi, .12, .25,
                                         ["Wide open", "Some strong sellers", "Dominated by a few"])
        item["opening_label"]    = band(item["quality_score"], .35, .60,
                                        ["No clear gap", "Some issues", "Clear gap"])

        g = growth.get(name)
        if g:
            item["growth_ratio"] = round(g["growth_ratio"], 3)
            item["growth_label"] = band(g["growth_ratio"], .55, .80,
                                        ["Slowing", "Steady", "Growing"])
        else:
            item["growth_ratio"] = None
            item["growth_label"] = None

        key, approx = MATCH.get(name, (None, False))
        d = dz_lookup.get(key)
        if d is not None:
            d_aspect = txt(d.get("worst_aspect"), "size")
            item["local"] = dict(
                niche=key, approx=bool(approx),
                listings=int(num(d.get("n_products"))),
                sellers=int(num(d.get("n_sellers"))),
                price_pkr=round(num(d.get("med_price"))),
                discount=round(num(d.get("med_discount"))),
                concentration=round(num(d.get("hhi_products", d.get("hhi"))), 4),
                reviews=int(num(d.get("demand"))),
                complaint=d_aspect,
                complaint_label=ASPECT.get(d_aspect, ("Other", ""))[0],
                complaint_text=ASPECT.get(d_aspect, ("", ""))[1],
                complaint_lift=round(num(d.get("complaint_lift"), 1.0), 2),
                suspicious_share=round(num(d.get("susp_share")), 4),
            )
        else:
            item["local"] = None
        out.append(item)
    return out


CATALOGUE = build()
BY_ID = {c["id"]: c for c in CATALOGUE}


# ===========================================================================
# PRODUCT-LEVEL DETAIL (from features_full.parquet)
# ===========================================================================
SEV_COLS = ([c for c in AMZ_PROD.columns if c.endswith("_severity")]
            if AMZ_PROD is not None else [])


def review_samples(df, key_col, ids, text_col="text", rating_col="rating", n=4):
    """Real review text pulled from the parquet files. Nothing invented."""
    if df is None or text_col not in df.columns:
        return dict(positive=[], negative=[], counted=0, avg_rating=None)
    sub = df[df[key_col].astype(str).isin({str(i) for i in ids})]
    if sub.empty:
        return dict(positive=[], negative=[], counted=0, avg_rating=None)
    sub = sub[sub[text_col].astype(str).str.len() > 25]
    pos = sub[sub[rating_col] >= 4].drop_duplicates(text_col).head(n)
    neg = sub[sub[rating_col] <= 3].drop_duplicates(text_col).head(n)
    pack = lambda d: [dict(rating=int(num(r[rating_col])), text=str(r[text_col])[:400])
                      for _, r in d.iterrows()]
    return dict(positive=pack(pos), negative=pack(neg), counted=int(len(sub)),
                avg_rating=round(float(sub[rating_col].mean()), 2))


def daraz_products_for(key, n=6, fallback_img=None):
    if DZ_PROD is None or key is None or "niche" not in DZ_PROD.columns:
        return []
    sub = DZ_PROD[DZ_PROD.niche == key]
    if sub.empty:
        return []
    sort_col = "review_count" if "review_count" in sub.columns else "rating"
    out = []
    for _, p in sub.nlargest(n, sort_col).iterrows():
        _img = txt(p.get("image")) or txt(p.get("image_url"))
        out.append(dict(
            id=str(p.get("product_id", "")),
            image=_img or fallback_img,
            title=txt(p.get("title"), "Untitled"),
            seller=txt(p.get("seller"), "Unknown"),
            price_pkr=round(num(p.get("price"))),
            discount=round(num(p.get("discount_pct"))),
            rating=round(num(p.get("rating")), 2),
            reviews=int(num(p.get("review_count"))),
        ))
    return out


def category_detail(cat):
    """Everything on one category, straight from the product-level parquet."""
    detail = dict(category=cat, top_products=[], issues=[], price_buckets=[],
                  sellers=[], amazon_reviews=None, daraz_reviews=None,
                  daraz_products=[], pairs=[])
    if AMZ_PROD is None or "niche" not in AMZ_PROD.columns:
        return detail

    # ---- Daraz side works even when the Amazon product file is thin ----
    lkey = cat["local"]["niche"] if cat.get("local") else None
    detail["daraz_products"] = daraz_products_for(lkey, fallback_img=cat["image"])
    if DZ_REVIEWS is not None and lkey:
        idcol = "item_id" if "item_id" in DZ_REVIEWS.columns else "product_id"
        if "niche" in DZ_REVIEWS.columns:
            dsub = DZ_REVIEWS[DZ_REVIEWS.niche == lkey]
            detail["daraz_reviews"] = review_samples(dsub, idcol,
                                                     dsub[idcol].unique() if not dsub.empty else [])
        else:
            detail["daraz_reviews"] = review_samples(
                DZ_REVIEWS, idcol, [p["id"] for p in detail["daraz_products"]])

    sub = AMZ_PROD[AMZ_PROD.niche == cat["name"]]
    if sub.empty:
        return detail

    if AMZ_REVIEWS is not None:
        kcol = "parent_asin" if "parent_asin" in AMZ_REVIEWS.columns else "item_id"
        detail["amazon_reviews"] = review_samples(AMZ_REVIEWS, kcol,
                                                  sub.parent_asin.tolist())

    # --- issues, ranked by average severity across the category ---
    for col in SEV_COLS:
        aspect = col.replace("_severity", "")
        mean_sev = float(sub[col].mean())
        share = float((sub[col] > 0.02).mean())
        if mean_sev <= 0:
            continue
        label, text = ASPECT.get(aspect, (aspect.title(), ""))
        detail["issues"].append(dict(
            aspect=aspect, label=label, text=text,
            severity=round(mean_sev, 4),
            affected_pct=round(share * 100),
        ))
    detail["issues"].sort(key=lambda x: x["severity"], reverse=True)

    # --- best-performing products in this category ---
    sort_col = "wilson" if "wilson" in sub.columns else "mean_rating"
    top = sub.nlargest(6, sort_col)
    for _, p in top.iterrows():
        _asin = str(p.get("parent_asin", ""))
        detail["top_products"].append(dict(
            asin=_asin,
            image=AMZ_IMG.get(_asin) or cat["image"],
            title=txt(p.get("title"), "Untitled"),
            seller=txt(p.get("store"), "Unknown"),
            price_usd=round(num(p.get("price")), 2),
            price_pkr=round(num(p.get("price")) * USD_TO_PKR),
            reviews=int(num(p.get("rating_number"))),
            rating=round(num(p.get("mean_rating")), 2),
            satisfaction=round(num(p.get("wilson")), 3),
        ))

    # --- price distribution ---
    if "price" in sub.columns and len(sub) > 3:
        cuts = pd.qcut(sub.price, q=min(5, sub.price.nunique()), duplicates="drop")
        for interval, count in sub.groupby(cuts, observed=True).size().items():
            detail["price_buckets"].append(dict(
                label=f"Rs {round(interval.left * USD_TO_PKR):,}–{round(interval.right * USD_TO_PKR):,}",
                low_pkr=round(interval.left * USD_TO_PKR),
                high_pkr=round(interval.right * USD_TO_PKR),
                products=int(count),
            ))

    # --- paired product comparison (similar items, not the same item) ---
    dzp = detail["daraz_products"]
    if dzp and detail["top_products"]:
        used = set()
        pairs = []
        for a in detail["top_products"][:5]:
            # rank local listings by how close they sit in their own price distribution
            a_rank = a["price_pkr"]
            best, best_gap = None, None
            for d_ in dzp:
                if d_["id"] in used:
                    continue
                gap = abs(d_["price_pkr"] - a_rank) / max(a_rank, 1)
                if best_gap is None or gap < best_gap:
                    best, best_gap = d_, gap
            if best:
                used.add(best["id"])
                pairs.append(dict(amazon=a, daraz=best,
                                  price_diff_pct=round((best["price_pkr"] - a["price_pkr"])
                                                       / max(a["price_pkr"], 1) * 100)))
        detail["pairs"] = pairs
    else:
        detail["pairs"] = []

    # --- who is selling ---
    if "store" in sub.columns:
        vc = sub.store.value_counts().head(5)
        total = len(sub)
        detail["sellers"] = [dict(name=str(k), products=int(v),
                                  share=round(v / total * 100))
                             for k, v in vc.items()]
    return detail


# ===========================================================================
# ROUTES — API
# ===========================================================================
@app.route("/api/health")
def health():
    return jsonify(status="ok", data_dir=DATA_DIR, files=LOADED,
                   categories=len(CATALOGUE))


@app.route("/api/overview")
def overview():
    """Headline numbers for the home page — all counted from the parquet."""
    amz_reviews = int(AMZ_PROD.n_reviews_cred.sum()) if (
        AMZ_PROD is not None and "n_reviews_cred" in AMZ_PROD) else None
    return jsonify(
        categories=len(CATALOGUE),
        amazon_products=int(AMZ_NICHE.n_products.sum()),
        amazon_sellers=int(AMZ_NICHE.n_stores.sum()) if "n_stores" in AMZ_NICHE else None,
        amazon_reviews_analysed=amz_reviews,
        daraz_listings=int(DZ_NICHE.n_products.sum()) if DZ_NICHE is not None else None,
        daraz_sellers=int(DZ_NICHE.n_sellers.sum()) if DZ_NICHE is not None else None,
        daraz_categories=int(len(DZ_NICHE)) if DZ_NICHE is not None else 0,
        with_local_data=sum(1 for c in CATALOGUE if c["local"]),
        with_opening=sum(1 for c in CATALOGUE if c["has_opening"]),
    )


@app.route("/api/categories")
def categories():
    return jsonify(sorted(CATALOGUE, key=lambda c: c["demand_score"], reverse=True))


@app.route("/api/category/<cat_id>")
def category(cat_id):
    cat = BY_ID.get(cat_id)
    if not cat:
        return jsonify(error="Unknown category"), 404
    return jsonify(dict(cat, detail=category_detail(cat)))


@app.route("/api/trends")
def trends():
    """High demand, growing, and where the listings are concentrated."""
    high = sorted(CATALOGUE, key=lambda c: c["reviews_per_product"], reverse=True)[:6]
    growing = [c for c in CATALOGUE if c["growth_ratio"] is not None]
    growing.sort(key=lambda c: c["growth_ratio"], reverse=True)
    popular = sorted(CATALOGUE, key=lambda c: c["reviews"], reverse=True)[:8]

    slim = lambda c: {k: c[k] for k in
                      ("id", "name", "image", "reviews", "reviews_per_product", "price_pkr",
                       "growth_ratio", "growth_label", "demand_label",
                       "competition_label", "sellers", "products")}
    return jsonify(
        high_demand=[slim(c) for c in high],
        growing=[slim(c) for c in growing[:6]],
        declining=[slim(c) for c in growing[-3:]][::-1] if len(growing) > 6 else [],
        popular=[slim(c) for c in popular],
        has_growth_data=bool(growing),
    )


@app.route("/api/gaps")
def gaps():
    """Every gap the pipeline found, grouped by kind."""
    quality, price_g, comp_g = [], [], []

    for c in CATALOGUE:
        if c["complaint_share"] > 0 and c["complaint"]:
            quality.append(dict(
                id=c["id"], name=c["name"], image=c["image"], aspect=c["complaint"],
                label=c["complaint_label"], text=c["complaint_text"],
                affected_pct=round(c["complaint_share"] * 100),
                products=c["products"], price_pkr=c["price_pkr"],
            ))
        if c["price_gaps"] > 0:
            price_g.append(dict(
                id=c["id"], name=c["name"], image=c["image"], gaps=c["price_gaps"],
                price_pkr=c["price_pkr"], products=c["products"],
                text=(f"{c['price_gaps']} price band"
                      f"{'s' if c['price_gaps'] > 1 else ''} with no products, "
                      f"but products selling on either side."),
            ))
        if c["concentration"] < 0.12 and c["demand_score"] > 0.4:
            comp_g.append(dict(
                id=c["id"], name=c["name"], image=c["image"], sellers=c["sellers"],
                concentration=c["concentration"], price_pkr=c["price_pkr"],
                text=(f"{c['sellers']} sellers share this category and none dominates, "
                      f"so a new seller is not blocked by a big brand."),
            ))

    quality.sort(key=lambda x: x["affected_pct"], reverse=True)
    comp_g.sort(key=lambda x: x["sellers"], reverse=True)

    by_aspect = {}
    for q in quality:
        by_aspect.setdefault(q["aspect"], []).append(q)

    local = []
    if DZ_NICHE is not None:
        for _, r in DZ_NICHE.iterrows():
            a = txt(r.get("worst_aspect"), "size")
            local.append(dict(
                niche=str(r["niche"]), aspect=a,
                label=ASPECT.get(a, ("Other", ""))[0],
                text=ASPECT.get(a, ("", ""))[1],
                lift=round(num(r.get("complaint_lift"), 1.0), 2),
                sellers=int(num(r.get("n_sellers"))),
                discount=round(num(r.get("med_discount"))),
                price_pkr=round(num(r.get("med_price"))),
            ))
        local.sort(key=lambda x: x["lift"], reverse=True)

    return jsonify(quality=quality, by_aspect=by_aspect, price=price_g,
                   competition=comp_g, local=local)


@app.route("/api/recommend", methods=["POST", "OPTIONS"])
def recommend():
    if request.method == "OPTIONS":
        return ("", 204)

    d = request.get_json(force=True, silent=True) or {}
    try:
        budget = float(d.get("budget", 500000))
        units = int(d.get("units", 200))
    except (TypeError, ValueError):
        return jsonify(error="Budget and quantity must be numbers."), 400
    if budget <= 0 or units <= 0:
        return jsonify(error="Budget and quantity must be more than zero."), 400

    model = d.get("model", "resell")          # resell | manufacture | private_label
    risk = d.get("risk", "balanced")          # low | balanced | high

    per_unit_usd = budget / units / USD_TO_PKR
    lo, hi = per_unit_usd * 0.4, per_unit_usd * 2.5

    picks = [c for c in CATALOGUE if lo <= c["price_usd"] <= hi]
    if risk == "low":
        picks = [c for c in picks if c["concentration"] <= 0.15]

    if model == "manufacture":
        picks = [c for c in picks if c["complaint_share"] > 0]
        w = (0.35, 0.55, 0.10)
    elif model == "private_label":
        picks = [c for c in picks if c["has_opening"]]
        w = (0.45, 0.45, 0.10)
    else:
        picks = [c for c in picks if c["has_opening"]]
        w = (0.70, 0.20, 0.10) if risk == "high" else (0.55, 0.35, 0.10)

    for c in picks:
        c["fit"] = (c["demand_score"] * w[0] + c["quality_score"] * w[1]
                    + c["price_score"] * w[2])
    picks.sort(key=lambda c: c["fit"], reverse=True)

    results = []
    for rank, c in enumerate(picks[:3], 1):
        if c["complaint_share"] > 0:
            headline = (f"{round(c['complaint_share'] * 100)}% of products here get "
                        f"complaints about \u201c{c['complaint_label'].lower()}\u201d "
                        f"and nobody has fixed it.")
            advice = ("If you can source or make a version that solves this without "
                      "costing much more, that is your opening.")
        else:
            headline = ("Buyers here aren't fully satisfied, but no single clear "
                        "problem stood out in the reviews.")
            advice = ("You would be entering without a clear thing to improve, which "
                      "usually means competing on price. Research further first.")

        results.append(dict(
            rank=rank, id=c["id"], name=c["name"], image=c["image"],
            score=round(c["fit"] * 100),
            price_pkr=c["price_pkr"], sellers=c["sellers"], products=c["products"],
            reviews=c["reviews"],
            headline=headline, advice=advice,
            has_problem=c["complaint_share"] > 0,
            complaint_label=c["complaint_label"], complaint_text=c["complaint_text"],
            bars=[
                dict(label="How many people buy these",
                     value=round(c["demand_score"] * 100), note=c["demand_label"]),
                dict(label="How easy it is to start selling",
                     value=round(c["room_score"] * 100), note=c["competition_label"]),
                dict(label="Is there a problem you could fix",
                     value=round(c["quality_score"] * 100), note=c["opening_label"]),
            ],
            local=c["local"],
        ))

    return jsonify(
        ok=bool(results),
        per_unit_pkr=round(budget / units),
        band_pkr=[round(lo * USD_TO_PKR), round(hi * USD_TO_PKR)],
        model=model, risk=risk,
        results=results,
        all_prices=sorted([dict(name=c["name"], price_pkr=c["price_pkr"])
                           for c in CATALOGUE], key=lambda x: x["price_pkr"]),
    )


# ===========================================================================
# ROUTES — serve the built React app
# ===========================================================================
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path):
    if not os.path.isdir(DIST_DIR):
        return ("<h2 style='font-family:sans-serif;padding:40px'>UI not built yet</h2>"
                "<p style='font-family:sans-serif;padding:0 40px'>Run "
                "<code>npm install &amp;&amp; npm run build</code> in this folder, "
                "then reload. The API is already live at <code>/api/health</code>.</p>"), 200
    if path and os.path.exists(os.path.join(DIST_DIR, path)):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


if __name__ == "__main__":
    print(f"\n  Data folder : {DATA_DIR}")
    for f, ok in LOADED.items():
        print(f"    {'OK ' if ok else '-- '} {f}")
    print(f"  Categories  : {len(CATALOGUE)}")
    print("\n  This computer : http://localhost:5000")
    print("  Phone/laptop  : http://<your-ip>:5000   (run `ipconfig` to find it)\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
