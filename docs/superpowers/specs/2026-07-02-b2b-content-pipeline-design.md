# B2B Content-Pipeline (Crawler → AI-Komposition → validiertes Auto-Publish) — Design-Spec

**Datum:** 2026-07-02
**Autor:** Claude (Session 89f501f6) + Aaron
**Status:** Design zur Freigabe

## Ziel

Den B2B-Community-Feed (`claimondo.de`, Sektion „Aus der Community") **automatisch mit aktuellem Fachwissen + Branchen-News füllen**: ein Crawler zieht täglich B2B-Quellen, die AI verfasst **daraus eigene Original-Artikel**, die **nach automatischer Validierung direkt veröffentlicht** werden — „damit wir immer ganz vorne dabei sind" (Aaron). Zielgruppe: Sachverständige, Makler, Werkstätten.

## Kontext — was schon existiert (darauf wird aufgebaut, NICHT dupliziert)

- **AI-Redaktion** (`src/lib/wissen/generate.ts`, `src/app/admin/wissen-artikel/actions.ts`): `wissen_themen` → `generateArtikelDraft` (Claude, **consumer**-System-Prompt mit Legal-Safeguards: §§-Pflicht, kein erfundenes BGH-Az, RDG-Grenze, „keine Rechtsberatung") → `wissen_artikel` status=`in_review` → Admin `publishArtikel` → `veroeffentlicht`.
- **B2B-Feed** (`claimondo-marketing/lib/community/community-queries.ts` `getCommunityFeed`): zeigt `wissen_artikel` mit `audience='b2b'` + `status='veroeffentlicht'` als Redaktions-Beitrag (Badge „Redaktion"), Tag-Filter.
- **DB** (b2b-community-Branch): `wissen_artikel` hat bereits `audience` (consumer|b2b), `quelle` (redaktion|crawl), `tags text[]`.

## Entscheidungen (Aaron, 02.07.)

1. **Quellen:** alle 4 Kategorien — Recht & Urteile · SV-Verbände & Prüforgs · Versicherungs-/Branchen-News · Werkstatt & Reparatur.
2. **Auto-Publish nur nach Validierung** (nicht voll-blind): ein automatisches Gate entscheidet auto-live vs. `in_review`.
3. **Takt:** täglich, max. 2–3 Artikel.

## Rechtlicher Rahmen (NICHT verhandelbar)

- Die AI verfasst **Original-Synthese aus Fakten** (Fakten/Nachrichteninhalte sind nicht urheberrechtlich geschützt, die konkrete Textform schon) — **kein Nachdruck/Kopie** fremder Artikel. Der Crawl-Inhalt dient nur als Faktengrundlage im Kurzbrief.
- **Quellen-Attribution** (Link auf die Originalquelle) + **„Dies ist allgemeine Information, keine Rechtsberatung"**-Disclaimer in jedem Artikel.
- Nur Quellen crawlen, die es **robots.txt/ToS-konform** erlauben; **RSS/Atom/offizielle Feeds bevorzugt** (sind zur Weiterverarbeitung gedacht).
- Bestehende Generierungs-Safeguards bleiben: §§ statt geratener Az; im Zweifel kein Az.

## Architektur

Drei Bausteine, erweitern die bestehende `themen → generate → publish`-Kette:

### 1. Crawler (`src/lib/wissen/crawl/*` + Cron)
- Quell-Registry als **typisierte Code-Config** (`B2B_CRAWL_SOURCES`): je Quelle `{ name, category, kind: 'rss', url }`. (Admin-Config-Tabelle = Follow-up.)
- **Adapter-Muster**: `kind='rss'` → RSS/Atom-Parser (v1). HTML-Scraping-Adapter = Follow-up.
- Pro Lauf: je Quelle Feed holen → je Eintrag `source_hash = sha256(url)` → **dedupe** gegen `wissen_themen.source_hash` → neue Einträge als `wissen_themen(audience='b2b', quelle='crawl', source_url, source_name, source_hash, titel, kurzbrief=<Feed-Titel + Summary>, status='freigegeben')`. **Cap** pro Lauf (z.B. 10 Themen), damit der Backlog nicht explodiert.

### 2. B2B-Generierung (erweitert `generate.ts`)
- Neuer **B2B-System-Prompt** (`buildB2BSystemPrompt`): Zielgruppe „Kfz-Sachverständige, Makler, Werkstätten" (Fach-Ton, kein Geschädigten-Du); nutzt den `kurzbrief` (Crawl-Fakten) als Grundlage; **muss** Quelle referenzieren; gleiche Legal-Safeguards. Gibt zusätzlich einen passenden **B2B-Tag** aus dem Feed-Vokabular zurück (`Recht & Urteile`/`Versicherer`/`Markt & News`/`Werkstatt`/`Gutachten`/`Schadenregulierung`/`Tools`).
- `generateArtikelDraft` bekommt einen `audience`-Parameter (default consumer → bestehender Pfad unverändert; 'b2b' → B2B-Prompt).

### 3. Validierungs-Gate + Auto-Publish (`src/lib/wissen/validate.ts` + Cron)
Ein generierter B2B-Artikel wird **nur dann auto-veröffentlicht**, wenn **alle** Kriterien erfüllt sind (sonst → `in_review`, kein Verlust, landet in der bestehenden Admin-Freigabe):
- **§§-Beleg vorhanden**: Body matcht `§\s?\d+` (mind. 1×) — außer bei reinen News-Typen (dann optional).
- **Länge plausibel**: Body ≥ 800 und ≤ 15 000 Zeichen.
- **Kein unverifizierbares Gerichts-Az**: Body enthält **kein** BGH/OLG-Az-Muster (`\b[IVX]{1,4}\s+ZR\s+\d+/\d{2}\b` o.ä.). Grund: ein Az kann automatisch nicht auf Existenz geprüft werden → **konservativ**: sobald ein Az-Muster auftaucht, geht der Artikel zu `in_review` (Mensch prüft das Zitat). §§ allein (verifizierbar generisch) sind ok.
- **Disclaimer vorhanden**: Body enthält „keine Rechtsberatung" (o.ä.).
- **Slug unique** (bestehender 23505-Retry).
Auto-Publish = `wissen_artikel` direkt `status='veroeffentlicht'` (+ `veroeffentlicht_am`, `author='claimondo-redaktion'`, `reviewed_von=null`, `ai_generated=true`).

### Cron (`/api/cron/wissen-pipeline-b2b`, CRON_SECRET-gated)
Täglicher Lauf, sequenziell: **(a)** crawlen → neue B2B-Themen; **(b)** bis zu **2–3** freigegebene B2B-Themen (älteste zuerst, quelle=crawl bevorzugt) generieren → validieren → publish-oder-review; **(c)** Dead-Letter/Log je Schritt. Kein Auto-Publish ohne bestandene Validierung. (VPS-Crontab = Aaron.)

## DB-Änderungen (Regel 2, via Plugin)

- `wissen_themen`: `+ audience text not null default 'consumer' check (in ('consumer','b2b'))`; `+ source_url text`, `+ source_name text`, `+ source_hash text`; **quelle-Check erweitern** um `'crawl'` (aktuell nur `ai_gap`,`manuell`). Unique-Index auf `source_hash` (dedupe, partial where source_hash is not null).
- `wissen_artikel`: `+ source_url text` (Attribution-Anzeige im Feed/Artikel). (audience/quelle/tags existieren bereits.)
- Kein RLS-Change nötig (Themen bleiben service-role-only; nur veröffentlichte Artikel public).

## Admin-Sichtbarkeit (Sicherheitsnetz trotz Auto-Publish)

Auch bei Auto-Publish bleibt jeder Artikel in `/admin/wissen-artikel` sichtbar. Ergänzung: **Filter/Badge „auto-veröffentlicht (crawl)"** + eine `zuruckziehenArtikel(id)`-Action (`veroeffentlicht → archiviert`, revalidate Feed), damit ein fehlerhafter Auto-Artikel mit einem Klick offline geht. (Kostet ~nichts, großer Sicherheitsgewinn.)

## Out of Scope (v1 — bewusst Follow-up)

- HTML-Scraping-Adapter (v1 = RSS/Atom-Feeds; erweiterbar über das Adapter-Interface).
- Admin-UI zur Quell-Verwaltung (v1 = Code-Config `B2B_CRAWL_SOURCES`).
- Bild-/Thumbnail-Generierung, Mehrsprachigkeit, Push-Benachrichtigung bei neuem B2B-Artikel.
- DPIA-Erweiterung: Crawl verarbeitet **keine** personenbezogenen Daten (nur Fach-/News-Inhalte) → kein neuer DPIA-Trigger; die bestehende Wissen-AI-DPIA (`docs/2026-07-01-wissen-ai-artikel-dpia-kurz.md`) deckt die Generierung.

## Verifikation (Definition of Done)

- tsc/build grün; Unit-Tests für: RSS-Parser (Fixture), `source_hash`-Dedupe, das Validierungs-Gate (§§-present / Az-present→review / Länge / Disclaimer), B2B-Prompt-Aufbau.
- Prod-Smoke (Regel: JWT/echte Rolle wo RLS greift; hier meist service-role-Cron): 1 echter Crawl-Lauf gegen ≥1 reale RSS-Quelle → Thema angelegt → generiert → validiert → (auto-publiziert **oder** in_review mit Grund) → erscheint (falls publiziert) im B2B-Feed. Danach Test-Artikel wieder `archiviert`.
- Kein Az im auto-publizierten Output ohne Review (Gate greift).

## Migrations-/Branch-Hinweis

Branch `kitta/b2b-content-pipeline` (off `kitta/b2b-community`, da es `audience` + Feed braucht) → PR stackt auf #3457; nach dessen Merge auf staging rebasen.
