# Apotheken-Scraper — Design-Spec

**Datum:** 2026-08-01
**Status:** Design approved (Aaron), Spec zur Review
**Deliverable:** Eigenständiges Python-Mini-Repo `apo-scraper`, gehostet auf dem bestehenden VPS.

---

## 1. Ziel & Kontext

Aufbau einer angereicherten Datenbasis **aller Apotheken in Deutschland** (~17.000, ABDA-Statistik, tendenziell sinkend) für internes Sales-/Outreach-Targeting. Google Places liefert die Stammdaten (Discovery + Adresse/Telefon/Website/Bewertungsanzahl); die vier wertvollen Felder (E-Mail, Inhaber-Name, Onlineshop-Flag, Cannabis-Flag) werden aus der jeweiligen Apotheken-Website — vor allem dem gesetzlich verpflichtenden Impressum — angereichert.

Fachlich unabhängig vom KFZ-Gutachter-Produkt (claimondo-v2), daher **eigenes Repo**.

### Zielspalten (finale Ausgabe)

| Spalte | Quelle | Pflicht |
|---|---|---|
| `domain` | Places `websiteUri` → Host normalisiert | ja |
| `name_apotheke` | Places `displayName` | ja |
| `email` | Website/Impressum (Regex + De-Obfuskation) | best effort |
| `phone` | Places `nationalPhoneNumber` | best effort |
| `vorname_inhaber` | Impressum (Regex → LLM-Split) | best effort |
| `nachname_inhaber` | Impressum (Regex → LLM-Split) | best effort |
| `strasse_hausnr` | Places `addressComponents` | ja |
| `plz` | Places `addressComponents` | ja |
| `ort` | Places `addressComponents` | ja |
| `groessenordnung` | Places `userRatingCount` → Tier | abgeleitet |
| `onlineshop_vorhanden` | Website (Fingerprint) → bool | abgeleitet |
| `cannabis_produkte` | Website (Keyword + LLM) → bool | abgeleitet |
| `kette_id` / `filialen_count` | abgeleitet (Domain/Inhaber-Gruppierung) | abgeleitet |

### Zusätzliche interne Spalten (nicht im Export-Kern, aber in der DB)

`place_id` (Dedup-Key), `lat`, `lng`, `business_status`, `google_rating`, `google_review_count`, `impressum_url`, `enrich_confidence` (email/inhaber/cannabis/shop je 0–1), `status` (Pipeline-State), `fehler` (letzte Fehlermeldung), `quelle_flags` (welches Feld per Regex vs. LLM kam).

### Nicht-Ziele (YAGNI)

- Kein öffentlich erreichbares Dashboard — das Bedien-Panel (§9) läuft nur VPS-intern und wird über einen abgesicherten Tunnel geöffnet.
- Kein automatischer Cold-Mail-Versand (separates, rechtlich gesondertes Thema, s. §12).
- Keine Realtime-Aktualität — Einmal-Lauf mit manuellem Refresh-Anstoß.
- Keine Nicht-Apotheken (Drogerien, Sanitätshäuser) — strikt `type=pharmacy` / „Apotheke".

---

## 2. Architektur — 6-Stufen-Pipeline

Jede Apotheke durchläuft eine Zustandsmaschine, deren Zustand in einer **SQLite-DB auf dem VPS** persistiert wird. Jede Stufe ist **idempotent** und **resumebar**: Abbruch jederzeit möglich, Neustart setzt beim ersten nicht-abgeschlossenen Row auf.

```
① DISCOVER   Google Places (Text Search New, Enterprise-FieldMask, Quadtree)
                → Stammdaten + place_id, dedupe            → status='discovered'
② FETCH      Startseite + Impressum-Seite holen (höflich)  → status='fetched'
③ EXTRACT    Regex-Layer: email, domain, phone, Inhaber,
             Shop-Flag, Cannabis-Flag                       → status='extracted'
④ ENRICH     Haiku-Fallback nur für unsichere Felder        → status='enriched'
⑤ CLASSIFY   Größen-Tier + Filialketten-Gruppierung         → status='classified'
⑥ EXPORT     SQLite → XLSX + CSV (Zielspalten)              → status='exported'
```

Status-Übergänge sind monoton; ein Row mit `status='fetched'` überspringt Stufe ① beim Resume. Fehlgeschlagene Rows bekommen `status='failed'` + `fehler`-Text und blockieren den Lauf nicht (separater Retry-Command).

---

## 3. Stufe ① Discovery — adaptives Quadtree-Grid

**Problem:** Google Places gibt pro Suche max. 60 Treffer zurück (Text Search New: 20/Page × 3 Pages via `pageToken`). In dichten Innenstädten reicht das nicht.

**Lösung:** Adaptives Quadtree. Deutschland wird durch ein Start-Raster grober Kacheln abgedeckt (Seed = amtliche Gemeinde-/PLZ-Zentroide als grobe Bounding-Boxen). Pro Kachel: Text Search `textQuery="Apotheke"` mit `locationRestriction` (Rechteck). Liefert eine Kachel exakt 60 Treffer (= Cap erreicht → wahrscheinlich unvollständig), wird sie in 4 gleiche Unterkacheln geteilt und rekursiv erneut abgefragt. Rekursionstiefe begrenzt (z.B. max 6 Ebenen), Kacheln mit 0 Treffern werden verworfen.

**Dedup:** über `place_id` (jede Apotheke hat genau eine, auch wenn sie in überlappenden Kacheln auftaucht). `INSERT OR IGNORE` auf `place_id`-Primary-Key.

**FieldMask (ein Call-Typ liefert alles):**
```
places.id, places.displayName, places.formattedAddress, places.addressComponents,
places.location, places.nationalPhoneNumber, places.websiteUri,
places.rating, places.userRatingCount, places.businessStatus
```
Da `rating`/`userRatingCount` Atmosphere-Felder sind, wird der Call als **Text Search Enterprise** abgerechnet (s. §8). Ein separater Place-Details-Call entfällt dadurch komplett.

**Erwarteter Aufwand:** ~17k Apotheken / 20 pro Page ≈ 850 ideale Pages; mit Quadtree-Overhead (leere/dünne/verfeinerte Kacheln, Multi-Page) realistisch **~1.000–2.500 Enterprise-Search-Calls** für ganz DE.

---

## 4. Stufe ② Fetch — Website & Impressum

Für jede Apotheke mit `websiteUri`:

1. Startseite `GET` (Timeout 10s, echter Browser-User-Agent, `robots.txt` respektiert, HTTPS erzwungen).
2. Impressum-Link finden: Anchor-Text-/href-Heuristik (`impressum`, `imprint`, `rechtliches`, `kontakt`). Deutsche Apotheken haben Impressumspflicht (§5 DDG) → Trefferquote hoch.
3. Impressum-Seite `GET` und roh (HTML→Text) cachen.

**Höflichkeit / Robustheit:**
- Pro Host gedrosselt (≥2s Abstand, nie parallel gegen dieselbe Domain).
- Globale Nebenläufigkeit begrenzt (z.B. 8 Domains gleichzeitig).
- Exponential-Backoff bei 429/5xx, max 3 Versuche, dann `status='failed'`.
- HTML-Cache in `data/html_cache/<place_id>/{home,impressum}.html`, damit Extract/Enrich ohne erneuten Fetch wiederholbar sind.

Apotheken **ohne** Website: bleiben in der DB (Stammdaten aus Places sind trotzdem wertvoll), Anreicherungsfelder bleiben leer, `status='fetched'` mit Vermerk `keine_website`.

---

## 5. Stufe ③ Extract — Regex-Layer (deckt ~70–80 % gratis)

Reine Heuristik auf dem gecachten HTML/Text, keine externen Calls:

- **`email`:** `mailto:`-Links bevorzugt, dann Text-Regex; De-Obfuskation von `(at)`/`[at]`/` at `, `(punkt)`/`[dot]`. Impressum-Seite hat Vorrang vor Startseite. Rollen-Adressen (`info@`, `apotheke@`, `kontakt@`) werden akzeptiert; generische Provider-Sammeladressen gefiltert.
- **`domain`:** aus `websiteUri`, auf registrierbaren Host normalisiert (kein `www.`, kein Pfad).
- **`phone`:** primär Places-Wert; Impressum-Telefon als Fallback/Cross-Check.
- **Inhaber (Regex-Vorstufe):** Muster wie `Inhaber(in)?\s*:?`, `Inhaber der Apotheke`, `Apotheker(in)\s*:?`, `Betriebsinhaber`. Wegen des Fremd- und Mehrbesitzverbots (ApoG §7/§8) hat **jede** Apotheke eine:n approbierte:n Inhaber:in, die/der im Impressum genannt sein muss. Roh-Match wird gespeichert; Aufsplittung in Vor-/Nachname erfolgt in Stufe ④, wenn Titel/Doppelnamen im Spiel sind.
- **`onlineshop_vorhanden` (Fingerprint):** Warenkorb-/Shop-Marker + bekannte Apotheken-Shop-Systeme (z.B. `gesund.de`, `mycare`, `callmyapo`, `ihreapotheken.de`, `apora`, `Shopware`-Marker), Signalwörter „Versandapotheke", „Online bestellen", „Warenkorb". → `true` bei ≥1 starkem Treffer.
- **`cannabis_produkte` (Keyword-Vorstufe):** Keyword-Set `Cannabis`, `Medizinalcannabis`, `Cannabisblüten`, `Cannabis-Rezept`, `THC`, `Cannabinoide`, „Rezept einlösen" im Cannabis-Kontext. → Kandidat `true`; mehrdeutige Fälle (z.B. bloßer News-/Blog-Erwähnung) gehen zur LLM-Disambiguierung.

Jedes Feld bekommt eine `confidence`. Felder unter Schwellwert (oder mit erkannter Ambiguität) werden für Stufe ④ markiert.

---

## 6. Stufe ④ Enrich — Haiku-Fallback (nur die harten Reste)

Nur Rows mit mindestens einem unsicheren Feld gehen an das LLM (Claude Haiku über die **Anthropic-API**, nicht das Max-Abo — das ist nicht für headless Batch lizenziert).

**Input:** Impressum-Text (gekürzt auf relevante Passagen) + die markierten Roh-Extrakte.
**Output (strukturiert, erzwungenes JSON):**
```json
{
  "vorname_inhaber": "string|null",
  "nachname_inhaber": "string|null",
  "cannabis_produkte": "true|false|null",
  "onlineshop_vorhanden": "true|false|null",
  "confidence": 0.0
}
```

Regeln: Titel (`Dr.`, `Prof.`) werden vom Namen getrennt und verworfen; bei mehreren genannten Personen wird die als Inhaber:in/Betriebsinhaber:in ausgewiesene gewählt. Batching mit Rate-Limit + Retry. Erwartete Menge: **~5.000–8.000 Rows** (die Regex-Reste), grob **5–15 $** einmalig.

---

## 7. Stufe ⑤ Classify — Größenordnung & Filialketten

- **`groessenordnung`:** aus `userRatingCount` (Google-Bewertungsanzahl) als Proxy für Kundenfrequenz, in Tiers:
  `S` = 0–24, `M` = 25–99, `L` = 100–299, `XL` = 300+. (Schwellwerte konservativ; final beim ersten Lauf anhand der Verteilung kalibrierbar.)
- **Filialketten:** Gruppierung über (a) identische normalisierte `domain` über mehrere `place_id` (starkes Signal — viele Verbünde teilen eine Website), sekundär (b) identische:r Inhaber:in-Name in geografischer Nähe. Jeder Gruppe wird eine `kette_id` zugewiesen, `filialen_count` = Gruppengröße. Einzelapotheken: `filialen_count=1`, eigene `kette_id`. Nützlich fürs Sales-Targeting (ein Gespräch mit dem/der Inhaber:in eines Verbunds erschließt mehrere Standorte).

---

## 8. Stufe ⑥ Export & 8b. Kosten / Free-Tier-Strategie

**Export:** SQLite → `apotheken_export_<datum>.xlsx` und `.csv`, Spaltenreihenfolge exakt wie in §1, UTF-8, für CRM-Import geeignet. Optional gefiltert (nur `status='classified'`, nur mit E-Mail, nur Cannabis=ja, etc.) über CLI-Flag bzw. Panel-Filter.

**Legende (Aaron-Vorgabe):** Der XLSX-Export bekommt ein zusätzliches Blatt **„Legende"**, das einmalig erklärt: die `groessenordnung`-Tiers mit ihren Bewertungs-Schwellen (`S` = 0–24, `M` = 25–99, `L` = 100–299, `XL` = 300+ Google-Bewertungen), die bool-Felder (`onlineshop_vorhanden`, `cannabis_produkte`: 1 = ja, 0 = nein, leer = unbekannt) und die Bedeutung von `kette_id`/`filialen_count`. Da CSV keine zweite Tabelle kann, wird beim CSV-Export dieselbe Legende als begleitende `LEGENDE.txt` in denselben Ordner geschrieben.

**Kosten (verifiziert, Google Maps Platform Pricing Stand März 2025):**

Die SKU-Kategorie richtet sich nach den **angeforderten Feldern**, nicht nach dem Plan. Free-Tier seit März 2025: **10.000 (Essentials) / 5.000 (Pro) / 1.000 (Enterprise) Calls pro SKU und Monat**; der alte 200-$-Monatscredit ist entfallen.

| Posten | SKU | Preis | Free/Monat | Bedarf DE | Kosten |
|---|---|---|---|---|---|
| Text Search (Discovery+Anreicherung) | **Enterprise** (wg. rating/userRatingCount) | ~$35–40/1K | 1.000 | ~1.000–2.500 Calls | **0 € über 1–3 Monate gestreckt**, sonst einmalig ~20–80 € |
| Haiku-Anreicherung | Anthropic-API | — | — | ~5–8k Calls | **5–15 €** einmalig |
| VPS | — | bestehend | — | — | **0 €** |

**Free-Tier-Strategie (Aaron-Vorgabe):** Discovery-Lauf so takten, dass die monatliche Enterprise-Quote (1.000 Calls) nicht überschritten wird → ganz DE über 1–3 Kalendermonate praktisch **0 €**. Für „erstmal eine ordentliche Liste" reicht **ein Monat** (bis 1.000 Calls ≈ Großteil aller Ballungsräume + viele Flächen-PLZ). Der Quadtree priorisiert dabei dichte Gebiete zuerst, sodass die erste Quote maximalen Apotheken-Ertrag bringt. Ein „Rest-Überhang" (letzte paar hundert Calls) fällt entweder in Monat 2 (gratis) oder kostet einmalig <15 €.

**Guard:** Der Discovery-Command hat ein hartes `--max-calls`-Budget (Default z.B. 950, unter der 1.000er-Quote) und stoppt sauber mit gespeichertem State, wenn es erreicht ist. Kein versehentliches Überschreiten des Free-Tiers.

---

## 9. Bedien-Panel — Steuerung ohne Terminal

Ziel: Der komplette Scraper ist **ohne Kommandozeile** bedienbar. Ein kleines Web-Bedienfeld läuft als Teil des Repos auf dem VPS und wird per Doppelklick geöffnet.

### 9.1 Zugang (sicher UND einfach)

Auflösung der Spannung „nur über Tunnel" (max. Sicherheit) vs. „unwissender Nutzer" (kein SSH-Kommando):

- Der Panel-Server bindet **ausschließlich an `127.0.0.1`** auf dem VPS — von außen **nicht** erreichbar, kein offener Port im Internet.
- Auf dem Windows-Rechner liegt ein vorbereiteter **Doppelklick-Öffner** (`Apotheken-Panel-oeffnen.bat`). Ein Doppelklick baut automatisch den SSH-Tunnel auf (`VPS 127.0.0.1:PORT` → lokal) und öffnet den Browser auf dem Panel. Kein Kommando, kein Tippen.
- Defense-in-Depth: zusätzlich ein einfaches Panel-Passwort aus `.env` (nie im Code/Repo).
- Alternative auf Wunsch: Tailscale/WireGuard-VPN statt SSH-Tunnel (einmal Client installieren → feste private Adresse). Siehe §14.

### 9.2 Was das Panel zeigt & kann

**Oben — der eine große Knopf:**
- **„Scrapen starten"** — fährt automatisch Discovery → Fetch → Extract → Enrich → Classify durch und **stoppt selbstständig am Gratis-Limit** (Budget-Guard, §8b).
- **Pause / Weiter** und **Stopp** daneben.

**Live-Anzeige (für Vertrauen & Überblick):**
- Fortschrittsbalken + Klartext („Suche Apotheken … 1.240 gefunden").
- Zähler: entdeckt / angereichert / fehlgeschlagen.
- **Gratis-Kontingent:** „620 / 1000 Gratis-Abfragen diesen Monat" — Ampel grün/gelb/rot.
- Vorschau-Tabelle: die ersten ~10 gefundenen Apotheken (Name, Ort, E-Mail), damit sichtbar ist, dass echte Daten fließen.

**Ergebnis:**
- **„Ergebnis herunterladen"** → Excel (.xlsx, inkl. Legende-Blatt, §8) + CSV.

**Aufklappbar „Erweitert" (Standard zugeklappt):**
- Einzel-Knöpfe je Stufe (nur Suchen / nur Anreichern / nur Klassifizieren / Export neu erzeugen) — für gezielte Wiederholung.
- **„Fehlgeschlagene erneut versuchen"**-Knopf.

**Am Gratis-Limit:** klare Meldung statt stiller Kosten — „Gratis-Kontingent für diesen Monat aufgebraucht. Nächsten Monat geht's automatisch weiter — oder jetzt kostenpflichtig fortsetzen" (den konkreten Restbetrag rechnet das Panel aus den verbleibenden Calls aus und zeigt ihn an). Kostenpflichtiges Fortsetzen nur nach ausdrücklichem Extra-Klick.

### 9.3 Technik

- **Flask** (minimaler Python-Webserver, kein Async nötig, self-contained). Statisches `index.html` + etwas Vanilla-JS (kein Frontend-Framework → nichts zu bauen).
- Das Panel **startet die Pipeline-Stufen als Hintergrund-Prozess** und liest den Fortschritt aus der SQLite-DB (die ohnehin der State-Store ist). Kein zweiter Datenspeicher.
- Endpoints: `GET /api/status` (Polling für die Live-Anzeige), `POST /api/start|pause|stop`, `POST /api/stage/<name>`, `POST /api/retry-failed`, `POST /api/export`, `GET /api/download/<xlsx|csv>`.
- Läuft dauerhaft als systemd-Service auf dem VPS, damit der Doppelklick-Öffner jederzeit andocken kann.

---

## 10. Tech-Stack & Repo-Struktur

**Stack:** Python 3.11+ (`requests`, `beautifulsoup4`/`lxml`, `anthropic`, `openpyxl`, `flask`, stdlib `sqlite3`). Begründung: bessere HTML-Parsing-Tools als Node, echtes Standalone ohne Build-Step, VPS hat Python bereits (s. `vps-env-sync.py`). Flask nur für das schlanke Bedien-Panel (§9); ansonsten kein Framework.

**Betrieb auf dem VPS:** Normalfall ist das **Bedien-Panel** (§9) — Doppelklick-Öffner, Knöpfe, kein Terminal. Die Pipeline selbst läuft dauerhaft als systemd-Service. Für headless/fortgeschrittene Nutzung ist jede Stufe auch direkt per CLI aufrufbar: `python -m src.run --stage all --max-calls 950` bzw. einzeln `--stage discover|fetch|extract|enrich|classify|export`.

```
apo-scraper/
  README.md
  requirements.txt
  .env.example              # GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY
  .gitignore                # data/*.db, data/html_cache/, .env, exports/
  config.py                 # Rate-Limits, Tier-Schwellen, Keyword-/Fingerprint-Listen, Regex-Patterns
  data/
    seed_grid.json          # Start-Raster (Gemeinde-/PLZ-Zentroide → Bounding-Boxen)
    apotheken.db            # SQLite (gitignored)
    html_cache/             # gitignored
  exports/                  # XLSX/CSV Output (gitignored)
  src/
    __init__.py
    run.py                  # Orchestrator + CLI (--stage, --max-calls, --resume, --retry-failed)
    db.py                   # SQLite-Schema + State-Helpers
    places.py               # Text Search New Client + Quadtree-Logik + Budget-Guard
    discover.py             # Stufe ①
    fetch.py                # Stufe ② (Website + Impressum, Politeness)
    extract.py              # Stufe ③ (Regex-Layer)
    enrich_llm.py           # Stufe ④ (Haiku, strukturiertes JSON)
    classify.py             # Stufe ⑤ (Größe + Ketten)
    export.py               # Stufe ⑥ (XLSX inkl. Legende-Blatt + CSV + LEGENDE.txt)
    panel/
      server.py             # Flask, /api/* Endpoints, bindet NUR 127.0.0.1
      static/index.html     # Bedienfeld: Knöpfe, Fortschritt, Vorschau, Download
  tools/
    Apotheken-Panel-oeffnen.bat   # Windows-Doppelklick: SSH-Tunnel + Browser öffnen
  deploy/
    apo-panel.service       # systemd-Unit für den Panel-Server (localhost-gebunden)
```

**SQLite-Kernschema (`apotheken`):**
```sql
CREATE TABLE apotheken (
  place_id           TEXT PRIMARY KEY,
  name_apotheke      TEXT,
  strasse_hausnr     TEXT,
  plz                TEXT,
  ort                TEXT,
  phone              TEXT,
  domain             TEXT,
  website_url        TEXT,
  email              TEXT,
  vorname_inhaber    TEXT,
  nachname_inhaber   TEXT,
  onlineshop_vorhanden INTEGER,     -- 0/1/NULL
  cannabis_produkte    INTEGER,     -- 0/1/NULL
  google_rating      REAL,
  google_review_count INTEGER,
  groessenordnung    TEXT,          -- S/M/L/XL
  kette_id           TEXT,
  filialen_count     INTEGER,
  lat REAL, lng REAL,
  business_status    TEXT,
  impressum_url      TEXT,
  enrich_confidence  TEXT,          -- JSON {email,inhaber,cannabis,shop}
  quelle_flags       TEXT,          -- JSON: welches Feld regex vs. llm
  status             TEXT NOT NULL DEFAULT 'discovered',
  fehler             TEXT,
  erstellt_am        TEXT DEFAULT (datetime('now')),
  aktualisiert_am    TEXT
);
```

---

## 11. Resume, Fehler & Refresh

- **Resume:** Jeder Command liest `status` und arbeitet nur nicht-abgeschlossene Rows ab. `--resume` ist Default-Verhalten.
- **Retry:** `--retry-failed` setzt `status='failed'`-Rows auf die vorherige Stufe zurück (mit Backoff-Historie).
- **Refresh (später, 0 € Google-seitig):** Ein erneuter `fetch→extract→enrich`-Lauf frischt Cannabis-/Shop-/E-Mail-Flags auf, ohne neue Places-Calls (nur eigener Website-Crawl). Voller Places-Refresh nur auf ausdrücklichen Zuruf.

---

## 12. Rechtlicher Hinweis (dokumentiert, kein Blocker für dieses Repo)

- **Erhebung** von Impressumsdaten (geschäftliche Kontaktdaten, Inhaber:in-Name) ist als berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO) für B2B tragbar.
- **Nutzung für Cold-Outreach** (Werbe-E-Mails an personenbezogene/rollenbasierte Adressen) fällt unter UWG §7 und braucht eine eigene Rechtsgrundlage/Prozess. Das ist **nicht** Teil dieses Scrapers, wird aber hier vermerkt, damit die spätere Verwendung sauber aufgesetzt wird (ggf. mit dem vorhandenen `dsgvo-email-marketing`-Playbook).
- **Google Places ToS:** dauerhafte Speicherung von Places-Content ist eingeschränkt; als internes Sales-Tool mit begrenzter Menge geringes Risiko. `place_id` darf unbegrenzt gespeichert werden; abgeleitete/eigene Anreicherungsdaten sind unkritisch.

---

## 13. Erfolgskriterien

1. `apotheken.db` enthält **≥90 %** der real existierenden DE-Apotheken (Plausibilitätscheck gegen ABDA-Gesamtzahl ~17k).
2. `email` befüllt für **≥60 %** der Apotheken mit Website; `vorname/nachname_inhaber` für **≥70 %** der Apotheken mit erreichbarem Impressum.
3. `cannabis_produkte` und `onlineshop_vorhanden` als belastbares bool für **≥90 %** der Rows mit Website.
4. Discovery bleibt im **Free-Tier** (Enterprise-Budget-Guard greift).
5. Export als XLSX + CSV mit exakt den Zielspalten aus §1, CRM-importierbar; XLSX enthält ein **Legende-Blatt** (Größen-Tiers + Feld-Bedeutungen), CSV eine begleitende `LEGENDE.txt`.
6. Kompletter Lauf resumebar; kein Datenverlust bei Abbruch.
7. **Bedien-Panel:** Der Nutzer öffnet das Panel per Doppelklick und steuert den kompletten Lauf (Start / Pause / Stopp / Export / Download) **ohne Terminal**; das Gratis-Kontingent ist jederzeit sichtbar und wird nicht ungewollt überschritten.

---

## 14. Offene Punkte / Risiken

- **Städte-Verfeinerung:** Quadtree-Tiefe muss in Berlin/München/Hamburg ggf. tiefer gehen; Tiefe/Budget beim ersten Realdaten-Lauf kalibrieren.
- **Impressum-Varianz:** manche Apotheken nutzen Website-Baukästen mit JS-gerendertem Impressum (kein statisches HTML) → dort greift der Fetch nicht; Menge beim ersten Lauf messen, ggf. später Headless-Browser für den Rest.
- **Tier-Schwellen** (§7) sind Startwerte, nach Verteilungsanalyse justierbar.
- **Google-Pricing** ist ein bewegliches Ziel; Free-Tier-Quoten vor dem ersten Lauf einmal gegen die aktuelle Google-Preisseite gegenchecken.
- **Panel-Zugang:** Default ist der Doppelklick-SSH-Tunnel (kein Extra-Client, nutzt bestehenden VPS-SSH-Zugang). Tailscale/WireGuard ist die Alternative, falls ein dauerhaftes privates Netz gewünscht ist — beim Setup final entscheiden. Panel bleibt in beiden Fällen `127.0.0.1`-gebunden (nie öffentlich).
- **Panel ↔ Prozess-Steuerung:** Start/Pause/Stopp steuert langlaufende Hintergrund-Prozesse; sauberes Signal-Handling (SIGTERM für „Stopp", Statusdatei/DB-Flag für „Pause") beim Bau beachten, damit ein Abbruch die SQLite-DB nicht in einen halben Zustand bringt.
