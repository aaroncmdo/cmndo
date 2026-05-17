# CMM-44 SP-A2 PR2 — Portal-Smoke nach 28-Spalten-Drop

**Datum:** 2026-05-17 · **Ziel:** `app.staging.claimondo.de` (geteilte prod/staging-DB,
Migration bereits appliziert) · **Skript:** `scripts/smoke-cmm44-spa2-pr2.mjs`
**Screenshots:** `docs/17.05.2026/cmm44-spa2-pr2-smoke/`

## Ergebnis

| | Anzahl |
|---|---|
| ✓ OK | 25 |
| ⚠ WARN | 3 |
| ✗ HARD-FAIL | **0** |

5 Portale (Public, Admin, SV, Kunde, Dispatch) — alle Routen laden, kein 5xx,
kein leerer Screen, keine HARD-FAILs.

## SP-A2-spezifische Checks — alle grün

Die 28 gedroppten Spalten werden über die 4 repointeten Views (`faelle_kunde_view`,
`faelle_sv_view`, `v_claim_full`, `v_faelle_mit_aktuellem_termin`) jetzt aus `claims`
gelesen. Admin-Fallakte-Detail (`/faelle/33bf8685-…`):

- ✓ `detail-schadenort` — Schadenort-Sektion sichtbar
- ✓ `detail-schadendatum` — Schadendatum-Feld sichtbar
- ✓ `detail-schadenhergang` — Hergang-Sektion sichtbar
- ✓ `detail-schadenart` — Schadenart/-typ sichtbar
- ✓ `detail-phase` — Phasen-Anzeige sichtbar (Screenshot: Phasen-Sidebar 01–08 voll gerendert)

Admin-Fallakte rendert vollständig (VS-Korrespondenz, SV-Briefing, Kunde-Block,
Quick-Actions). SV-Fall-Detail (`/gutachter/fall/bbbb3333-…`) lädt OK, Fahrzeug-Daten
sichtbar. Dispatch-Leads-Liste + Lead-Detail OK.

## WARN (3) — alle NICHT SP-A2-bezogen

1. **`admin detail-tab-aufgaben`** — Aufgaben-Tab-Selektor nicht gefunden. Generischer
   UI-Selektor-Miss (gleicher Check warnte schon im SP-A-PR2-Smoke). Nachrichten-/
   Timeline-/Dokumente-Tabs ✓.
2. **`sv detail-gutachten-sektion`** — Gutachten-Sektions-Text nicht gematcht. Gutachten-
   Spalten sind nicht im SP-A2-Scope. Fall-Detail lädt fehlerfrei.
3. **`kunde /kunde/faelle/[id]`** — `test-kunde@claimondo.de` hat keinen verknüpften Fall
   (Seed-Lücke). Kunde-Dashboard + Fälle-Liste laden OK.

## Console-Error

Ein `PAGE-ERROR: Minified React error #418` (Hydration-Mismatch) auf der Admin-Fallakte.
**Kein PR2-Regress:** #418 ist ein reiner SSR-/Client-HTML-Vergleichsfehler; PR2 ändert
nur die DB-Quell-Spalte einer View bei identischen Werten (claims ist seit PR1a/b/c bereits
die Read-Quelle). Bekanntes Hintergrund-Thema im Repo (vgl. Commit `a335539d`
„React #418 weg"). Seite rendert vollständig (Screenshot `0005-admin-fall-detail.png`).

## Fazit

PR2 ist produktionstauglich: Schema-Drop appliziert, View-Repoints wirksam, alle Portale
funktional, keine HARD-FAILs, keine SP-A2-bezogenen Regressionen.
