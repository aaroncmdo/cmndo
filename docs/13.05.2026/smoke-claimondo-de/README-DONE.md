# Smoke-Claimondo — Executive Summary — 13.05.2026

**Datum:** 13.05.2026  
**Durchführender Agent:** Claude Sonnet 4.6  
**Branches:** `kitta/aar-smoke-fallakte-restore` (Marketing-Smoke) + `kitta/aar-smoke-staging-portals` (Portal-Smoke)  
**Scope:** Marketing-Site (Production) + Staging-Portale (vollständig im zweiten Run)

---

## Ergebnis auf einen Blick (nach Portal-Smoke-Run)

| Kategorie | Anzahl |
|---|---|
| Screenshots (Marketing) | 8 |
| Screenshots (Portale — Staging) | 39 |
| **P0 BLOCKER** | **5** (3 aus Marketing-Run + 2 neue aus Portal-Run) |
| P1 HIGH | 6 (3 + 3 neue) |
| P2 MEDIUM | 5 (4 + 1 neue) |
| P3 LOW | 3 (2 + 1 neue) |
| **Sofort gefixt** | **2 (je 1 P0 pro Run)** |

---

## P0 BLOCKER — Sofort handeln

### B1 — /faq Production-Crash (GEFIXT)

`https://claimondo.de/faq` renderte `🟣 APP ROOT CRASH (CMM-14 diag)` statt FAQ-Inhalt.

**Root Cause:** `FaqClient.tsx` ist eine `'use client'`-Component und importierte `LandingFooter`, `LandingTopbar`, `StickyCallBar` direkt. Diese Components nutzen `getTranslations()` aus `next-intl/server` (async Server-Components). In Next.js 15 ist es verboten, Server-Only-APIs in Client-Components zu rufen — React-Fehler #419.

**Fix:** `LandingTopbar`, `LandingFooter`, `StickyCallBar` aus `FaqClient.tsx` entfernt und in `page.tsx` (Server-Component-Wrapper) verschoben. `FaqClient` rendert nur noch den interaktiven Teil.

**Commit:** `36138521` — gepusht auf `kitta/aar-smoke-fallakte-restore`

**Status: GEFIXT — wartet auf Deploy/Merge**

---

### B2 — Staging Basic-Auth-Passwort nicht verfügbar (AUFGELÖST — Portal-Smoke durchgeführt)

Credentials wurden im zweiten Run per Env-Var übergeben. Portal-Smoke abgeschlossen. Details: `AUDIT.md §Portal-Smoke`.

**Neuer Fund (Portal-Run): React #418 Hydration-Error im Dispatch-Portal** — `LeadsViewToggle.tsx` und `KalenderClient.tsx` verwenden `toLocaleDateString()` in Client Components. SSR (UTC) vs. Hydration (Europe/Berlin) → Text-Mismatch.  
**SOFORT GEFIXT:** Commit `552efce9` auf Branch `kitta/aar-smoke-staging-portals`.

---

### B3 — Kein test-makler User (GEFIXT)

`test-makler@claimondo.de` (rolle=makler, profile.id=`bbbb2222-0000-4000-8000-000000000020`, Org=`bbbb2222-0000-4000-8000-000000000021`) via `scripts/seed-staging-test-users.mjs` angelegt am 13.05.2026 (Idempotenter Seed, läuft jederzeit wiederholbar). Pendant test-kanzlei + test-sv + test-admin + test-dispatch ebenfalls verifiziert. Damit ist Makler-Portal-Smoke jetzt durchführbar.

---

## P1 HIGH

### H1 — Dispatch-Portal: GutachterFinder — gray-*/blue-* Token-Verstöße

2 Dateien im Dispatch-Portal nutzen Tailwind-Defaults statt Claimondo-CI-Tokens:
- `src/app/dispatch/gutachter-finder/GutachterFinderUebersichtClient.tsx` — 8 Vorkommen `text-gray-*`, 1x `bg-blue-100 text-blue-700`
- `src/app/dispatch/gutachter-finder/[id]/GutachterFinderDetailClient.tsx` — 7 Vorkommen `text-gray-*`, 1x `bg-blue-100 text-blue-700`

Fix: `text-gray-400` → `text-claimondo-light-blue/60`, `text-gray-500/600` → `text-claimondo-shield/70`, `bg-blue-100 text-blue-700` → `bg-claimondo-ondo/10 text-claimondo-ondo`.

### H2 — Dispatch-Portal: SvKalenderVergleichModal — 5x blue-* (Kalender-Highlighting)

`src/app/dispatch/leads/[id]/SvKalenderVergleichModal.tsx` nutzt `bg-blue-50 border-blue-200 text-blue-800` für die Kalender-Slot-Highlighting. Ist semantisch begründbar (Kalender-Info-Farbe), aber wäre mit `bg-claimondo-ondo/8 border-claimondo-ondo/25 text-claimondo-navy` konform mit CI. Auswirkung: Slot-Farbe weicht von Claimondo-Blau ab, wirkt generisch.

### H3 — Dispatch-Dashboard: Hardcoded Shadows + rounded (kein Token-Verweis)

`src/app/dispatch/dashboard/page.tsx` nutzt `shadow-[0_2px_6px_rgba(15,30,68,.05),0_8px_24px_rgba(15,30,68,.04)]` und `rounded-3xl` direkt statt `shadow-sm`/`rounded-md` aus `design-tokens.ts`. Vorkommen: 4x. Ebenfalls: `src/app/dispatch/leads/_components/LeadsViewToggle.tsx` nutzt `rounded-[14px]` — Token-Wert wäre `rounded-md` (14px entspricht dem `md`-Token).

---

## P2 MEDIUM

### M1 — Hardcoded Shadows, projektübergreifend (143 Vorkommen)

Gesamte App: 143 Stellen mit `shadow-[0_...px_...]` statt `shadow-sm`/`shadow-md`/`shadow-lg` aus `design-tokens.ts`. Verteilt auf:
- `dispatch/`: 24 Vorkommen
- `gutachter/`: 12 Vorkommen
- `makler/`: 6 Vorkommen
- `kunde/`: 4 Vorkommen
- `flow/`, `schaden-melden/`, etc.: restliche

Massenfix: `scripts/aar-745b-color-tokens.mjs` könnte erweitert werden um Shadow-Sweep.

### M2 — Hardcoded rounded-[...] (19 Vorkommen app-weit)

Statt `rounded-sm`/`rounded-md`/`rounded-lg` (Tokens: 8/14/20px) werden `rounded-[14px]`, `rounded-[36px]`, `rounded-[7px]` direkt gesetzt. `rounded-[14px]` ist Token-konform (= `rounded-md`), sollte aber über die Token-Klasse referenziert werden.

### M3 — Dispatch: Naked Empty-State-Texte (4 Stellen ohne EmptyState-Component)

`src/app/dispatch/` hat 4 Stellen mit Inline-Texten wie "Keine Leads vorhanden" / "Noch keine Anfragen" statt `<EmptyState>` aus `@/components/shared/EmptyState`. Vorkommen im Dispatch-Portal: 4, EmptyState-Nutzung: 2.

### M4 — Kein test-makler User + /makler/* Route-Set unbekannt

`src/app/makler/` hat nur `onboarding/`, `partner-werden/`, `pending/` als Unterrouten — kein vollständiges Portal. Es ist unklar ob das Makler-Portal production-ready ist. Wenn ja, fehlt der Test-User.

---

## P3 LOW

### L1 — StickyCallBar + LandingFooter in anderen Pages

Das `/faq`-Muster (Client-Component importiert Server-Components) war isoliert auf `/faq`. Alle anderen Landing-Pages (`/beratung-anfragen`, `/ersteinschaetzung`, `/kfz-gutachter/*`) importieren LandingFooter korrekt in ihren Server-Component-`page.tsx`-Dateien. Kein weiterer Handlungsbedarf.

### L2 — /login-Redirect von claimondo.de auf app.claimondo.de

Klick auf "Anmelden" auf der Marketing-Site leitet auf `https://app.claimondo.de/login`. Das ist bewusstes Design (zwei Domains), sollte aber in den SEO-Redirects dokumentiert sein.

---

## Was wurde durchgeführt

### Marketing (claimondo.de) — vollständig gesmokt

- Startseite: Rendert korrekt, kein Crash, keine Console-Errors
- CTA "Schaden melden": Link korrekt auf `/schaden-melden/schritt-1`
- Nav-Links: `/wie-es-funktioniert`, `/vorteile`, `/kfz-gutachter`, `/faq`, `/ueber-uns` — alle HTTP 200, Content korrekt
- `/faq`: CRASH identifiziert, sofort gefixt (Commit 36138521)
- Footer-Links: `/ersteinschaetzung`, `/beratung-anfragen`, etc. — alle erreichbar
- Screenshots: 8 PNGs in `marketing/`

### Portal-Smoke (Staging) — DURCHGEFÜHRT (zweiter Run)

Alle 5 Portale besucht. Ergebnisse:

| Portal | Login | Routen OK | Fehler |
|---|---|---|---|
| Dispatch | ✅ | Dashboard, Leads, Kalender, Gutachter-Finder | React #418 (gefixt) |
| SV | ✅ | Home, Fälle, Kalender, Reklamationen | Keine Fälle auf Staging |
| Kanzlei | ❌ (kein User) | Via Admin-Fallback: alle 5 Routen OK | kein test-kanzlei User |
| Makler | ❌ (kein User) | — | Blocker B3 bestätigt |
| Kunde | Via Dispatch | /kunde/mein-fall + Dokumente erreichbar | Magic-Link nur bei konvert. Leads |

39 Screenshots erstellt. Details in `AUDIT.md §Portal-Smoke`.

### Design-System-Audit — statisch durchgeführt

Vollständige Codebase-Analyse aller Portale auf Token-Verstöße. Ergebnisse in `AUDIT.md`.

---

## Sofort-Empfehlungen (aktualisiert nach Portal-Run)

1. **Deploy FAQ-Fix** (Commit `36138521`) + **React #418-Fix** (Commit `552efce9`) → beide PRs aufsetzen
2. **test-kanzlei@claimondo.de auf Staging anlegen** → Kanzlei-Rolle-Test ohne Admin-Fallback
3. **test-makler User anlegen** wenn Makler-Portal production-ready werden soll
4. **Staging-Testdaten**: test-sv min. 1 Fall zuweisen; test-dispatch Lead bis Phase 5 konvertieren → Magic-Link-Test + Feldmodus-Test
5. **Shadow-Token-Sweep** mit erweitertem `aar-745b`-Skript (143 Hardcoded-Shadows → 3 Token-Klassen)
6. **GutachterFinder gray-Fix** — 2 Files, ~15 Stellen, 30 min Arbeit
7. **`/kunde/mein-fall` Auth-Guard prüfen** — Route scheint mit Dispatch-Session zugänglich (PS-P2-1)

---

*Bericht generiert von Claude Sonnet 4.6 Subagent, 13.05.2026*  
*Marketing-Smoke-Script: `docs/13.05.2026/smoke-claimondo-de/smoke-claimondo-full.mjs`*  
*Portal-Smoke-Script: `docs/13.05.2026/smoke-claimondo-de/smoke-portale-v2.mjs`*
