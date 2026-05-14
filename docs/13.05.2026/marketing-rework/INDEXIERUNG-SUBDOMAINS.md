# Indexierung der Subdomains *.claimondo.de — Anleitung Aaron

**Stand:** 14.05.2026 · Begleit-Doc zu `INDEXIERUNG-ANLEITUNG-AARON.md`.

Die Hauptdomain `claimondo.de` ist mit der zentralen Anleitung abgedeckt
(GSC-Sitemap + Bing). Subdomains laufen **logistisch unabhängig** in GSC —
jeder Hostname ist eine eigene Property. Hier der Plan pro Subdomain.

---

## 0 · Der Gold-Trick: Domain-Property statt URL-Präfix

Wenn du in Google Search Console eine **Domain-Property** für `claimondo.de`
anlegst (nicht URL-Präfix-Property), **deckt sie automatisch alle Subdomains
mit ab** — `gutachter.claimondo.de`, `makler.claimondo.de`,
`schaden.claimondo.de`, `kfzgutachter.claimondo.de`, `app.claimondo.de`,
sogar `staging.*`.

Vorteile:
- Eine Verifizierung (DNS-TXT) reicht für alle Subdomains
- Reports zeigen `claimondo.de` + alle Subdomains aggregiert
- Sitemap-Einreichung pro Subdomain trotzdem möglich (s. unten)

Daher empfehle ich: **Domain-Property als Hauptansicht + zusätzliche
URL-Präfix-Properties pro Subdomain mit eigener Sitemap-Logik**. Das
gibt dir granulare Reports + globale Übersicht.

In Bing Webmaster Tools gibt es keine echte Domain-Property — dort
musst du jede Subdomain einzeln verifizieren.

---

## 1 · `gutachter.claimondo.de` (SV-Recruiting-Landing)

**Aktueller Zustand:**
- HTTP 200, Next.js, ~122 KB HTML
- `/sitemap.xml` → 301 auf `https://claimondo.de/sitemap.xml`
- `/robots.txt` → 301 auf Hauptdomain
- Inhalt: Recruiting-Landing für Kfz-Sachverständige (kanonische URL `/gutachter-partner` per proxy.ts)

**Was tun:**

### 1.1 GSC URL-Präfix-Property anlegen

1. GSC → Property hinzufügen → URL-Präfix → `https://gutachter.claimondo.de`
2. Verifizierung: wenn Domain-Property `claimondo.de` schon verifiziert ist, übernimmt GSC automatisch
3. Sitemap einreichen: **`https://claimondo.de/sitemap.xml`** (Cross-Domain-Sitemap ist erlaubt wenn beide Properties dem gleichen Account gehören)

### 1.2 Bing Webmaster Tools

1. „Site hinzufügen" → `https://gutachter.claimondo.de`
2. Verifizierung per Meta-Tag (oder DNS, falls Subdomain-TXT setzbar)
3. Sitemap: **`https://claimondo.de/sitemap.xml`**

### 1.3 Canonical-Check

Die Subdomain rendert eine Landing. Per proxy.ts:
- `gutachter.claimondo.de/` → rewrite intern auf `/gutachter-partner` (Hauptseite-Pfad)
- Canonical sollte auf `https://gutachter.claimondo.de/` zeigen (nicht auf claimondo.de)
- → Indexiert als eigenständige Seite (Recruiting-Kanon)

Verifizieren: `curl -s https://gutachter.claimondo.de/ | grep canonical`. Falls
das Canonical falsch zeigt: schick mir Screenshot, ich fixe es.

---

## 2 · `makler.claimondo.de` (Makler-Recruiting-Landing)

**Identisch zu `gutachter.claimondo.de` aber für Makler:**

1. GSC URL-Präfix-Property `https://makler.claimondo.de`
2. Sitemap einreichen: `https://claimondo.de/sitemap.xml`
3. Bing analog
4. Canonical-Check: `curl -s https://makler.claimondo.de/ | grep canonical`

---

## 3 · `schaden.claimondo.de` (WordPress-Legacy)

**Aktueller Zustand:**
- HTTP 200, WordPress mit Yoast-SEO-Plugin
- `/sitemap.xml` → 301 auf `/sitemap_index.xml`
- `/sitemap_index.xml` listet die echten Yoast-Sitemaps (post-sitemap, page-sitemap, …)
- `/robots.txt` listet `Sitemap: /sitemap_index.xml`

**Memory-Erinnerung:** `feedback_subdomains_in_ruhe_lassen` — wir fassen
WordPress-Backend nicht an. Aaron pflegt diese Subdomain selbst.

**Was tun:**

### 3.1 GSC URL-Präfix-Property anlegen

1. `https://schaden.claimondo.de`
2. Sitemap einreichen: **`https://schaden.claimondo.de/sitemap_index.xml`** (Yoast-Index-Sitemap)
3. Yoast erkennt das automatisch und reicht alle Sub-Sitemaps mit ein

### 3.2 Bing analog

`https://schaden.claimondo.de/sitemap_index.xml`

### 3.3 Strategische Frage

**Wenn `schaden.claimondo.de` thematisch gleich zu `/kfz-gutachter/koeln` etc.
ist** (Vermutung), erzeugt das Duplicate-Content gegenüber den 72 Premium-
Stadt-Pages auf der Hauptdomain. Optionen:

| Option | Wirkung |
|---|---|
| WordPress-Inhalte mit `<meta robots="noindex">` markieren | Saubere Trennung — Hauptdomain dominiert |
| WordPress-Inhalte mit `<link rel="canonical">` auf Hauptdomain | Backlink-Wert wandert zur Hauptdomain |
| 301-Redirect ganzer Subdomain auf Hauptdomain | Klarste SEO-Lösung, aber WordPress-Workflow betroffen |
| Status quo (zwei separate Indexes) | Risiko Cannibalization — beide Properties konkurrieren um „Kfz-Gutachter Köln" |

**Empfehlung:** mit dem WordPress-Owner abklären. Ich kann auf Wunsch ein
Test-Script schreiben, das beide Domains für eine Liste von Keywords gegen
Google scraped + Cannibalization-Risiko quantifiziert.

---

## 4 · `kfzgutachter.claimondo.de` (Identisch zur Hauptdomain — Duplicate-Risk)

**Aktueller Zustand:**
- HTTP 200, ~236 KB HTML
- `/sitemap.xml` → 21.761 Bytes mit **90 URLs** → **identisch zur Hauptdomain**
- `/robots.txt` → 832 Bytes → **identische Regeln zur Hauptdomain inkl. AI-Crawler-Allow + Google-Extended**

→ Diese Subdomain serviert exakt die gleiche Site wie `claimondo.de`. Das ist
**Duplicate-Content auf Hostname-Ebene** und kann SERPs verwirren.

**Test:** öffne `https://kfzgutachter.claimondo.de/kfz-gutachter/koeln` im Browser.
Wenn dort der gleiche Inhalt wie auf `https://claimondo.de/kfz-gutachter/koeln`
gezeigt wird, hast du das Problem.

**Was tun:**

| Option | Vorgehen | Aufwand |
|---|---|---|
| **A — Subdomain auf `claimondo.de` 301-Redirecten** (sauberste Lösung) | DNS bei IONOS: `kfzgutachter.claimondo.de` als CNAME oder A-Record auf den gleichen Server, dann proxy.ts erweitern um `hostname === 'kfzgutachter.claimondo.de' → redirect to claimondo.de`. Ich übernehme den Code-Teil sobald du grünes Licht gibst. | 30 Min Code + 1 h DNS-Propagation |
| **B — Subdomain canonical-Tag auf `claimondo.de`** (Backlink-Konsolidierung) | proxy.ts so erweitern, dass auf `kfzgutachter.claimondo.de/x` das Layout `<link rel="canonical" href="https://claimondo.de/x">` setzt | 20 Min Code |
| **C — Subdomain komplett noindex** | `kfzgutachter.claimondo.de/robots.txt` ersetzen durch `User-agent: *\nDisallow: /` | 5 Min Code |
| **D — Status quo akzeptieren** | Google entscheidet selbst, in 99 % der Fälle wählt es `claimondo.de` als Canonical. Aber: SERP-Cannibalization-Risiko. | 0 Min |

**Empfehlung:** **Option A** wenn die Subdomain historisch keinen relevanten
Backlink-Bestand hat (keine externen Seiten verlinken auf
`kfzgutachter.claimondo.de`). Ahrefs-Check sagt dir das. Wenn doch Backlinks
existieren → **Option B**.

Sag mir was du willst, ich pushe den proxy.ts-Patch.

---

## 5 · `app.claimondo.de` (Portal — bewusst noindex)

**Aktueller Zustand:**
- Root liefert 307 → `/login` (per proxy.ts gewollt)
- `/robots.txt` = `User-agent: *\nDisallow: /\nAllow: /login\nAllow: /passwort-vergessen` ✓
- `/sitemap.xml` wird zwar geliefert, aber für Crawler irrelevant (gesperrt)

**Was tun in GSC/Bing:**

→ **NICHTS** für aktive Indexierung. Die Subdomain ist absichtlich aus dem
Index gehalten (`X-Robots-Tag: noindex, nofollow` per proxy.ts auf allen
Routes außer `/login`).

**Optional:** in GSC eine URL-Präfix-Property `https://app.claimondo.de`
anlegen — **nicht für Indexierung**, sondern für Coverage-Monitoring. Wenn
Google versehentlich eine App-Route indexiert (z. B. weil ein Backlink
darauf zeigt), siehst du das im Coverage-Report.

---

## 6 · Staging und sonstige *.staging.claimondo.de

**Aktueller Zustand:**
- `staging.claimondo.de` → Basic-Auth (User: `aaroncmdo`, PW im Memory `project_staging_slot`)
- Subdomains `gutachter.staging.claimondo.de`, `makler.staging.claimondo.de`, `app.staging.claimondo.de` analog
- Wildcard-Cert läuft Aug 2026 ab

**Was tun:**

→ **NICHTS in GSC oder Bing**. Basic-Auth blockiert Crawler komplett. Falls
Aaron mal Public-Staging-Tests braucht: explizit `<meta robots="noindex">`
+ TXT-File-Verifizierung im jeweiligen Test.

---

## 7 · Konkreter Aktions-Plan für die nächsten 60 Minuten

1. ✅ **Hauptdomain** `claimondo.de` als **Domain-Property** in GSC anlegen (deckt automatisch alle Subdomains für Coverage)
2. ✅ Sitemap einreichen: `sitemap.xml`
3. **`gutachter.claimondo.de`** als zusätzliche URL-Präfix-Property anlegen → Sitemap `https://claimondo.de/sitemap.xml`
4. **`makler.claimondo.de`** analog → Sitemap `https://claimondo.de/sitemap.xml`
5. **`schaden.claimondo.de`** analog → Sitemap `https://schaden.claimondo.de/sitemap_index.xml`
6. **`kfzgutachter.claimondo.de`** → erst Entscheidung treffen (Option A/B/C/D oben), dann ggf. eigene Property
7. **`app.claimondo.de`** → optional URL-Präfix-Property nur für Monitoring, **keine Sitemap einreichen**
8. **Bing Webmaster Tools** für die Properties 1, 3, 4, 5 (Site-by-Site)

---

## 8 · Was ich Code-seitig machen kann sobald du entschieden hast

| Aufgabe | Trigger |
|---|---|
| `kfzgutachter.claimondo.de` 301-Redirect zur Hauptdomain (Option A) | Aaron sagt „Option A für kfzgutachter" |
| `kfzgutachter.claimondo.de` Canonical-Tag-Override (Option B) | „Option B" |
| `kfzgutachter.claimondo.de` komplett noindex (Option C) | „Option C" |
| `schaden.claimondo.de` mit WordPress synchronisieren (Yoast-Settings ändern) | WordPress-Backend-Zugang nötig — Aaron-Job |
| Auto-PR für proxy.ts-Anpassungen falls Recruiting-Subdomain-Strategie ändert | Auf Anfrage |

---

## 9 · Ahrefs Backlink-Check für strategische Entscheidung

Wir haben Ahrefs-MCP-Zugang im `.env.local` (Memory: `vercel_api_token`).
Ich kann auf Wunsch in einem Schritt prüfen:

- Wieviele Backlinks zeigen auf `kfzgutachter.claimondo.de` extern?
- Wieviele auf `schaden.claimondo.de`?

Das gibt dir die Entscheidungs-Grundlage für Option A vs B oben. Sag
„Ahrefs-Backlink-Check für Subdomains" → ich starte.
