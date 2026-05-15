# Smoke-Report — PR #1239 Branding-Iteration

**Datum:** 2026-05-14 21:40 UTC · **Branch:** `kitta/aar-sv-logo-bg-removal` · **Env:** lokaler Dev mit .env.local von prod-repo, Port 3013

## Was getestet

Visual-Verifikation der 4 Commits auf PR #1239:

1. Logo-Wrapper-Removal (4 Stellen)
2. Sidebar Backdrop-Blur (SV + Kunde Desktop)
3. BG-Remover-Erweiterungen (hellgrau + Alpha-Padding + Skip-Log)
4. Backfill-Script `rerun-bg-removal.mjs` (CLI, kein Visual)

Spec: `scripts/smoke-sidebar-glass.mjs`, Login als Test-Aaron, Sidebar + Editor screenshotten.

## Ergebnis

| Schritt | Erwartung | Ist | Status |
|---|---|---|---|
| 1 Login `/login` | Redirect weg von /login | OK → `/gutachter/heute` | ✅ |
| 2 Post-Login | SV-Layout geladen | OK (Spinner-Frame eingefangen + Compiling-Badge, später Heute-Page geladen) | ✅ |
| 3 SV-Sidebar full (`/gutachter`) | Glas-Effekt + Brand-Color | **Map durchscheinend hinter Sidebar** sichtbar (Köln-Ansicht) | ✅ Backdrop-Blur greift |
| 4 SV-Sidebar cropped | Detaillierte Transluzenz | Stadtnamen aus Map (Bedburg, Düsseldorf, Wermelskirchen) durchscheinend lesbar | ✅ |
| 5 Branding-Editor `/gutachter/profil/branding` | Logo-Preview + Live-Sidebar-Preview | Editor lädt, Sidebar zeigt Logo **ohne weißen Wrapper** auf rotem Sidebar-BG | ✅ |
| Console-Errors | keine | keine | ✅ |

## Befund

**Backdrop-Blur (PR #1239 Commit `c38a1ac4`):**
- Funktional verifiziert — die Mapbox-Karte auf `/gutachter/heute` ist durch die Sidebar deutlich erkennbar
- color-mix 80% Brand-Sidebar-BG + `backdrop-blur-xl backdrop-saturate-150` erzeugt den gewünschten iOS-Glass-Look
- borderRight 12% opacity macht den Übergang sauber

**Logo-Wrapper-Removal (Commit `cc245c0d`):**
- Im BrandingEditor-Live-Preview links und in der echten Sidebar liegt das Logo direkt auf der roten Brand-Sidebar — kein weißer Frame mehr sichtbar
- Test-Aaron hat custom_branding aktiv (rote Sidebar belegt das), daher useBrand=true-Pfad ist aktiv → Visual-Verifikation greift

**BG-Remover-Erweiterungen (Commit `f7a72ecd`):**
- Code-Audit grün (tsc), Logik-Diff in REPORT.md der Diagnose dokumentiert
- Visual-Verifikation braucht echten Upload-Test mit „problematischem" Logo (hellgrauer BG, Padding-PNG) — Test-Auftrag separat, da kein Upload im Smoke

**Backfill-Script (Commit `a3dc4f19`):**
- Script parst, dotenv lädt, env-Check greift
- Echter Apply gegen Storage erst nach PR-Merge — Dry-Run mit Service-Role-Key sollte hier funktionieren (Skript ist read-only ohne `--apply`)

## Screenshots

| Datei | Inhalt |
|---|---|
| `01-login.png` | Login-Page |
| `02-after-login.png` | Submit-Phase mit Spinner + Next-Compiling-Badge |
| `03-sv-sidebar-full.png` | `/heute` mit Map + Sidebar in einem Frame |
| `04-sv-sidebar-cropped.png` | Sidebar isoliert — Stadtnamen aus Map durchscheinend |
| `05-branding-editor.png` | BrandingEditor mit Logo-Preview + Stile-Sektion |

## Audit-Übersicht PR #1239

| Commit | Code-Change | Smoke-Verifikation |
|---|---|---|
| `cc245c0d` | bg-white-Wrapper raus (4×) | ✅ visuell — Logo direkt auf Brand-Sidebar |
| `c38a1ac4` | backdrop-blur + color-mix 80% | ✅ visuell — Map durchscheinend |
| `f7a72ecd` | hellgrau + alpha-padding + skip-log | ⏸️ Upload-Test ausstehend |
| `a3dc4f19` | backfill-Script | ⏸️ Dry-Run mit Service-Role-Key ausstehend |

## Nächste Schritte

- [ ] Manueller Upload-Test gegen die BG-Remover-Erweiterungen (3 Test-Logos: near-white, hellgrau, padding-PNG) — sobald PR mergeable
- [ ] Dry-Run des Backfill-Scripts gegen den prod-Bucket (read-only) um zu sehen wie viele Legacy-Logos betroffen sind
- [ ] Nach Apply-Run: visuelle Spot-Check-Smoke gegen 2-3 SVs mit zuvor opaque Logos
