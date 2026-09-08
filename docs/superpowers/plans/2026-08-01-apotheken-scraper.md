# Apotheken-Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein eigenständiges Python-Tool, das alle ~17.000 Apotheken in Deutschland über Google Places (Free-Tier) findet, aus deren Websites/Impressum anreichert (E-Mail, Inhaber, Onlineshop-/Cannabis-Flag) und als angereicherte Excel/CSV-Liste exportiert — bedienbar per Web-Panel ohne Terminal.

**Architecture:** Sechsstufige, resumebare Pipeline (Discover → Fetch → Extract → Enrich → Classify → Export) mit einer SQLite-DB als State-Store. Jede Stufe ist ein eigenes Modul mit reinen, testbaren Kernfunktionen und einem `run_*`-Orchestrator. Darüber liegt ein schlankes Flask-Bedien-Panel (nur `127.0.0.1`, per SSH-Tunnel geöffnet), das die Stufen als Hintergrundprozess startet und den Fortschritt aus der DB liest.

**Tech Stack:** Python 3.11+, `requests`, `beautifulsoup4`/`lxml`, `anthropic`, `openpyxl`, `flask`, stdlib `sqlite3`/`argparse`. Tests mit `pytest`. Kein Frontend-Framework (Vanilla-JS im Panel).

## Global Constraints

- **Eigenes Repo:** `apo-scraper/` wird als eigenständiges Git-Repo angelegt (Geschwister-Verzeichnis zu `claimondo-v2`, NICHT darin verschachtelt). Alle `git`-Kommandos in diesem Plan laufen im `apo-scraper`-Repo.
- **Python:** 3.11+ (nutzt `str | None`-Union-Syntax, `tomllib` nicht nötig).
- **Free-Tier-Guard:** Discovery hat ein hartes `--max-calls`-Budget (Default 950, unter der 1.000er-Enterprise-Monatsquote). Bei Erreichen: sauberer Stopp mit gespeichertem State, kein Überschreiten.
- **Places FieldMask (verbatim):** `places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus`
- **Größen-Tiers (verbatim, EINE Quelle):** `S`=0–24, `M`=25–99, `L`=100–299, `XL`=300+ Google-Bewertungen. Definiert genau einmal in `config.SIZE_TIERS`; Classify UND Export-Legende lesen dieselbe Konstante.
- **Panel-Sicherheit:** Flask bindet ausschließlich an `127.0.0.1`. Panel-Passwort kommt aus `.env` (`PANEL_PASSWORD`), niemals im Code/Repo. `.env`, `data/*.db`, `data/html_cache/`, `exports/` sind gitignored.
- **Secrets:** `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `PANEL_PASSWORD` nur aus Umgebung/`.env` lesen, nie hardcoden oder loggen.
- **Frontend-Sprache:** Alle nutzersichtbaren Panel-Texte auf Deutsch mit echten Umlauten (ä/ö/ü/ß).
- **Result-Pattern:** `run_*`-Funktionen werfen nicht bei Einzel-Row-Fehlern; sie schreiben `status='failed'` + `fehler` und zählen weiter. Nur Programmierfehler/fehlende Secrets dürfen werfen.

---

## File Structure

```
apo-scraper/
  README.md                       # Setup, Bedienung, Deploy (Task 14)
  requirements.txt                # Task 1
  .env.example                    # Task 1
  .gitignore                      # Task 1
  config.py                       # Geteilte Konstanten: Pfade, DE_BBOX, SIZE_TIERS, Keywords, FieldMask (Task 1)
  pytest.ini                      # Task 1
  data/                           # (gitignored Inhalte)
  exports/                        # (gitignored)
  src/
    __init__.py
    db.py                         # SQLite-Schema + State-Helpers (Task 2)
    geo.py                        # BBox + Quadtree-Geometrie, rein (Task 3)
    places.py                     # PlacesClient: Text Search New, Paging, Budget-Guard (Task 4)
    discover.py                   # Stufe ① (Task 5)
    fetch.py                      # Stufe ② Website+Impressum (Task 6)
    extract.py                    # Stufe ③ Regex-Layer (Task 7)
    enrich_llm.py                 # Stufe ④ Haiku-Fallback (Task 8)
    classify.py                   # Stufe ⑤ Größe+Ketten (Task 9)
    export.py                     # Stufe ⑥ XLSX+Legende+CSV (Task 10)
    run.py                        # CLI-Orchestrator (Task 11)
    budget.py                     # Monats-Budget-Persistenz (Task 12)
    panel/
      __init__.py
      server.py                   # Flask + ProcessManager (Task 13)
      static/index.html           # Bedienfeld (Task 13 Stub, Task 14 voll)
  tools/
    Apotheken-Panel-oeffnen.bat   # Windows-Doppelklick-Tunnel-Öffner (Task 15)
  deploy/
    apo-panel.service             # systemd-Unit (Task 15)
  tests/
    __init__.py
    test_db.py                    # Task 2
    test_geo.py                   # Task 3
    test_places.py                # Task 4
    test_discover.py              # Task 5
    test_fetch.py                 # Task 6
    test_extract.py               # Task 7
    test_enrich_llm.py            # Task 8
    test_classify.py              # Task 9
    test_export.py                # Task 10
    test_run.py                   # Task 11
    test_budget.py                # Task 12
    test_panel.py                 # Task 13
    test_panel_ui.py              # Task 14
```

**Design notes:**
- `src/geo.py` und `src/places.py` sind aus dem Spec-`places.py` gesplittet: reine Geometrie (netzwerkfrei, test-reich) getrennt vom HTTP-Client (gemockt). Das hält beide Dateien fokussiert und die Quadtree-Logik ohne API-Key testbar.
- Alle Clients nehmen ihre Netzwerk-Abhängigkeit per Injection (`session`/`client`-Parameter), damit Tests ohne echte Calls laufen.

---

# PHASE A — Pipeline (lauffähiges CLI-Tool)

Nach Task 11 existiert ein vollständiges headless Tool: `python -m src.run --stage all` scraped und exportiert. Phase B setzt nur die Knöpfe darauf.

---

### Task 1: Repo-Scaffold, Config & Test-Harness

**Files:**
- Create: `apo-scraper/.gitignore`
- Create: `apo-scraper/requirements.txt`
- Create: `apo-scraper/.env.example`
- Create: `apo-scraper/pytest.ini`
- Create: `apo-scraper/config.py`
- Create: `apo-scraper/src/__init__.py`
- Create: `apo-scraper/tests/__init__.py`
- Create: `apo-scraper/tests/test_config.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `config` module mit Konstanten `DB_PATH: Path`, `CACHE_DIR: Path`, `EXPORT_DIR: Path`, `DE_BBOX: dict`, `MAX_DEPTH: int`, `MAX_CALLS_DEFAULT: int`, `SIZE_TIERS: list[tuple[str,int,int]]`, `FIELD_MASK: str`, `CANNABIS_KEYWORDS: list[str]`, `SHOP_FINGERPRINTS: list[str]`, `INHABER_PATTERNS: list[str]`, `FETCH_DELAY_S: float`, `FETCH_TIMEOUT_S: int`, `USER_AGENT: str`; Helfer `size_tier_bounds() -> list[tuple[str,int,int]]`.

- [ ] **Step 1: Repo anlegen (eigenes Git-Repo, Geschwister zu claimondo-v2)**

Run (im Parent von `claimondo-v2`):
```bash
mkdir apo-scraper && cd apo-scraper && git init
mkdir -p src tests data exports src/panel/static tools deploy
```

- [ ] **Step 2: `.gitignore` schreiben**

`apo-scraper/.gitignore`:
```gitignore
__pycache__/
*.pyc
.env
.venv/
venv/
data/*.db
data/html_cache/
exports/
.pytest_cache/
```

- [ ] **Step 3: `requirements.txt` schreiben**

`apo-scraper/requirements.txt`:
```
requests>=2.31
beautifulsoup4>=4.12
lxml>=5.0
anthropic>=0.40
openpyxl>=3.1
flask>=3.0
python-dotenv>=1.0
pytest>=8.0
```

- [ ] **Step 4: `.env.example` schreiben**

`apo-scraper/.env.example`:
```
GOOGLE_PLACES_API_KEY=
ANTHROPIC_API_KEY=
PANEL_PASSWORD=
PANEL_PORT=8765
```

- [ ] **Step 5: `pytest.ini` schreiben**

`apo-scraper/pytest.ini`:
```ini
[pytest]
testpaths = tests
pythonpath = .
```

- [ ] **Step 6: `config.py` schreiben (vollständig)**

`apo-scraper/config.py`:
```python
"""Geteilte Konstanten. SIZE_TIERS ist die EINZIGE Quelle der Groessen-Schwellen
(Classify + Export-Legende lesen beide von hier)."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "apotheken.db"
CACHE_DIR = BASE_DIR / "data" / "html_cache"
EXPORT_DIR = BASE_DIR / "exports"

# Grobe Bounding-Box Deutschland (Wurzel des adaptiven Quadtree).
DE_BBOX = {"west": 5.87, "south": 47.27, "east": 15.04, "north": 55.06}
MAX_DEPTH = 6            # Quadtree-Rekursionstiefe
MAX_CALLS_DEFAULT = 950  # unter der 1.000er-Enterprise-Monatsquote

# Groessen-Tiers: (Label, min_inclusive, max_inclusive). 999999 = offen nach oben.
SIZE_TIERS = [
    ("S", 0, 24),
    ("M", 25, 99),
    ("L", 100, 299),
    ("XL", 300, 999999),
]

# Verbatim aus dem Spec (Enterprise-SKU, ein Call liefert alles).
FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,places.addressComponents,"
    "places.location,places.nationalPhoneNumber,places.websiteUri,"
    "places.rating,places.userRatingCount,places.businessStatus"
)

CANNABIS_KEYWORDS = [
    "medizinalcannabis", "cannabisblüten", "cannabisbluten", "cannabis-rezept",
    "cannabinoide", "medizinisches cannabis", "cannabis",
]
SHOP_FINGERPRINTS = [
    "gesund.de", "mycare", "callmyapo", "ihreapotheken.de", "apora",
    "versandapotheke", "warenkorb", "online bestellen", "zum shop", "/shop",
]
INHABER_PATTERNS = [
    r"inhaber(?:in)?\s*:?\s*",
    r"inhaber der apotheke\s*:?\s*",
    r"apotheker(?:in)?\s*:?\s*",
    r"betriebsinhaber(?:in)?\s*:?\s*",
]

FETCH_DELAY_S = 2.0
FETCH_TIMEOUT_S = 10
USER_AGENT = (
    "Mozilla/5.0 (compatible; ApoListBot/1.0; +internal-sales-tool)"
)


def size_tier_bounds() -> list[tuple[str, int, int]]:
    return list(SIZE_TIERS)
```

- [ ] **Step 7: Failing test schreiben**

`apo-scraper/tests/test_config.py`:
```python
import config


def test_size_tiers_are_contiguous_and_cover_zero():
    tiers = config.size_tier_bounds()
    assert tiers[0][1] == 0
    # luecken-/ueberlappungsfrei: jede Untergrenze = vorherige Obergrenze + 1
    for (_, _, prev_max), (_, cur_min, _) in zip(tiers, tiers[1:]):
        assert cur_min == prev_max + 1


def test_field_mask_contains_rating_for_enterprise_size_proxy():
    assert "userRatingCount" in config.FIELD_MASK
    assert "nationalPhoneNumber" in config.FIELD_MASK
```

- [ ] **Step 8: Test laufen lassen — muss grün sein**

Run: `cd apo-scraper && python -m pytest tests/test_config.py -v`
Expected: 2 passed.

- [ ] **Step 9: `src/__init__.py` und `tests/__init__.py` als leere Dateien anlegen**

Beide leer.

- [ ] **Step 10: Commit**

```bash
git add .gitignore requirements.txt .env.example pytest.ini config.py src/__init__.py tests/__init__.py tests/test_config.py
git commit -m "chore: repo scaffold, config, test harness"
```

---

### Task 2: DB-Layer (Schema + State-Helpers)

**Files:**
- Create: `apo-scraper/src/db.py`
- Test: `apo-scraper/tests/test_db.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `get_connection(db_path) -> sqlite3.Connection` (Row-Factory = dict-artig)
  - `init_schema(conn) -> None`
  - `upsert_apotheke(conn, place: dict) -> bool` (True=neu eingefügt, False=bereits vorhanden)
  - `get_batch_by_status(conn, status: str, limit: int) -> list[dict]`
  - `update_row(conn, place_id: str, fields: dict, status: str | None = None) -> None`
  - `count_by_status(conn) -> dict[str, int]`

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_db.py`:
```python
import sqlite3
from src import db


def _conn():
    c = db.get_connection(":memory:")
    db.init_schema(c)
    return c


def test_upsert_is_idempotent_on_place_id():
    c = _conn()
    place = {"place_id": "p1", "name_apotheke": "Stern-Apotheke", "plz": "10115"}
    assert db.upsert_apotheke(c, place) is True
    assert db.upsert_apotheke(c, place) is False   # zweites Mal: kein Neu-Insert
    rows = db.get_batch_by_status(c, "discovered", 10)
    assert len(rows) == 1
    assert rows[0]["name_apotheke"] == "Stern-Apotheke"


def test_update_row_sets_fields_and_status():
    c = _conn()
    db.upsert_apotheke(c, {"place_id": "p1", "name_apotheke": "A"})
    db.update_row(c, "p1", {"email": "info@a.de"}, status="fetched")
    rows = db.get_batch_by_status(c, "fetched", 10)
    assert rows[0]["email"] == "info@a.de"
    assert db.count_by_status(c) == {"fetched": 1}
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_db.py -v`
Expected: FAIL (`ModuleNotFoundError` oder `AttributeError`).

- [ ] **Step 3: `src/db.py` implementieren (vollständig)**

`apo-scraper/src/db.py`:
```python
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS apotheken (
  place_id            TEXT PRIMARY KEY,
  name_apotheke       TEXT,
  strasse_hausnr      TEXT,
  plz                 TEXT,
  ort                 TEXT,
  phone               TEXT,
  domain              TEXT,
  website_url         TEXT,
  email               TEXT,
  vorname_inhaber     TEXT,
  nachname_inhaber    TEXT,
  onlineshop_vorhanden INTEGER,
  cannabis_produkte    INTEGER,
  google_rating       REAL,
  google_review_count INTEGER,
  groessenordnung     TEXT,
  kette_id            TEXT,
  filialen_count      INTEGER,
  lat REAL, lng REAL,
  business_status     TEXT,
  impressum_url       TEXT,
  enrich_confidence   TEXT,
  quelle_flags        TEXT,
  status              TEXT NOT NULL DEFAULT 'discovered',
  fehler              TEXT,
  erstellt_am         TEXT DEFAULT (datetime('now')),
  aktualisiert_am     TEXT
);
CREATE INDEX IF NOT EXISTS idx_status ON apotheken(status);
"""

# Erlaubte Spalten fuer upsert/update (Schutz gegen Tippfehler-Keys).
_COLUMNS = {
    "place_id", "name_apotheke", "strasse_hausnr", "plz", "ort", "phone",
    "domain", "website_url", "email", "vorname_inhaber", "nachname_inhaber",
    "onlineshop_vorhanden", "cannabis_produkte", "google_rating",
    "google_review_count", "groessenordnung", "kette_id", "filialen_count",
    "lat", "lng", "business_status", "impressum_url", "enrich_confidence",
    "quelle_flags", "status", "fehler",
}


def get_connection(db_path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_schema(conn) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def upsert_apotheke(conn, place: dict) -> bool:
    cols = [k for k in place if k in _COLUMNS]
    placeholders = ",".join("?" for _ in cols)
    sql = (
        f"INSERT OR IGNORE INTO apotheken ({','.join(cols)}) "
        f"VALUES ({placeholders})"
    )
    cur = conn.execute(sql, [place[k] for k in cols])
    conn.commit()
    return cur.rowcount == 1


def get_batch_by_status(conn, status: str, limit: int) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM apotheken WHERE status=? LIMIT ?", (status, limit)
    ).fetchall()
    return [dict(r) for r in rows]


def update_row(conn, place_id: str, fields: dict, status: str | None = None) -> None:
    sets, values = [], []
    for k, v in fields.items():
        if k not in _COLUMNS:
            continue
        sets.append(f"{k}=?")
        values.append(v)
    if status is not None:
        sets.append("status=?")
        values.append(status)
    sets.append("aktualisiert_am=datetime('now')")
    values.append(place_id)
    conn.execute(
        f"UPDATE apotheken SET {','.join(sets)} WHERE place_id=?", values
    )
    conn.commit()


def count_by_status(conn) -> dict[str, int]:
    rows = conn.execute(
        "SELECT status, COUNT(*) c FROM apotheken GROUP BY status"
    ).fetchall()
    return {r["status"]: r["c"] for r in rows}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_db.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/db.py tests/test_db.py
git commit -m "feat: sqlite state store with idempotent upsert + status helpers"
```

---

### Task 3: Quadtree-Geometrie (rein, netzwerkfrei)

**Files:**
- Create: `apo-scraper/src/geo.py`
- Test: `apo-scraper/tests/test_geo.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `BBox` (dataclass, Felder `west, south, east, north: float`)
  - `bbox_from_dict(d: dict) -> BBox`
  - `split(b: BBox) -> list[BBox]` (genau 4 gleich große Quadranten)
  - `to_rectangle(b: BBox) -> dict` (Google-`locationRestriction.rectangle`-Form: `{"low": {"latitude","longitude"}, "high": {...}}`)

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_geo.py`:
```python
from src import geo


def test_split_returns_four_non_overlapping_quadrants():
    b = geo.BBox(west=0.0, south=0.0, east=10.0, north=10.0)
    quads = geo.split(b)
    assert len(quads) == 4
    # Gesamtfläche der Kinder = Fläche des Elternteils
    def area(x): return (x.east - x.west) * (x.north - x.south)
    assert abs(sum(area(q) for q in quads) - area(b)) < 1e-9
    # jeder Quadrant ist ein Viertel
    for q in quads:
        assert abs(area(q) - 25.0) < 1e-9


def test_to_rectangle_maps_lat_lng_corners():
    b = geo.BBox(west=5.0, south=47.0, east=15.0, north=55.0)
    r = geo.to_rectangle(b)
    assert r["low"] == {"latitude": 47.0, "longitude": 5.0}
    assert r["high"] == {"latitude": 55.0, "longitude": 15.0}
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_geo.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: `src/geo.py` implementieren**

`apo-scraper/src/geo.py`:
```python
from dataclasses import dataclass


@dataclass(frozen=True)
class BBox:
    west: float
    south: float
    east: float
    north: float


def bbox_from_dict(d: dict) -> BBox:
    return BBox(west=d["west"], south=d["south"], east=d["east"], north=d["north"])


def split(b: BBox) -> list[BBox]:
    mid_lng = (b.west + b.east) / 2
    mid_lat = (b.south + b.north) / 2
    return [
        BBox(b.west, b.south, mid_lng, mid_lat),   # SW
        BBox(mid_lng, b.south, b.east, mid_lat),   # SE
        BBox(b.west, mid_lat, mid_lng, b.north),   # NW
        BBox(mid_lng, mid_lat, b.east, b.north),   # NE
    ]


def to_rectangle(b: BBox) -> dict:
    return {
        "low": {"latitude": b.south, "longitude": b.west},
        "high": {"latitude": b.north, "longitude": b.east},
    }
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_geo.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/geo.py tests/test_geo.py
git commit -m "feat: quadtree bbox geometry (split + google rectangle mapping)"
```

---

### Task 4: PlacesClient (Text Search New, Paging, Budget-Guard)

**Files:**
- Create: `apo-scraper/src/places.py`
- Test: `apo-scraper/tests/test_places.py`

**Interfaces:**
- Consumes: `config.FIELD_MASK`; `geo.BBox`, `geo.to_rectangle`.
- Produces:
  - `class BudgetExceeded(Exception)`
  - `class PlacesClient(api_key: str, max_calls: int, session=None)` mit Attribut `call_count: int`
  - `PlacesClient.search_text(bbox: geo.BBox, query: str = "Apotheke") -> list[dict]` — führt bis zu 3 Seiten (Paging via `nextPageToken`) aus, zählt jeden HTTP-Call in `call_count`, wirft `BudgetExceeded` BEVOR ein Call gemacht würde, der `max_calls` überschreitet. Rückgabe: Liste normalisierter Place-Dicts (`place_id, name_apotheke, strasse_hausnr, plz, ort, phone, website_url, domain, lat, lng, google_rating, google_review_count, business_status`).
  - `parse_place(raw: dict) -> dict` (rein: Google-Response-Objekt → DB-Row-Dict)

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_places.py`:
```python
import pytest
from src import places, geo


class FakeResp:
    def __init__(self, payload, status=200):
        self._p = payload
        self.status_code = status

    def json(self):
        return self._p

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")


class FakeSession:
    def __init__(self, pages):
        self.pages = list(pages)
        self.calls = 0

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls += 1
        return FakeResp(self.pages.pop(0))


def test_parse_place_maps_google_fields():
    raw = {
        "id": "p1",
        "displayName": {"text": "Stern-Apotheke"},
        "nationalPhoneNumber": "030 123",
        "websiteUri": "https://www.stern-apo.de/start",
        "rating": 4.5,
        "userRatingCount": 120,
        "businessStatus": "OPERATIONAL",
        "location": {"latitude": 52.5, "longitude": 13.4},
        "addressComponents": [
            {"types": ["route"], "longText": "Hauptstr."},
            {"types": ["street_number"], "longText": "5"},
            {"types": ["postal_code"], "longText": "10115"},
            {"types": ["locality"], "longText": "Berlin"},
        ],
    }
    row = places.parse_place(raw)
    assert row["place_id"] == "p1"
    assert row["name_apotheke"] == "Stern-Apotheke"
    assert row["plz"] == "10115"
    assert row["ort"] == "Berlin"
    assert row["strasse_hausnr"] == "Hauptstr. 5"
    assert row["domain"] == "stern-apo.de"
    assert row["google_review_count"] == 120


def test_search_text_pages_and_counts_calls():
    pages = [
        {"places": [{"id": "p1", "displayName": {"text": "A"}}], "nextPageToken": "t2"},
        {"places": [{"id": "p2", "displayName": {"text": "B"}}]},
    ]
    sess = FakeSession(pages)
    c = places.PlacesClient("KEY", max_calls=10, session=sess)
    out = c.search_text(geo.BBox(5, 47, 15, 55))
    assert {r["place_id"] for r in out} == {"p1", "p2"}
    assert c.call_count == 2


def test_budget_guard_raises_before_exceeding():
    sess = FakeSession([{"places": []}])
    c = places.PlacesClient("KEY", max_calls=0, session=sess)
    with pytest.raises(places.BudgetExceeded):
        c.search_text(geo.BBox(5, 47, 15, 55))
    assert sess.calls == 0   # kein echter Call gemacht
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_places.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: `src/places.py` implementieren**

`apo-scraper/src/places.py`:
```python
import requests
import config
from src import geo

_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"


class BudgetExceeded(Exception):
    pass


def _domain(url: str | None) -> str | None:
    if not url:
        return None
    host = url.split("//", 1)[-1].split("/", 1)[0]
    return host[4:] if host.startswith("www.") else host


def _addr(components: list[dict], *types: str) -> str | None:
    for want in types:
        for comp in components:
            if want in comp.get("types", []):
                return comp.get("longText") or comp.get("shortText")
    return None


def parse_place(raw: dict) -> dict:
    comps = raw.get("addressComponents", [])
    route = _addr(comps, "route")
    number = _addr(comps, "street_number")
    strasse = " ".join(x for x in (route, number) if x) or None
    loc = raw.get("location", {})
    website = raw.get("websiteUri")
    return {
        "place_id": raw.get("id"),
        "name_apotheke": (raw.get("displayName") or {}).get("text"),
        "strasse_hausnr": strasse,
        "plz": _addr(comps, "postal_code"),
        "ort": _addr(comps, "locality", "postal_town"),
        "phone": raw.get("nationalPhoneNumber"),
        "website_url": website,
        "domain": _domain(website),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "google_rating": raw.get("rating"),
        "google_review_count": raw.get("userRatingCount"),
        "business_status": raw.get("businessStatus"),
    }


class PlacesClient:
    def __init__(self, api_key: str, max_calls: int, session=None):
        self.api_key = api_key
        self.max_calls = max_calls
        self.call_count = 0
        self.session = session or requests.Session()

    def _headers(self):
        return {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": config.FIELD_MASK + ",nextPageToken",
        }

    def search_text(self, bbox: geo.BBox, query: str = "Apotheke") -> list[dict]:
        results, page_token, pages = [], None, 0
        while pages < 3:
            if self.call_count >= self.max_calls:
                raise BudgetExceeded(
                    f"Budget {self.max_calls} erreicht bei {self.call_count} Calls"
                )
            body = {
                "textQuery": query,
                "locationRestriction": {"rectangle": geo.to_rectangle(bbox)},
                "maxResultCount": 20,
            }
            if page_token:
                body["pageToken"] = page_token
            resp = self.session.post(
                _ENDPOINT, headers=self._headers(), json=body,
                timeout=config.FETCH_TIMEOUT_S,
            )
            self.call_count += 1
            resp.raise_for_status()
            data = resp.json()
            results.extend(parse_place(p) for p in data.get("places", []))
            page_token = data.get("nextPageToken")
            pages += 1
            if not page_token:
                break
        return results
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_places.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/places.py tests/test_places.py
git commit -m "feat: places text-search client with paging + budget guard"
```

---

### Task 5: Discovery-Orchestrator (Stufe ①)

**Files:**
- Create: `apo-scraper/src/discover.py`
- Test: `apo-scraper/tests/test_discover.py`

**Interfaces:**
- Consumes: `db.upsert_apotheke`; `geo.BBox`, `geo.split`; `places.PlacesClient` (Duck-Type: alles mit `.search_text(bbox)` + `.call_count`), `places.BudgetExceeded`; `config.MAX_DEPTH`.
- Produces:
  - `run_discovery(conn, client, root_bbox: geo.BBox, max_depth=config.MAX_DEPTH) -> dict` — adaptives Quadtree: pro Kachel `search_text`; bei exakt 60 Treffern (Cap) und `depth < max_depth` in 4 splitten und rekursieren; sonst Ergebnisse via `upsert_apotheke` in die DB. Fängt `BudgetExceeded` und stoppt sauber. Rückgabe `{"discovered": int, "calls": int, "budget_hit": bool}`.

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_discover.py`:
```python
from src import discover, db, geo


class FakeClient:
    """Gibt 60 Treffer nur fuer die Wurzel zurueck (erzwingt EINEN Split),
    danach je Kind 1 eindeutigen Treffer."""
    def __init__(self):
        self.call_count = 0
        self._root_seen = False

    def search_text(self, bbox, query="Apotheke"):
        self.call_count += 1
        if not self._root_seen:
            self._root_seen = True
            return [{"place_id": f"root{i}", "name_apotheke": "X"} for i in range(60)]
        return [{"place_id": f"leaf{self.call_count}", "name_apotheke": "Y"}]


def test_discovery_splits_on_cap_and_dedupes():
    c = db.get_connection(":memory:")
    db.init_schema(c)
    client = FakeClient()
    stats = discover.run_discovery(c, client, geo.BBox(5, 47, 15, 55), max_depth=1)
    # Wurzel (60, gesplittet) + 4 Kinder = 5 Calls
    assert stats["calls"] == 5
    # 60 root + 4 leaf, alle unique
    assert stats["discovered"] == 64
    assert stats["budget_hit"] is False


def test_discovery_stops_on_budget():
    from src import places

    class BudgetClient:
        call_count = 0
        def search_text(self, bbox, query="Apotheke"):
            raise places.BudgetExceeded("stop")

    c = db.get_connection(":memory:")
    db.init_schema(c)
    stats = discover.run_discovery(c, BudgetClient(), geo.BBox(5, 47, 15, 55))
    assert stats["budget_hit"] is True
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_discover.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/discover.py` implementieren**

`apo-scraper/src/discover.py`:
```python
import config
from src import db, geo, places

_CAP = 60   # Text Search New: max 20*3 Seiten


def run_discovery(conn, client, root_bbox: geo.BBox, max_depth=config.MAX_DEPTH) -> dict:
    discovered = 0
    budget_hit = False
    stack = [(root_bbox, 0)]
    try:
        while stack:
            bbox, depth = stack.pop()
            found = client.search_text(bbox)
            if len(found) >= _CAP and depth < max_depth:
                stack.extend((child, depth + 1) for child in geo.split(bbox))
                continue
            for place in found:
                if place.get("place_id") and db.upsert_apotheke(conn, place):
                    discovered += 1
    except places.BudgetExceeded:
        budget_hit = True
    return {
        "discovered": discovered,
        "calls": getattr(client, "call_count", 0),
        "budget_hit": budget_hit,
    }
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_discover.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/discover.py tests/test_discover.py
git commit -m "feat: adaptive quadtree discovery with dedup + budget stop"
```

---

### Task 6: Fetch (Stufe ② — Website & Impressum)

**Files:**
- Create: `apo-scraper/src/fetch.py`
- Test: `apo-scraper/tests/test_fetch.py`

**Interfaces:**
- Consumes: `db.get_batch_by_status`, `db.update_row`; `config.USER_AGENT`, `config.FETCH_TIMEOUT_S`, `config.CACHE_DIR`.
- Produces:
  - `find_impressum_url(html: str, base_url: str) -> str | None` (rein: sucht Impressum-Link, macht ihn absolut)
  - `run_fetch(conn, cache_dir, session=None, sleep=None) -> dict` — für jede Row mit `status='discovered'`: Startseite holen, Impressum-Link finden+holen, beides nach `cache_dir/<place_id>/{home,impressum}.html` cachen, `impressum_url` + `status='fetched'` schreiben. Rows ohne `website_url` → `status='fetched'`, `fehler='keine_website'`. Netzwerkfehler → `status='failed'`. Rückgabe `{"fetched": int, "failed": int, "skipped_no_site": int}`.

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_fetch.py`:
```python
from src import fetch, db


def test_find_impressum_url_makes_absolute():
    html = '<a href="/impressum">Impressum</a>'
    assert fetch.find_impressum_url(html, "https://apo.de") == "https://apo.de/impressum"


def test_find_impressum_url_matches_by_text():
    html = '<a href="/rechtliches.php">Rechtliche Hinweise</a>'
    assert fetch.find_impressum_url(html, "https://apo.de/") == "https://apo.de/rechtliches.php"


def test_find_impressum_url_none_when_absent():
    assert fetch.find_impressum_url("<a href='/team'>Team</a>", "https://apo.de") is None


class FakeResp:
    def __init__(self, text): self.text = text; self.status_code = 200
    def raise_for_status(self): pass


class FakeSession:
    def __init__(self, mapping): self.mapping = mapping
    def get(self, url, headers=None, timeout=None):
        return FakeResp(self.mapping[url])


def test_run_fetch_caches_and_marks_fetched(tmp_path):
    c = db.get_connection(":memory:")
    db.init_schema(c)
    db.upsert_apotheke(c, {"place_id": "p1", "website_url": "https://apo.de"})
    sess = FakeSession({
        "https://apo.de": '<a href="/impressum">Impressum</a>',
        "https://apo.de/impressum": "Inhaber: Dr. Max Mustermann",
    })
    stats = fetch.run_fetch(c, tmp_path, session=sess, sleep=lambda s: None)
    assert stats["fetched"] == 1
    assert (tmp_path / "p1" / "impressum.html").read_text(encoding="utf-8").startswith("Inhaber")


def test_run_fetch_skips_rows_without_website(tmp_path):
    c = db.get_connection(":memory:")
    db.init_schema(c)
    db.upsert_apotheke(c, {"place_id": "p2"})
    stats = fetch.run_fetch(c, tmp_path, session=FakeSession({}), sleep=lambda s: None)
    assert stats["skipped_no_site"] == 1
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_fetch.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/fetch.py` implementieren**

`apo-scraper/src/fetch.py`:
```python
import time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
import config
from src import db

_IMPRESSUM_HINTS = ("impressum", "imprint", "rechtlich")


def find_impressum_url(html: str, base_url: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        href = a["href"].lower()
        text = a.get_text(" ").strip().lower()
        if any(h in href for h in _IMPRESSUM_HINTS) or any(
            h in text for h in _IMPRESSUM_HINTS
        ) or "rechtliche" in text:
            return urljoin(base_url, a["href"])
    return None


def _get(session, url):
    resp = session.get(
        url, headers={"User-Agent": config.USER_AGENT}, timeout=config.FETCH_TIMEOUT_S
    )
    resp.raise_for_status()
    return resp.text


def run_fetch(conn, cache_dir, session=None, sleep=None) -> dict:
    session = session or requests.Session()
    sleep = sleep if sleep is not None else time.sleep
    stats = {"fetched": 0, "failed": 0, "skipped_no_site": 0}
    for row in db.get_batch_by_status(conn, "discovered", 100000):
        pid, site = row["place_id"], row.get("website_url")
        if not site:
            db.update_row(conn, pid, {"fehler": "keine_website"}, status="fetched")
            stats["skipped_no_site"] += 1
            continue
        try:
            home = _get(session, site)
            imp_url = find_impressum_url(home, site)
            imp_html = _get(session, imp_url) if imp_url else ""
            folder = Path(cache_dir) / pid
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "home.html").write_text(home, encoding="utf-8")
            (folder / "impressum.html").write_text(imp_html, encoding="utf-8")
            db.update_row(conn, pid, {"impressum_url": imp_url}, status="fetched")
            stats["fetched"] += 1
        except Exception as exc:  # noqa: BLE001 — Non-Critical, Row-isoliert
            db.update_row(conn, pid, {"fehler": str(exc)[:300]}, status="failed")
            stats["failed"] += 1
        sleep(config.FETCH_DELAY_S)
    return stats
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_fetch.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/fetch.py tests/test_fetch.py
git commit -m "feat: polite website+impressum fetch with html cache"
```

---

### Task 7: Extract (Stufe ③ — Regex-Layer)

**Files:**
- Create: `apo-scraper/src/extract.py`
- Test: `apo-scraper/tests/test_extract.py`

**Interfaces:**
- Consumes: `config.CANNABIS_KEYWORDS`, `config.SHOP_FINGERPRINTS`, `config.INHABER_PATTERNS`, `config.CACHE_DIR`; `db.get_batch_by_status`, `db.update_row`.
- Produces:
  - `extract_email(html: str) -> str | None`
  - `extract_inhaber_raw(text: str) -> str | None`
  - `detect_onlineshop(html_lower: str) -> bool`
  - `detect_cannabis(text_lower: str) -> tuple[bool, float]` (flag, confidence 0..1)
  - `run_extract(conn, cache_dir) -> dict` — liest den Cache je Row (`status='fetched'`), füllt `email`, `onlineshop_vorhanden`, `cannabis_produkte`, schreibt Roh-Inhaber nach `vorname_inhaber` (temporär als Rohtext) + `quelle_flags`/`enrich_confidence` JSON; markiert unsichere Felder für Stufe ④; setzt `status='extracted'`. Rückgabe `{"extracted": int, "need_llm": int}`.

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_extract.py`:
```python
from src import extract


def test_extract_email_deobfuscates():
    assert extract.extract_email("Mail: info(at)apo-berlin(punkt)de") == "info@apo-berlin.de"


def test_extract_email_prefers_mailto():
    html = '<a href="mailto:kontakt@apo.de">schreib uns</a> spam@ad.com'
    assert extract.extract_email(html) == "kontakt@apo.de"


def test_extract_inhaber_raw_after_keyword():
    text = "Inhaberin: Dr. Anna Musterfrau\nApothekerin"
    assert extract.extract_inhaber_raw(text) == "Dr. Anna Musterfrau"


def test_detect_onlineshop_by_fingerprint():
    assert extract.detect_onlineshop("... zum warenkorb ...") is True
    assert extract.detect_onlineshop("nur oeffnungszeiten") is False


def test_detect_cannabis_flag_and_confidence():
    flag, conf = extract.detect_cannabis("wir fuehren medizinalcannabis und cbd")
    assert flag is True and conf >= 0.7
    flag2, conf2 = extract.detect_cannabis("kein bezug hier")
    assert flag2 is False
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_extract.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/extract.py` implementieren**

`apo-scraper/src/extract.py`:
```python
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup
import config
from src import db

_EMAIL_RE = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", re.I)
_INHABER_RES = [re.compile(p + r"([A-Za-zÄÖÜäöüß.\- ]{3,60})", re.I) for p in config.INHABER_PATTERNS]


def _deobfuscate(s: str) -> str:
    s = re.sub(r"\s*\(?\[?\s*at\s*\]?\)?\s*", "@", s, flags=re.I)
    s = re.sub(r"\s*\(?\[?\s*(punkt|dot)\s*\]?\)?\s*", ".", s, flags=re.I)
    return s


def extract_email(html: str) -> str | None:
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        if a["href"].lower().startswith("mailto:"):
            addr = a["href"].split(":", 1)[1].split("?", 1)[0].strip()
            if _EMAIL_RE.fullmatch(addr):
                return addr.lower()
    m = _EMAIL_RE.search(_deobfuscate(html))
    return m.group(0).lower() if m else None


def extract_inhaber_raw(text: str) -> str | None:
    for rex in _INHABER_RES:
        m = rex.search(text)
        if m:
            return m.group(1).strip().rstrip(".").strip()
    return None


def detect_onlineshop(html_lower: str) -> bool:
    return any(fp in html_lower for fp in config.SHOP_FINGERPRINTS)


def detect_cannabis(text_lower: str) -> tuple[bool, float]:
    hits = [k for k in config.CANNABIS_KEYWORDS if k in text_lower]
    if not hits:
        return False, 0.0
    strong = any(h in ("medizinalcannabis", "cannabisblüten", "cannabisbluten",
                        "cannabis-rezept", "medizinisches cannabis") for h in hits)
    return True, (0.9 if strong else 0.5)


def _read(cache_dir, pid, name) -> str:
    p = Path(cache_dir) / pid / name
    return p.read_text(encoding="utf-8") if p.exists() else ""


def run_extract(conn, cache_dir) -> dict:
    extracted = need_llm = 0
    for row in db.get_batch_by_status(conn, "fetched", 100000):
        pid = row["place_id"]
        home = _read(cache_dir, pid, "home.html")
        impressum = _read(cache_dir, pid, "impressum.html")
        blob = (impressum + "\n" + home)
        blob_lower = blob.lower()

        email = extract_email(impressum) or extract_email(home)
        shop = detect_onlineshop(blob_lower)
        cannabis, c_conf = detect_cannabis(blob_lower)
        inhaber_raw = extract_inhaber_raw(impressum) or extract_inhaber_raw(home)

        flags = {"email": "regex" if email else "none",
                 "shop": "regex", "cannabis": "regex" if cannabis else "regex"}
        conf = {"email": 1.0 if email else 0.0, "cannabis": c_conf,
                "inhaber": 0.0 if inhaber_raw else 0.0}

        needs = bool(inhaber_raw) or (0 < c_conf < 0.8)
        db.update_row(conn, pid, {
            "email": email,
            "onlineshop_vorhanden": 1 if shop else 0,
            "cannabis_produkte": 1 if cannabis else 0,
            "vorname_inhaber": inhaber_raw,   # Rohtext; Split in Stufe ④
            "quelle_flags": json.dumps(flags, ensure_ascii=False),
            "enrich_confidence": json.dumps(conf, ensure_ascii=False),
        }, status="extracted")
        extracted += 1
        if needs:
            need_llm += 1
    return {"extracted": extracted, "need_llm": need_llm}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_extract.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/extract.py tests/test_extract.py
git commit -m "feat: regex enrichment layer (email/inhaber/shop/cannabis)"
```

---

### Task 8: Enrich (Stufe ④ — Haiku-Fallback)

**Files:**
- Create: `apo-scraper/src/enrich_llm.py`
- Test: `apo-scraper/tests/test_enrich_llm.py`

**Interfaces:**
- Consumes: `db.get_batch_by_status`, `db.update_row`, `config.CACHE_DIR`; ein Anthropic-artiger Client (Duck-Type mit `.messages.create(...)`, dessen Rückgabe `.content[0].text` ein JSON-String ist).
- Produces:
  - `MODEL = "claude-haiku-4-5-20251001"`
  - `build_prompt(impressum_text: str, raw: dict) -> str`
  - `enrich_row(client, impressum_text: str, raw: dict) -> dict` — ruft das LLM, parsed JSON, gibt `{vorname_inhaber, nachname_inhaber, cannabis_produkte, onlineshop_vorhanden, confidence}` zurück; bei Parse-Fehler alle Werte `None`/`confidence=0.0`.
  - `run_enrich(conn, client, cache_dir) -> dict` — für Rows `status='extracted'` mit unsicherem Feld (Rohtext in `vorname_inhaber` ODER `cannabis`-confidence im Graubereich): LLM aufrufen, Inhaber in Vor-/Nachname splitten, Werte schreiben; alle Rows → `status='enriched'`. Rückgabe `{"enriched": int, "llm_calls": int}`.

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_enrich_llm.py`:
```python
import json
from src import enrich_llm, db


class FakeMsg:
    def __init__(self, text): self.content = [type("B", (), {"text": text})]


class FakeClient:
    def __init__(self, text): self._t = text; self.calls = 0
    class _M:
        def __init__(self, outer): self.outer = outer
        def create(self, **kw):
            self.outer.calls += 1
            return FakeMsg(self.outer._t)
    @property
    def messages(self): return FakeClient._M(self)


def test_enrich_row_parses_llm_json():
    payload = json.dumps({
        "vorname_inhaber": "Anna", "nachname_inhaber": "Musterfrau",
        "cannabis_produkte": True, "onlineshop_vorhanden": None, "confidence": 0.9,
    })
    out = enrich_llm.enrich_row(FakeClient(payload), "Inhaberin: Dr. Anna Musterfrau", {})
    assert out["vorname_inhaber"] == "Anna"
    assert out["nachname_inhaber"] == "Musterfrau"
    assert out["cannabis_produkte"] is True


def test_enrich_row_survives_bad_json():
    out = enrich_llm.enrich_row(FakeClient("not json"), "x", {})
    assert out["confidence"] == 0.0
    assert out["vorname_inhaber"] is None


def test_run_enrich_only_calls_llm_for_uncertain_rows(tmp_path):
    c = db.get_connection(":memory:")
    db.init_schema(c)
    # p1: hat Roh-Inhaber -> braucht LLM; p2: nichts unsicheres
    db.upsert_apotheke(c, {"place_id": "p1"})
    db.update_row(c, "p1", {"vorname_inhaber": "Dr. Anna Musterfrau",
                            "enrich_confidence": json.dumps({"cannabis": 0.9})},
                  status="extracted")
    db.upsert_apotheke(c, {"place_id": "p2"})
    db.update_row(c, "p2", {"enrich_confidence": json.dumps({"cannabis": 0.0})},
                  status="extracted")
    payload = json.dumps({"vorname_inhaber": "Anna", "nachname_inhaber": "Musterfrau",
                          "cannabis_produkte": None, "onlineshop_vorhanden": None,
                          "confidence": 0.9})
    client = FakeClient(payload)
    stats = enrich_llm.run_enrich(c, client, tmp_path)
    assert stats["llm_calls"] == 1
    assert stats["enriched"] == 2
    rows = {r["place_id"]: r for r in db.get_batch_by_status(c, "enriched", 10)}
    assert rows["p1"]["nachname_inhaber"] == "Musterfrau"
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_enrich_llm.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/enrich_llm.py` implementieren**

`apo-scraper/src/enrich_llm.py`:
```python
import json
from pathlib import Path
from src import db

MODEL = "claude-haiku-4-5-20251001"

_EMPTY = {"vorname_inhaber": None, "nachname_inhaber": None,
          "cannabis_produkte": None, "onlineshop_vorhanden": None, "confidence": 0.0}


def build_prompt(impressum_text: str, raw: dict) -> str:
    return (
        "Extrahiere aus dem Apotheken-Impressum die Inhaber-Daten und Fakten. "
        "Titel (Dr., Prof.) NICHT in den Namen. Bei mehreren Personen die als "
        "Inhaber:in/Betriebsinhaber:in genannte waehlen. Antworte NUR mit JSON:\n"
        '{"vorname_inhaber": str|null, "nachname_inhaber": str|null, '
        '"cannabis_produkte": true|false|null, "onlineshop_vorhanden": true|false|null, '
        '"confidence": 0.0}\n\n'
        f"Roh-Extrakt: {json.dumps(raw, ensure_ascii=False)}\n\n"
        f"Impressum:\n{impressum_text[:4000]}"
    )


def enrich_row(client, impressum_text: str, raw: dict) -> dict:
    try:
        msg = client.messages.create(
            model=MODEL, max_tokens=300,
            messages=[{"role": "user", "content": build_prompt(impressum_text, raw)}],
        )
        data = json.loads(msg.content[0].text)
        return {**_EMPTY, **{k: data.get(k) for k in _EMPTY}}
    except Exception:  # noqa: BLE001 — Row-isoliert, LLM darf nie den Lauf brechen
        return dict(_EMPTY)


def _read_impressum(cache_dir, pid) -> str:
    p = Path(cache_dir) / pid / "impressum.html"
    return p.read_text(encoding="utf-8") if p.exists() else ""


def _needs_llm(row: dict) -> bool:
    if row.get("vorname_inhaber"):   # Rohtext aus Stufe ③
        return True
    try:
        conf = json.loads(row.get("enrich_confidence") or "{}")
    except json.JSONDecodeError:
        conf = {}
    c = conf.get("cannabis", 0.0)
    return 0.0 < c < 0.8


def run_enrich(conn, client, cache_dir) -> dict:
    enriched = llm_calls = 0
    for row in db.get_batch_by_status(conn, "extracted", 100000):
        pid = row["place_id"]
        fields = {}
        if _needs_llm(row):
            llm_calls += 1
            raw = {"inhaber_raw": row.get("vorname_inhaber")}
            out = enrich_row(client, _read_impressum(cache_dir, pid), raw)
            fields["vorname_inhaber"] = out["vorname_inhaber"]
            fields["nachname_inhaber"] = out["nachname_inhaber"]
            if out["cannabis_produkte"] is not None:
                fields["cannabis_produkte"] = 1 if out["cannabis_produkte"] else 0
        db.update_row(conn, pid, fields, status="enriched")
        enriched += 1
    return {"enriched": enriched, "llm_calls": llm_calls}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_enrich_llm.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/enrich_llm.py tests/test_enrich_llm.py
git commit -m "feat: haiku fallback enrichment for hard fields (name split, cannabis)"
```

---

### Task 9: Classify (Stufe ⑤ — Größe & Ketten)

**Files:**
- Create: `apo-scraper/src/classify.py`
- Test: `apo-scraper/tests/test_classify.py`

**Interfaces:**
- Consumes: `config.SIZE_TIERS`; `db.get_batch_by_status`, `db.update_row`; direkter SQL-Read über `conn`.
- Produces:
  - `size_tier(review_count: int | None) -> str` (rein; `None`→`"S"`)
  - `run_classify(conn) -> dict` — setzt `groessenordnung` je Row; gruppiert Ketten über identische `domain` (Fallback eigene `kette_id`), setzt `kette_id` + `filialen_count`; alle Rows → `status='classified'`. Rückgabe `{"classified": int, "ketten": int}`.

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_classify.py`:
```python
from src import classify, db


def test_size_tier_boundaries():
    assert classify.size_tier(0) == "S"
    assert classify.size_tier(24) == "S"
    assert classify.size_tier(25) == "M"
    assert classify.size_tier(120) == "L"
    assert classify.size_tier(300) == "XL"
    assert classify.size_tier(None) == "S"


def test_run_classify_groups_chains_by_domain():
    c = db.get_connection(":memory:")
    db.init_schema(c)
    for pid, dom, rc in [("p1", "kette.de", 50), ("p2", "kette.de", 400), ("p3", "einzel.de", 5)]:
        db.upsert_apotheke(c, {"place_id": pid, "domain": dom, "google_review_count": rc})
        db.update_row(c, pid, {}, status="enriched")
    stats = classify.run_classify(c)
    rows = {r["place_id"]: r for r in db.get_batch_by_status(c, "classified", 10)}
    assert rows["p1"]["kette_id"] == rows["p2"]["kette_id"]      # gleiche Kette
    assert rows["p1"]["filialen_count"] == 2
    assert rows["p3"]["filialen_count"] == 1
    assert rows["p2"]["groessenordnung"] == "XL"
    assert stats["classified"] == 3
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_classify.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/classify.py` implementieren**

`apo-scraper/src/classify.py`:
```python
import config
from src import db


def size_tier(review_count: int | None) -> str:
    rc = review_count or 0
    for label, lo, hi in config.SIZE_TIERS:
        if lo <= rc <= hi:
            return label
    return config.SIZE_TIERS[-1][0]


def run_classify(conn) -> dict:
    rows = db.get_batch_by_status(conn, "enriched", 100000)
    # Ketten-Gruppierung ueber domain
    by_domain: dict[str, list[str]] = {}
    for r in rows:
        dom = r.get("domain")
        if dom:
            by_domain.setdefault(dom, []).append(r["place_id"])
    ketten = 0
    domain_to_kette: dict[str, tuple[str, int]] = {}
    for dom, pids in by_domain.items():
        if len(pids) > 1:
            ketten += 1
        domain_to_kette[dom] = (f"kette:{dom}", len(pids))

    for r in rows:
        pid, dom = r["place_id"], r.get("domain")
        kette_id, count = domain_to_kette.get(dom, (f"single:{pid}", 1))
        db.update_row(conn, pid, {
            "groessenordnung": size_tier(r.get("google_review_count")),
            "kette_id": kette_id,
            "filialen_count": count,
        }, status="classified")
    return {"classified": len(rows), "ketten": ketten}
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_classify.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/classify.py tests/test_classify.py
git commit -m "feat: size tiers + chain grouping by shared domain"
```

---

### Task 10: Export (Stufe ⑥ — XLSX + Legende + CSV)

**Files:**
- Create: `apo-scraper/src/export.py`
- Test: `apo-scraper/tests/test_export.py`

**Interfaces:**
- Consumes: `config.SIZE_TIERS`, `config.EXPORT_DIR`; `conn` (direkter Read).
- Produces:
  - `EXPORT_COLUMNS: list[str]` (Zielspalten-Reihenfolge aus Spec §1)
  - `build_legend_lines() -> list[str]` (generiert aus `config.SIZE_TIERS` — EINE Quelle)
  - `export_xlsx(conn, path) -> int` (schreibt Daten-Blatt + „Legende"-Blatt; Rückgabe Zeilenzahl)
  - `export_csv(conn, path) -> int` (schreibt CSV + `LEGENDE.txt` daneben)

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_export.py`:
```python
import csv
from openpyxl import load_workbook
from src import export, db


def _seed():
    c = db.get_connection(":memory:")
    db.init_schema(c)
    db.upsert_apotheke(c, {"place_id": "p1", "name_apotheke": "Stern-Apotheke",
                           "plz": "10115", "ort": "Berlin", "domain": "stern.de",
                           "google_review_count": 300})
    db.update_row(c, "p1", {"groessenordnung": "XL", "cannabis_produkte": 1,
                            "onlineshop_vorhanden": 0, "filialen_count": 1},
                  status="classified")
    return c


def test_legend_is_generated_from_size_tiers():
    lines = "\n".join(export.build_legend_lines())
    assert "S" in lines and "0" in lines and "24" in lines
    assert "300" in lines            # XL-Untergrenze
    assert "cannabis" in lines.lower()


def test_export_xlsx_has_data_and_legend_sheet(tmp_path):
    c = _seed()
    path = tmp_path / "out.xlsx"
    n = export.export_xlsx(c, path)
    assert n == 1
    wb = load_workbook(path)
    assert "Legende" in wb.sheetnames
    data_ws = wb[wb.sheetnames[0]]
    header = [cell.value for cell in data_ws[1]]
    assert header == export.EXPORT_COLUMNS
    assert data_ws[2][export.EXPORT_COLUMNS.index("name_apotheke")].value == "Stern-Apotheke"


def test_export_csv_writes_sidecar_legend(tmp_path):
    c = _seed()
    path = tmp_path / "out.csv"
    export.export_csv(c, path)
    with open(path, encoding="utf-8") as f:
        rows = list(csv.reader(f))
    assert rows[0] == export.EXPORT_COLUMNS
    assert (tmp_path / "LEGENDE.txt").exists()
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_export.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/export.py` implementieren**

`apo-scraper/src/export.py`:
```python
import csv
from pathlib import Path
from openpyxl import Workbook
import config

EXPORT_COLUMNS = [
    "domain", "name_apotheke", "email", "phone",
    "vorname_inhaber", "nachname_inhaber",
    "strasse_hausnr", "plz", "ort",
    "groessenordnung", "onlineshop_vorhanden", "cannabis_produkte",
    "kette_id", "filialen_count",
]


def build_legend_lines() -> list[str]:
    lines = ["LEGENDE — Apotheken-Export", ""]
    lines.append("groessenordnung (Anzahl Google-Bewertungen):")
    for label, lo, hi in config.SIZE_TIERS:
        hi_txt = f"{hi}" if hi < 999999 else "und mehr"
        span = f"{lo} und mehr" if hi >= 999999 else f"{lo}–{hi}"
        lines.append(f"  {label} = {span} Bewertungen")
    lines += [
        "",
        "onlineshop_vorhanden: 1 = ja, 0 = nein, leer = unbekannt",
        "cannabis_produkte:    1 = ja, 0 = nein, leer = unbekannt",
        "",
        "kette_id / filialen_count: Apotheken mit gleicher Website zaehlen als",
        "  Verbund; filialen_count = Anzahl Standorte der Kette (1 = Einzelapotheke).",
    ]
    return lines


def _rows(conn):
    cols = ",".join(EXPORT_COLUMNS)
    return conn.execute(
        f"SELECT {cols} FROM apotheken WHERE status='classified'"
    ).fetchall()


def export_xlsx(conn, path) -> int:
    rows = _rows(conn)
    wb = Workbook()
    ws = wb.active
    ws.title = "Apotheken"
    ws.append(EXPORT_COLUMNS)
    for r in rows:
        ws.append([r[c] for c in EXPORT_COLUMNS])
    legend = wb.create_sheet("Legende")
    for line in build_legend_lines():
        legend.append([line])
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(path))
    return len(rows)


def export_csv(conn, path) -> int:
    rows = _rows(conn)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(EXPORT_COLUMNS)
        for r in rows:
            w.writerow([r[c] for c in EXPORT_COLUMNS])
    (path.parent / "LEGENDE.txt").write_text(
        "\n".join(build_legend_lines()), encoding="utf-8"
    )
    return len(rows)
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_export.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/export.py tests/test_export.py
git commit -m "feat: xlsx+csv export with size-tier legend from single source"
```

---

### Task 11: CLI-Orchestrator (`run.py`)

**Files:**
- Create: `apo-scraper/src/run.py`
- Test: `apo-scraper/tests/test_run.py`

**Interfaces:**
- Consumes: alle `run_*`-Funktionen; `config`; `db.get_connection`, `db.init_schema`, `db.count_by_status`; `geo.bbox_from_dict`; `places.PlacesClient`.
- Produces:
  - `build_parser() -> argparse.ArgumentParser` (`--stage {all,discover,fetch,extract,enrich,classify,export}`, `--max-calls INT`, `--db PATH`)
  - `run_stage(stage: str, *, max_calls, db_path, deps=None) -> dict` — dispatcht auf die Stufen; `deps` erlaubt Test-Injektion von Clients (`{"places_client":..., "anthropic_client":...}`).
  - `main(argv=None) -> int`

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_run.py`:
```python
from src import run, db, geo


class FakeClient:
    call_count = 0
    def __init__(self): FakeClient.call_count = 0
    def search_text(self, bbox, query="Apotheke"):
        self.call_count += 1
        return [{"place_id": "p1", "name_apotheke": "A"}] if self.call_count == 1 else []


def test_parser_defaults():
    args = run.build_parser().parse_args(["--stage", "discover"])
    assert args.stage == "discover"
    assert args.max_calls == run.config.MAX_CALLS_DEFAULT


def test_run_stage_discover_uses_injected_client(tmp_path):
    dbp = tmp_path / "t.db"
    stats = run.run_stage(
        "discover", max_calls=10, db_path=dbp,
        deps={"places_client": FakeClient()},
    )
    assert stats["discovered"] == 1
    c = db.get_connection(dbp)
    assert db.count_by_status(c).get("discovered") == 1
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_run.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/run.py` implementieren**

`apo-scraper/src/run.py`:
```python
import argparse
import os
import sys
from dotenv import load_dotenv
import config
from src import (db, geo, places, discover, fetch, extract,
                 enrich_llm, classify, export)

load_dotenv()

STAGES = ["discover", "fetch", "extract", "enrich", "classify", "export"]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="apo-scraper")
    p.add_argument("--stage", choices=["all"] + STAGES, default="all")
    p.add_argument("--max-calls", type=int, default=config.MAX_CALLS_DEFAULT)
    p.add_argument("--db", dest="db_path", default=str(config.DB_PATH))
    return p


def _places_client(max_calls, deps):
    if deps and deps.get("places_client"):
        return deps["places_client"]
    return places.PlacesClient(os.environ["GOOGLE_PLACES_API_KEY"], max_calls)


def _anthropic_client(deps):
    if deps and deps.get("anthropic_client"):
        return deps["anthropic_client"]
    import anthropic
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def run_stage(stage: str, *, max_calls, db_path, deps=None) -> dict:
    conn = db.get_connection(db_path)
    db.init_schema(conn)
    if stage == "discover":
        client = _places_client(max_calls, deps)
        return discover.run_discovery(conn, client, geo.bbox_from_dict(config.DE_BBOX))
    if stage == "fetch":
        return fetch.run_fetch(conn, config.CACHE_DIR)
    if stage == "extract":
        return extract.run_extract(conn, config.CACHE_DIR)
    if stage == "enrich":
        return enrich_llm.run_enrich(conn, _anthropic_client(deps), config.CACHE_DIR)
    if stage == "classify":
        return classify.run_classify(conn)
    if stage == "export":
        ts = "export"
        xlsx = config.EXPORT_DIR / f"apotheken_{ts}.xlsx"
        csvp = config.EXPORT_DIR / f"apotheken_{ts}.csv"
        n = export.export_xlsx(conn, xlsx)
        export.export_csv(conn, csvp)
        return {"exported": n, "xlsx": str(xlsx), "csv": str(csvp)}
    raise ValueError(stage)


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    stages = STAGES if args.stage == "all" else [args.stage]
    for st in stages:
        stats = run_stage(st, max_calls=args.max_calls, db_path=args.db_path)
        print(f"[{st}] {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_run.py -v`
Expected: 2 passed.

- [ ] **Step 5: Volle Test-Suite grün + Commit**

Run: `python -m pytest -q`
Expected: alle Tests passed.
```bash
git add src/run.py tests/test_run.py
git commit -m "feat: cli orchestrator wiring all six stages"
```

---

# PHASE B — Monats-Budget, Bedien-Panel & Deploy

---

### Task 12: Monats-Budget-Persistenz (Free-Tier echt machen)

Der `--max-calls`-Guard aus Task 4 schützt nur *pro Lauf*. Damit „1000 Gratis-Abfragen **diesen Monat**" echt stimmt, wird der Verbrauch pro Kalendermonat in der DB persistiert und der Discovery-Lauf auf das Rest-Budget gedeckelt.

**Files:**
- Create: `apo-scraper/src/budget.py`
- Modify: `apo-scraper/config.py` (Konstante ergänzen)
- Modify: `apo-scraper/src/run.py` (discover-Zweig)
- Test: `apo-scraper/tests/test_budget.py`

**Interfaces:**
- Consumes: `conn`.
- Produces:
  - `current_month(today=None) -> str` (`"YYYY-MM"`, `today` injizierbar für Tests)
  - `ensure_budget_table(conn) -> None`
  - `calls_used_this_month(conn, month: str) -> int`
  - `record_calls(conn, month: str, n: int) -> None`
  - `remaining(conn, month: str, limit: int) -> int`

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_budget.py`:
```python
from datetime import date
from src import budget, db


def test_current_month_formats():
    assert budget.current_month(date(2026, 8, 1)) == "2026-08"


def test_record_and_remaining_accumulate():
    c = db.get_connection(":memory:")
    db.init_schema(c)
    m = "2026-08"
    assert budget.calls_used_this_month(c, m) == 0
    budget.record_calls(c, m, 300)
    budget.record_calls(c, m, 200)
    assert budget.calls_used_this_month(c, m) == 500
    assert budget.remaining(c, m, 1000) == 500
    # anderer Monat unberührt
    assert budget.calls_used_this_month(c, "2026-09") == 0
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_budget.py -v`
Expected: FAIL.

- [ ] **Step 3: `src/budget.py` implementieren**

`apo-scraper/src/budget.py`:
```python
from datetime import date


def current_month(today=None) -> str:
    d = today or date.today()
    return d.strftime("%Y-%m")


def ensure_budget_table(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS api_budget "
        "(month TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0)"
    )
    conn.commit()


def calls_used_this_month(conn, month: str) -> int:
    ensure_budget_table(conn)
    row = conn.execute(
        "SELECT calls FROM api_budget WHERE month=?", (month,)
    ).fetchone()
    return row[0] if row else 0


def record_calls(conn, month: str, n: int) -> None:
    ensure_budget_table(conn)
    conn.execute(
        "INSERT INTO api_budget (month, calls) VALUES (?, ?) "
        "ON CONFLICT(month) DO UPDATE SET calls = calls + excluded.calls",
        (month, n),
    )
    conn.commit()


def remaining(conn, month: str, limit: int) -> int:
    return max(0, limit - calls_used_this_month(conn, month))
```

- [ ] **Step 4: `config.py` erweitern**

In `apo-scraper/config.py` nach `MAX_CALLS_DEFAULT` ergänzen:
```python
MONTHLY_ENTERPRISE_LIMIT = 1000  # Google Free-Tier Enterprise-SKU pro Monat
```

- [ ] **Step 5: `run.py` discover-Zweig anpassen (deckelt auf Rest-Budget + bucht Verbrauch)**

In `apo-scraper/src/run.py` den Import ergänzen:
```python
from src import (db, geo, places, discover, fetch, extract,
                 enrich_llm, classify, export, budget)
```
Und den `if stage == "discover":`-Block in `run_stage` **ersetzen** durch:
```python
    if stage == "discover":
        month = budget.current_month()
        allowed = min(max_calls, budget.remaining(conn, month, config.MONTHLY_ENTERPRISE_LIMIT))
        client = _places_client(allowed, deps)
        stats = discover.run_discovery(conn, client, geo.bbox_from_dict(config.DE_BBOX))
        budget.record_calls(conn, month, getattr(client, "call_count", 0))
        stats["budget_used_month"] = budget.calls_used_this_month(conn, month)
        return stats
```

- [ ] **Step 6: Tests laufen lassen — Budget + Run grün**

Run: `python -m pytest tests/test_budget.py tests/test_run.py -v`
Expected: alle passed (test_run bleibt grün: injizierter Client wird jetzt zusätzlich verbucht).

- [ ] **Step 7: Commit**

```bash
git add src/budget.py config.py src/run.py tests/test_budget.py
git commit -m "feat: persistent monthly api budget capping discovery to free-tier"
```

---

### Task 13: Panel-Server (Flask + ProcessManager + Auth)

**Files:**
- Create: `apo-scraper/src/panel/__init__.py` (leer)
- Create: `apo-scraper/src/panel/server.py`
- Create: `apo-scraper/src/panel/static/index.html` (Minimal-Stub; volle UI in Task 14)
- Test: `apo-scraper/tests/test_panel.py`

**Interfaces:**
- Consumes: `config`, `db`, `budget`, `export`, `run` (für Default-Runner + `run.STAGES`).
- Produces:
  - `class ProcessManager(runner)` mit `state`, `current_stage`, `last_stats`, `error`, `is_running()`, `start(stages)`, `run_sync(stages)`, `pause()`, `resume()`, `stop()`
  - `reset_failed(conn) -> int`
  - `create_app(runner=None, db_path=None) -> Flask`
  - Endpoints: `GET /`, `POST /api/login`, `GET /api/status`, `POST /api/start`, `POST /api/pause`, `POST /api/resume`, `POST /api/stop`, `POST /api/stage/<name>`, `POST /api/retry-failed`, `POST /api/export`, `GET /api/download/<fmt>` — alle `/api/*` außer `/api/login` erfordern `Authorization: Bearer <PANEL_PASSWORD>`.

- [ ] **Step 1: Failing test schreiben**

`apo-scraper/tests/test_panel.py`:
```python
from src.panel import server
from src import db


def test_process_manager_runs_all_stages():
    seen = []
    pm = server.ProcessManager(runner=lambda st: (seen.append(st) or {"ok": st}))
    pm.run_sync(["discover", "fetch"])
    assert seen == ["discover", "fetch"]
    assert pm.state == "done"


def test_process_manager_stop_skips_stages():
    pm = server.ProcessManager(runner=lambda st: {"ok": 1})
    pm.stop()
    pm.run_sync(["discover"])
    assert pm.state == "stopped"


def test_process_manager_records_error():
    def boom(st): raise RuntimeError("kaputt")
    pm = server.ProcessManager(runner=boom)
    pm.run_sync(["discover"])
    assert pm.state == "error"
    assert "kaputt" in pm.error


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("PANEL_PASSWORD", "secret")
    app = server.create_app(runner=lambda st: {"ok": st},
                            db_path=str(tmp_path / "t.db"))
    return app.test_client()


def test_status_requires_bearer_auth(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    assert c.get("/api/status").status_code == 401
    r = c.get("/api/status", headers={"Authorization": "Bearer secret"})
    assert r.status_code == 200
    body = r.get_json()
    assert "counts" in body and body["budget"]["limit"] == 1000


def test_index_served_at_root(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    assert c.get("/").status_code == 200
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_panel.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: `src/panel/__init__.py` (leer) + Minimal-`index.html`-Stub anlegen**

`apo-scraper/src/panel/static/index.html`:
```html
<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Apotheken-Scraper</title></head>
<body><h1>Apotheken-Scraper</h1><button id="start">Scrapen starten</button></body></html>
```

- [ ] **Step 4: `src/panel/server.py` implementieren**

`apo-scraper/src/panel/server.py`:
```python
import functools
import hmac
import os
import threading
import time
from pathlib import Path
from flask import Flask, request, jsonify, send_file, send_from_directory
import config
from src import db, budget, export, run

_STATIC = Path(__file__).resolve().parent / "static"


class ProcessManager:
    def __init__(self, runner):
        self.runner = runner
        self._stop = threading.Event()
        self._pause = threading.Event()
        self._thread = None
        self.state = "idle"
        self.current_stage = None
        self.last_stats = {}
        self.error = None

    def is_running(self):
        return self._thread is not None and self._thread.is_alive()

    def start(self, stages):
        if self.is_running():
            return False
        self._stop.clear()
        self._pause.clear()
        self.error = None
        self.last_stats = {}
        self._thread = threading.Thread(
            target=self.run_sync, args=(stages,), daemon=True
        )
        self._thread.start()
        return True

    def run_sync(self, stages):
        self.state = "running"
        for st in stages:
            if self._stop.is_set():
                self.state = "stopped"
                self.current_stage = None
                return
            while self._pause.is_set() and not self._stop.is_set():
                self.state = "paused"
                time.sleep(0.15)
            if self._stop.is_set():
                self.state = "stopped"
                self.current_stage = None
                return
            self.state = "running"
            self.current_stage = st
            try:
                self.last_stats[st] = self.runner(st)
            except Exception as exc:  # noqa: BLE001 — im UI als Fehler anzeigen
                self.state = "error"
                self.error = str(exc)[:300]
                self.current_stage = None
                return
        self.state = "done"
        self.current_stage = None

    def pause(self):
        self._pause.set()

    def resume(self):
        self._pause.clear()

    def stop(self):
        self._stop.set()
        self._pause.clear()


def reset_failed(conn) -> int:
    cur = conn.execute(
        "UPDATE apotheken SET status='discovered', fehler=NULL WHERE status='failed'"
    )
    conn.commit()
    return cur.rowcount


def _default_runner(db_path):
    def runner(stage):
        return run.run_stage(stage, max_calls=config.MAX_CALLS_DEFAULT, db_path=db_path)
    return runner


def _preview(conn):
    rows = conn.execute(
        "SELECT name_apotheke, ort, email FROM apotheken "
        "WHERE name_apotheke IS NOT NULL LIMIT 10"
    ).fetchall()
    return [dict(r) for r in rows]


def require_auth(fn):
    @functools.wraps(fn)
    def wrap(*a, **k):
        pw = os.environ.get("PANEL_PASSWORD", "")
        header = request.headers.get("Authorization", "")
        token = header[7:] if header.startswith("Bearer ") else ""
        if not pw or not hmac.compare_digest(token, pw):
            return jsonify({"error": "unauthorized"}), 401
        return fn(*a, **k)
    return wrap


def create_app(runner=None, db_path=None) -> Flask:
    app = Flask(__name__)
    db_path = db_path or str(config.DB_PATH)
    pm = ProcessManager(runner or _default_runner(db_path))

    def _conn():
        c = db.get_connection(db_path)
        db.init_schema(c)
        return c

    @app.get("/")
    def index():
        return send_from_directory(_STATIC, "index.html")

    @app.post("/api/login")
    def login():
        pw = os.environ.get("PANEL_PASSWORD", "")
        given = (request.get_json(silent=True) or {}).get("password", "")
        ok = bool(pw) and hmac.compare_digest(given, pw)
        return jsonify({"ok": ok}), (200 if ok else 401)

    @app.get("/api/status")
    @require_auth
    def status():
        conn = _conn()
        month = budget.current_month()
        return jsonify({
            "state": pm.state,
            "current_stage": pm.current_stage,
            "counts": db.count_by_status(conn),
            "budget": {
                "used": budget.calls_used_this_month(conn, month),
                "limit": config.MONTHLY_ENTERPRISE_LIMIT,
            },
            "preview": _preview(conn),
            "last_stats": pm.last_stats,
            "error": pm.error,
        })

    @app.post("/api/start")
    @require_auth
    def start():
        started = pm.start(["discover", "fetch", "extract", "enrich", "classify"])
        return jsonify({"ok": started}), (200 if started else 409)

    @app.post("/api/stage/<name>")
    @require_auth
    def stage(name):
        if name not in run.STAGES:
            return jsonify({"error": "unbekannte Stufe"}), 400
        return jsonify({"ok": pm.start([name])})

    @app.post("/api/pause")
    @require_auth
    def pause():
        pm.pause()
        return jsonify({"ok": True})

    @app.post("/api/resume")
    @require_auth
    def resume():
        pm.resume()
        return jsonify({"ok": True})

    @app.post("/api/stop")
    @require_auth
    def stop():
        pm.stop()
        return jsonify({"ok": True})

    @app.post("/api/retry-failed")
    @require_auth
    def retry_failed():
        return jsonify({"reset": reset_failed(_conn())})

    @app.post("/api/export")
    @require_auth
    def do_export():
        conn = _conn()
        config.EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        xlsx = config.EXPORT_DIR / "apotheken_export.xlsx"
        csvp = config.EXPORT_DIR / "apotheken_export.csv"
        n = export.export_xlsx(conn, xlsx)
        export.export_csv(conn, csvp)
        return jsonify({"exported": n})

    @app.get("/api/download/<fmt>")
    @require_auth
    def download(fmt):
        name = {"xlsx": "apotheken_export.xlsx", "csv": "apotheken_export.csv"}.get(fmt)
        if not name:
            return jsonify({"error": "format"}), 400
        path = config.EXPORT_DIR / name
        if not path.exists():
            return jsonify({"error": "noch kein Export"}), 404
        return send_file(str(path), as_attachment=True, download_name=name)

    return app


if __name__ == "__main__":
    port = int(os.environ.get("PANEL_PORT", "8765"))
    create_app().run(host="127.0.0.1", port=port)
```

- [ ] **Step 5: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_panel.py -v`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/panel/__init__.py src/panel/server.py src/panel/static/index.html tests/test_panel.py
git commit -m "feat: flask panel server (process manager, bearer auth, status/export/download)"
```

---

### Task 14: Panel-UI (`index.html` — die Knöpfe)

Ersetzt den Stub aus Task 13 durch das vollständige Bedienfeld. Vanilla-JS, pollt `/api/status`, hält das Passwort nur im Speicher, schickt es als Bearer-Token. Alle Texte Deutsch mit echten Umlauten.

**Files:**
- Modify (overwrite): `apo-scraper/src/panel/static/index.html`
- Test: `apo-scraper/tests/test_panel_ui.py`

**Interfaces:**
- Consumes: die Panel-API aus Task 13.
- Produces: statische Seite (kein Python-Export).

- [ ] **Step 1: Failing test schreiben (prüft, dass die Kern-Elemente vorhanden sind)**

`apo-scraper/tests/test_panel_ui.py`:
```python
from pathlib import Path

HTML = Path("src/panel/static/index.html").read_text(encoding="utf-8")


def test_ui_has_core_controls_in_german():
    for needle in ["Scrapen starten", "Pause", "Stopp",
                   "Ergebnis herunterladen", "Erweitert",
                   "Gratis-Abfragen", "/api/status", "Bearer"]:
        assert needle in HTML


def test_ui_binds_localhost_only_note():
    # Sicherheits-Hinweis im UI, dass es nur lokal laeuft
    assert "127.0.0.1" in HTML or "nur lokal" in HTML
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `python -m pytest tests/test_panel_ui.py -v`
Expected: FAIL (Stub enthält die Texte nicht).

- [ ] **Step 3: `index.html` vollständig schreiben**

`apo-scraper/src/panel/static/index.html`:
```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apotheken-Scraper</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto;
         padding: 0 1rem; color: #0D1B3E; }
  h1 { font-size: 1.4rem; }
  button { font-size: 1rem; padding: .6rem 1rem; border-radius: 10px; border: 0;
           cursor: pointer; }
  .primary { background: #0D1B3E; color: #fff; font-size: 1.2rem; padding: .9rem 1.6rem; }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0; }
  .bar { height: 14px; background: #e6eaf2; border-radius: 7px; overflow: hidden; }
  .bar > span { display: block; height: 100%; background: #4573A2; width: 0; }
  .muted { color: #667; font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; margin-top: .5rem; }
  td, th { border-bottom: 1px solid #e6eaf2; padding: .3rem .4rem; text-align: left; }
  details { margin-top: 1.5rem; }
  #login { margin: 2rem 0; }
  .hidden { display: none; }
  .ampel-gruen { color: #1a7f37; } .ampel-gelb { color: #b7791f; } .ampel-rot { color: #b42318; }
</style>
</head>
<body>
<h1>Apotheken-Scraper</h1>
<p class="muted">Läuft nur lokal auf dem Server (127.0.0.1), erreichbar über den sicheren Tunnel.</p>

<div id="login">
  <input id="pw" type="password" placeholder="Panel-Passwort">
  <button onclick="login()">Anmelden</button>
  <span id="loginerr" class="ampel-rot"></span>
</div>

<div id="app" class="hidden">
  <div class="row">
    <button class="primary" onclick="post('/api/start')">▶ Scrapen starten</button>
    <button onclick="post('/api/pause')">⏸ Pause</button>
    <button onclick="post('/api/resume')">▶ Weiter</button>
    <button onclick="post('/api/stop')">⏹ Stopp</button>
  </div>

  <p><b>Status:</b> <span id="state">–</span> <span id="stage" class="muted"></span></p>
  <div class="bar"><span id="progress"></span></div>
  <p class="muted"><span id="counts"></span></p>

  <p><b>Gratis-Abfragen diesen Monat:</b>
     <span id="budget" class="ampel-gruen">–</span></p>

  <div class="row">
    <button onclick="doExport()">📥 Ergebnis herunterladen</button>
  </div>

  <h3>Vorschau</h3>
  <table><thead><tr><th>Apotheke</th><th>Ort</th><th>E-Mail</th></tr></thead>
    <tbody id="preview"></tbody></table>

  <details>
    <summary>Erweitert</summary>
    <div class="row">
      <button onclick="post('/api/stage/discover')">Nur Suchen</button>
      <button onclick="post('/api/stage/fetch')">Nur Webseiten holen</button>
      <button onclick="post('/api/stage/extract')">Nur Auslesen</button>
      <button onclick="post('/api/stage/enrich')">Nur Anreichern</button>
      <button onclick="post('/api/stage/classify')">Nur Einordnen</button>
      <button onclick="post('/api/retry-failed')">Fehlgeschlagene erneut versuchen</button>
    </div>
  </details>
  <p id="err" class="ampel-rot"></p>
</div>

<script>
let TOKEN = "";
function headers() { return { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" }; }

async function login() {
  TOKEN = document.getElementById("pw").value;
  const r = await fetch("/api/status", { headers: headers() });
  if (r.ok) {
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    tick();
  } else {
    document.getElementById("loginerr").textContent = "Passwort falsch";
    TOKEN = "";
  }
}

async function post(path) {
  await fetch(path, { method: "POST", headers: headers() });
  tick();
}

async function doExport() {
  await fetch("/api/export", { method: "POST", headers: headers() });
  window.location = "/api/download/xlsx?_=" + Date.now();  // Download via Bearer-losen Klick nicht moeglich -> Fallback unten
}

function fmtCounts(c) {
  return Object.entries(c).map(([k, v]) => k + ": " + v).join("  ·  ");
}

async function tick() {
  const r = await fetch("/api/status", { headers: headers() });
  if (!r.ok) return;
  const s = await r.json();
  document.getElementById("state").textContent = s.state;
  document.getElementById("stage").textContent = s.current_stage ? "(" + s.current_stage + ")" : "";
  document.getElementById("counts").textContent = fmtCounts(s.counts);
  const used = s.budget.used, lim = s.budget.limit;
  const b = document.getElementById("budget");
  b.textContent = used + " / " + lim;
  b.className = used < lim * 0.7 ? "ampel-gruen" : (used < lim ? "ampel-gelb" : "ampel-rot");
  const total = Object.values(s.counts).reduce((a, x) => a + x, 0) || 1;
  const done = (s.counts.classified || 0) + (s.counts.exported || 0);
  document.getElementById("progress").style.width = Math.round(done / total * 100) + "%";
  const tb = document.getElementById("preview");
  tb.innerHTML = (s.preview || []).map(p =>
    "<tr><td>" + (p.name_apotheke || "") + "</td><td>" + (p.ort || "") +
    "</td><td>" + (p.email || "") + "</td></tr>").join("");
  document.getElementById("err").textContent = s.error || "";
}
setInterval(() => { if (TOKEN) tick(); }, 3000);
</script>
</body>
</html>
```

- [ ] **Step 4: Download-Auth-Hinweis umsetzen (Bearer-Download)**

Weil ein normaler Link keinen Bearer-Header sendet, den Download in `doExport()` per Fetch+Blob lösen. Ersetze die `doExport`-Funktion durch:
```javascript
async function doExport() {
  await fetch("/api/export", { method: "POST", headers: headers() });
  const r = await fetch("/api/download/xlsx", { headers: headers() });
  if (!r.ok) { alert("Noch kein Ergebnis zum Herunterladen."); return; }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "apotheken_export.xlsx"; a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Test laufen lassen — muss grün sein**

Run: `python -m pytest tests/test_panel_ui.py -v`
Expected: 2 passed.

- [ ] **Step 6: Manueller Smoke (lokal)**

Run:
```bash
PANEL_PASSWORD=test PANEL_PORT=8765 python -m src.panel.server
```
Im Browser `http://127.0.0.1:8765` öffnen, mit `test` anmelden, prüfen: Start-Knopf, Budget-Anzeige, „Erweitert" klappt auf. `Strg+C` zum Beenden.

- [ ] **Step 7: Commit**

```bash
git add src/panel/static/index.html tests/test_panel_ui.py
git commit -m "feat: panel ui with start/pause/stop, budget ampel, preview, download"
```

---

### Task 15: Deploy — Tunnel-Öffner, systemd-Unit & README

**Files:**
- Create: `apo-scraper/tools/Apotheken-Panel-oeffnen.bat`
- Create: `apo-scraper/deploy/apo-panel.service`
- Create: `apo-scraper/README.md`

**Interfaces:**
- Consumes: alles Vorherige.
- Produces: bedienbares Deployment (kein Python-Export, keine Unit-Tests — Verifikation per Inspektion + manuellem Smoke).

- [ ] **Step 1: Windows-Doppelklick-Öffner schreiben**

`apo-scraper/tools/Apotheken-Panel-oeffnen.bat` (VPS-Host/Port ggf. anpassen):
```bat
@echo off
REM Baut den sicheren SSH-Tunnel zum Panel auf und oeffnet den Browser.
set VPS=root@212.132.119.110
set PORT=8765
echo Verbinde mit dem Apotheken-Panel...
start "" http://127.0.0.1:%PORT%
ssh -N -L %PORT%:127.0.0.1:%PORT% %VPS%
```

- [ ] **Step 2: systemd-Unit schreiben**

`apo-scraper/deploy/apo-panel.service`:
```ini
[Unit]
Description=Apotheken-Scraper Panel (localhost only)
After=network.target

[Service]
WorkingDirectory=/opt/apo-scraper
Environment=PYTHONPATH=/opt/apo-scraper
EnvironmentFile=/opt/apo-scraper/.env
ExecStart=/opt/apo-scraper/.venv/bin/python -m src.panel.server
Restart=on-failure
User=apo

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: README schreiben**

`apo-scraper/README.md`:
```markdown
# apo-scraper

Findet alle Apotheken in Deutschland (Google Places, Free-Tier), reichert sie aus
den Websites/Impressen an (E-Mail, Inhaber, Onlineshop-/Cannabis-Flag) und
exportiert eine Excel/CSV-Liste. Bedienung über ein Web-Panel — ohne Terminal.

## Einmalige Einrichtung (VPS)
1. Repo nach `/opt/apo-scraper` klonen.
2. `python -m venv .venv && .venv/bin/pip install -r requirements.txt`
3. `.env.example` → `.env` kopieren, ausfüllen:
   `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `PANEL_PASSWORD`, `PANEL_PORT`.
4. `deploy/apo-panel.service` → `/etc/systemd/system/`, dann
   `systemctl enable --now apo-panel`. Panel lauscht NUR auf 127.0.0.1.

## Bedienung (ohne Terminal)
`tools/Apotheken-Panel-oeffnen.bat` doppelklicken → Browser öffnet das Panel über
den SSH-Tunnel. Passwort eingeben, „Scrapen starten". Der Lauf stoppt automatisch
am Gratis-Limit (1000 Abfragen/Monat). „Ergebnis herunterladen" liefert Excel+CSV.

## Für Entwickler (CLI, headless)
`python -m src.run --stage all --max-calls 950`
Einzelne Stufe: `--stage discover|fetch|extract|enrich|classify|export`.
Tests: `python -m pytest -q`.

## Größen-Legende
Im Excel-Export unter „Legende": S=0–24, M=25–99, L=100–299, XL=300+ Bewertungen.
```

- [ ] **Step 4: Volle Test-Suite grün**

Run: `python -m pytest -q`
Expected: alle Tests passed.

- [ ] **Step 5: Commit**

```bash
git add tools/Apotheken-Panel-oeffnen.bat deploy/apo-panel.service README.md
git commit -m "docs+deploy: tunnel opener, systemd unit, readme"
```

---

## Spec-Coverage (Self-Review-Nachweis)

| Spec-Abschnitt | Task(s) |
|---|---|
| §1 Zielspalten | Task 4 (Places-Felder), 6/7/8 (Anreicherung), 10 (Export-Reihenfolge) |
| §2 6-Stufen-Pipeline + SQLite-State | Task 2 (DB), 5–11 (Stufen) |
| §3 Discovery Quadtree + Budget-Guard | Task 3 (Geo), 4 (Client/Guard), 5 (Orchestrator), 12 (Monatsbudget) |
| §4 Fetch Website/Impressum + Politeness | Task 6 |
| §5 Extract Regex-Layer | Task 7 |
| §6 Enrich Haiku-Fallback | Task 8 |
| §7 Classify Größe + Ketten | Task 9 |
| §8 Export + Legende + Kosten/Free-Tier | Task 10 (Export/Legende), 12 (Free-Tier-Deckel) |
| §9 Bedien-Panel (Knöpfe, Budget-Ampel, Zugang) | Task 13 (Server), 14 (UI), 15 (Tunnel-Öffner) |
| §10 Tech-Stack & Repo-Struktur | Task 1 + Struktur oben |
| §11 Resume/Retry | Task 2 (Status), 13 (retry-failed) |
| §12 Rechtlicher Hinweis | dokumentarisch (README/Spec), kein Code |
| §13 Erfolgskriterien | über alle Tasks; Free-Tier-Guard = Task 12 |

**Größen-Schwelle als EINE Quelle:** `config.SIZE_TIERS` → gelesen von `classify.size_tier` (Task 9) UND `export.build_legend_lines` (Task 10). Legende kann nie driften. ✓

## Bewusste v1-Vereinfachungen (dokumentierte Spec-Abweichungen)

Diese Details aus dem Spec sind in v1 absichtlich vereinfacht — funktional unkritisch, später nachrüstbar. Ehrlich vermerkt, damit sie nicht stillschweigend fehlen:

- **robots.txt** (§4): v1 fetcht/prüft keine `robots.txt`. Stattdessen konservatives Rate-Limit (2 s/Domain), ehrlicher User-Agent, Timeout+Backoff. Impressen sind gesetzlich öffentlich; Nachrüstung via `urllib.robotparser` (Host-Cache) ist ein isolierter Zusatz in `fetch.py`.
- **HTTPS-Zwang** (§4): v1 nutzt die Google-`websiteUri` wie geliefert (praktisch immer https); kein aktives http→https-Rewrite.
- **Provider-Sammeladressen-Filter** (§5): `extract_email` bevorzugt `mailto:` und Impressum, filtert aber keine generischen Freemail-Adressen aktiv aus — für Apotheken selten relevant.
- **Ketten-Sekundärsignal** (§7): Gruppierung nur über gemeinsame `domain` (starkes Signal). Das im Spec genannte Sekundärsignal „gleiche:r Inhaber:in in geografischer Nähe" ist nicht implementiert.
- **LLM-Fehlschlag** (§6): Kann Haiku eine Row nicht parsen, bleiben Inhaber-Vor-/Nachname `None` (der unsaubere Regex-Rohtext wird nicht als Fallback behalten). Bei Bedarf später: Rohtext bei LLM-Fehlschlag zurückschreiben.

Kein einziger dieser Punkte berührt die Free-Tier-Sicherheit, die Legende, die Zielspalten oder die Panel-Bedienung.
