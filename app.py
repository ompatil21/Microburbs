# app.py
import os
import re
import math
import requests
from datetime import datetime, timezone
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_url_path="/static", static_folder="static")

# ---- Sandbox config ----
SANDBOX_URL = "https://www.microburbs.com.au/report_generator/api/suburb/properties"
SANDBOX_TOKEN = os.environ.get("MICROBURBS_ACCESS_TOKEN", "test")  # 'test' per docs
DATE_FMT = "%Y-%m-%d"

# ---- Built-in fallback sample (trimmed) ----
FALLBACK_SAMPLE = {
    "results": [
        {
            "address": {
                "sa1": "11101120615",
                "sal": "Belmont North",
                "state": "NSW",
                "street": "3 Dalton Close",
            },
            "area_level": "address",
            "area_name": "3 Dalton Close, Belmont North, NSW",
            "attributes": {
                "bathrooms": 1,
                "bedrooms": 3,
                "building_size": "nan",
                "garage_spaces": 2,
                "land_size": "607.0",
            },
            "coordinates": {"latitude": -33.01402088, "longitude": 151.67272249},
            "gnaf_pid": "GANSW704082298",
            "listing_date": "2025-10-03",
            "price": 950000,
            "property_type": "House",
        },
        {
            "address": {
                "sa1": "11101120618",
                "sal": "Belmont North",
                "state": "NSW",
                "street": "10 Arlington Street",
            },
            "area_level": "address",
            "area_name": "10 Arlington Street, Belmont North, NSW",
            "attributes": {
                "bathrooms": 1,
                "bedrooms": 3,
                "building_size": "None",
                "garage_spaces": 2,
                "land_size": "613 m²",
            },
            "coordinates": {"latitude": -33.01594389, "longitude": 151.67347363},
            "gnaf_pid": "GANSW704076595",
            "listing_date": "2025-09-17",
            "price": 925000,
            "property_type": "House",
        },
        {
            "address": {
                "sa1": "11101120609",
                "sal": "Belmont North",
                "state": "NSW",
                "street": "46 Patrick Street",
            },
            "area_level": "address",
            "area_name": "46 Patrick Street, Belmont North, NSW",
            "attributes": {
                "bathrooms": 1,
                "bedrooms": 4,
                "building_size": "nan",
                "garage_spaces": 4,
                "land_size": "466.0",
            },
            "coordinates": {"latitude": -33.02379398, "longitude": 151.66499999},
            "gnaf_pid": "GANSW706667618",
            "listing_date": "2025-09-15",
            "price": 920000,
            "property_type": "House",
        },
    ]
}


# ---- Helpers ----
def parse_land_size_sqm(raw):
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if s in ("none", "nan", ""):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    if not m:
        return None
    return float(m.group(1))


def parse_int_safe(x):
    try:
        return int(x)
    except:
        return None


def parse_float_safe(x):
    try:
        return float(x)
    except:
        return None


def days_since(date_str):
    try:
        dt = datetime.strptime(date_str, DATE_FMT).replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        return (now - dt).days
    except:
        return None


def compute_metrics(item):
    price = parse_float_safe(item.get("price"))
    attrs = item.get("attributes", {}) or {}
    beds = parse_int_safe(attrs.get("bedrooms"))
    baths = parse_int_safe(attrs.get("bathrooms"))
    garages = parse_int_safe(attrs.get("garage_spaces"))
    land_sqm = parse_land_size_sqm(attrs.get("land_size"))
    listing_date = item.get("listing_date")
    dom = days_since(listing_date) if listing_date else None

    p_per_bed = price / beds if (price is not None and beds and beds > 0) else None
    p_per_sqm = (
        price / land_sqm if (price is not None and land_sqm and land_sqm > 0) else None
    )

    return {
        "price": price,
        "bedrooms": beds,
        "bathrooms": baths,
        "garage_spaces": garages,
        "land_size_sqm": land_sqm,
        "listing_date": listing_date,
        "days_on_market": dom,
        "price_per_bedroom": p_per_bed,
        "price_per_sqm": p_per_sqm,
    }


def count_hist(vals):
    out = {}
    for v in vals:
        out[str(v)] = out.get(str(v), 0) + 1
    return out


def safe_median(nums):
    nums = [x for x in nums if x is not None]
    if not nums:
        return None
    nums.sort()
    n = len(nums)
    mid = n // 2
    return nums[mid] if n % 2 == 1 else (nums[mid - 1] + nums[mid]) / 2.0


# ---- API fetch with graceful fallback ----
def fetch_sandbox(suburb, property_type=None):
    headers = {
        "Authorization": f"Bearer {SANDBOX_TOKEN}",
        "Content-Type": "application/json",
    }
    params = {"suburb": suburb}
    if property_type:
        params["property_type"] = property_type
    try:
        r = requests.get(SANDBOX_URL, headers=headers, params=params, timeout=15)
        if r.status_code == 200:
            return r.json(), "sandbox"
        else:
            print(
                f"[WARN] Sandbox returned {r.status_code}: falling back to local sample."
            )
            return FALLBACK_SAMPLE, "fallback"
    except Exception as e:
        print(f"[WARN] Sandbox error {e}: falling back to local sample.")
        return FALLBACK_SAMPLE, "fallback"


@app.route("/api/properties")
def api_properties():
    suburb = request.args.get("suburb", "Belmont North")
    property_type = request.args.get("property_type")  # optional

    raw, source = fetch_sandbox(suburb=suburb, property_type=property_type)
    results = raw.get("results", [])

    enriched = []
    for r in results:
        address = r.get("address", {}) or {}
        coords = r.get("coordinates", {}) or {}
        meta = {
            "area_name": r.get("area_name"),
            "property_type": r.get("property_type"),
            "address": {
                "street": address.get("street"),
                "suburb": address.get("sal"),
                "state": address.get("state"),
                "sa1": address.get("sa1"),
            },
            "coordinates": {
                "latitude": coords.get("latitude"),
                "longitude": coords.get("longitude"),
            },
            "gnaf_pid": r.get("gnaf_pid"),
        }
        metrics = compute_metrics(r)
        enriched.append({**meta, **metrics})

    summary = {
        "count": len(enriched),
        "suburb": suburb,
        "property_type": property_type,
        "median_price": safe_median([x["price"] for x in enriched]),
        "median_price_per_sqm": safe_median([x["price_per_sqm"] for x in enriched]),
        "median_dom": safe_median([x["days_on_market"] for x in enriched]),
        "bedroom_mix": count_hist(
            [x["bedrooms"] for x in enriched if x["bedrooms"] is not None]
        ),
        "type_mix": count_hist(
            [x["property_type"] for x in enriched if x["property_type"]]
        ),
        "source": source,
    }

    return jsonify({"summary": summary, "properties": enriched})


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


if __name__ == "__main__":
    # If you do get a real key: set MICROBURBS_ACCESS_TOKEN=YOUR_KEY
    app.run(host="0.0.0.0", port=5000, debug=True)
