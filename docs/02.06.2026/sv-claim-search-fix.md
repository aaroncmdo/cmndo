# SV-Self-Onboarding Smoke + Such-Bug-Fix (`/sv/registrieren`)

**Datum:** 2026-06-02 · **Branch:** `kitta/sv-claim-search-tokenize` · **PR:** gegen staging
**Anlass:** Smoke des SV-Basic-Self-Onboarding (Claim-Flow #2223) auf staging.

## Smoke-Ergebnis: Claim-Flow funktioniert
`/sv/registrieren` (live auf staging, HTTP 200). Verifizierter Ablauf (Playwright, `scripts/probe-sv-claim-smoke.mjs`):
1. Landing „Als Sachverständiger registrieren" → Karte „Finde deinen Eintrag", Suche nach Name/Firma/PLZ/DAT-Nummer.
2. Treffer als Karten — **nur Firma + Ort, keine PII** (anon-safe Projektion) — je mit Button **„Das bin ich"**.
3. „Das bin ich" → Formular **„Eintrag beanspruchen"** (Email + Telefon) → **„Jetzt beanspruchen"** → pending Basic-Account + Recovery-Link.
4. Alternativ **„Neu eintragen"** (nicht im DAT-Pool) → frisches Formular (Vorname/Nachname/Email/Tel/Adresse/PLZ + DAT-Nr als Identitätsnachweis).

UI sauber, Umlaute korrekt. Smoke read-only — kein echter Lead geclaimt (Screenshots lokal in `docs/02.06.2026/smoke-sv-claim/`, nicht committed da echte SV-Pool-Daten).

## Bug gefunden: volle Firmennamen werden nicht gefunden
Suche nach dem **vollen Firmennamen** „Ing.-Büro Urbach KG" (ein realer claimbarer Pin) → **„Kein passender Eintrag gefunden."**

**Ursache** (`src/lib/sv-basic/claim-actions.ts`, `sucheSvLeadKandidaten`): Die Injection-Sanitierung ersetzte `.`/`:`/`,` durch **Leerzeichen** und matchte den ganzen gesäuberten String als **ein** `name.ilike.%…%`. Da der gespeicherte Name die Punktuation behält („Ing**.**-Büro…"), der Query-String aber nicht („Ing -Büro…"), gab es **keinen Match**. Keyword/PLZ/DAT-Suche („Urbach" → 3 Treffer) funktionierte, aber ein SV, der seinen Firmennamen 1:1 eintippt, fand sich nicht.

## Fix: Tokenisierte UND-Suche
Sonderzeichen **inkl. Bindestrich** → Leerzeichen, dann **tokenisieren**; pro Token ein `.or()`-Block über alle Spalten. Mehrere `.or()`-Aufrufe verknüpft PostgREST als **AND** → jedes Token muss (in irgendeiner Spalte) matchen. Bleibt injection-safe (Tokens sind sanitiert), findet aber volle punktierte Namen.

**Verifikation:** Token-Query für „Ing.-Büro Urbach KG" → `["ing","büro","urbach","kg"]` → **3 Treffer** gegen Live-DB (vorher 0). tsc grün, 6/6 sv-basic-Tests grün.

## Offen
E2E-Re-Smoke des vollen Namens im UI nach Merge+Deploy (data-layer ist bereits bewiesen).
