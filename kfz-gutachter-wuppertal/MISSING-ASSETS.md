# Asset-Status & Nachliefer-Liste — Kfz-Gutachter Wuppertal

**Stand:** 28.05.2026 · Build ist lauffähig, aber mehrere Cluster-Bilder sind **Platzhalter**.

## ⚠️ `public/assets/img/` ist gitignored — Bilder liegen NICHT im Repo
Die Bild-Binaries (Hero/Team/Logo/Stadt/OG/Favicon/besichtigung/cases/local) sind **bewusst nicht
committet** (waren ~215 MB → Repo-Bloat; zudem committet auch `autounfall-io` seine großen Assets
nicht). Sie werden aus `brand-assets-archiv.zip` nach `public/assets/img/` **extrahiert** (Dev +
Deploy, siehe DEPLOY.md §3). Committet sind nur `public/assets/brand/*.svg` (Siegel-Fallback) +
`public/favicon.svg`. Falls Versionierung der Assets gewünscht: git-lfs. Die unten genannten
Platzhalter liegen aktuell nur in der lokalen Worktree-`public/` (für Build/Smoke), nicht im PR.

## Ursache

Die gelieferte `brand-assets-archiv.zip` (189 MB) war **truncated** — das End-of-Central-Directory
fehlte (am Dateiende abgeschnitten). Per Local-Header-Scan (`_quellen/_salvage.mjs`) wurden **92 von
93 Dateien** gerettet. Im abgeschnittenen Tail verloren:

- **`wuppertal/`** — der komplette Cluster-Master-Bildersatz (hero, team, kundengespraech, logo, stadt, og, favicon-Set)
- **`shared/besichtigung/`** — schritt-1…6 (Leistungen-Sektion)
- **`shared/cases/`** — Praxis-Fall-Bilder
- 1 unvollstaendige Datei: `shared/portal/dashboard-desktop-2.png`

Zusätzlich waren **nie** in der ZIP (laut `_ASSET_MANIFEST.md` §72, „Trust-Assets nicht promptbar"):
Claimondo-Partner-Siegel, Kanzlei-Logo (LexDrive).

## Aktuell gesetzte Platzhalter (damit Build + Screenshots funktionieren)

Alle aus geretteten, generischen Claimondo-Bildern — **vor Go-Live durch finale, Wuppertal-spezifische Assets ersetzen.**

| Slot (Pfad in `public/`) | Platzhalter-Quelle |
|---|---|
| `assets/img/wuppertal/hero-wuppertal.webp` | `shared/hero-gutachter-v1.webp` |
| `assets/img/wuppertal/team-wuppertal.webp` | `shared/team-foto.webp` |
| `assets/img/wuppertal/kundengespraech-wuppertal.webp` | `shared/hero-gutachter-v1.webp` |
| `assets/img/wuppertal/stadt-wuppertal.png` | `shared/vor-ort-begutachtung.png` |
| `assets/img/wuppertal/logo-wuppertal.webp` + `.png` | `claimondo-v2/public/brand/logo-full.png` |
| `assets/img/wuppertal/og-wuppertal.png` | `claimondo-v2/public/brand/logo-full.png` |
| `assets/img/shared/besichtigung/schritt-1…6` | `shared/schadenaufnahme*.png` / `gutachter-arbeit.png` / `vor-ort-begutachtung.png` / `ergebnis-schluessel.png` |
| `assets/img/shared/cases/praxis-*.webp` (5) | `shared/hero-gutachter-v1.webp` (alle 5 — `data-placeholder="true"`) |
| `assets/brand/siegel-claimondo-partner.svg` | `claimondo-v2/public/brand/logo-mark.svg` (Fallback laut Handoff 6c) |
| `public/favicon.svg` | `claimondo-v2/public/brand/logo-mark.svg` |

## Korrekt geliefert (kein Platzhalter)

- `assets/img/shared/monika.png` (Schadensbetreuerin-Karte, FAB)
- `assets/img/local/brennpunkte/wuppertal_{widukindstrasse,hofkamp,doeppersberg}.webp`
- `assets/img/local/*.webp` (Sub-Stadt-Bilder — aktuell nicht auf der Seite referenziert, fuer spaeter)

## Aaron muss nachliefern (für echtes Go-Live)

1. **Vollständige, nicht-truncated `brand-assets-archiv.zip`** neu exportieren/senden — enthält dann
   `wuppertal/` (hero/team/kundengespraech/logo .webp+.png/stadt/og/favicon-Set) + `shared/besichtigung/` + `shared/cases/`.
2. **Claimondo-Partner-Siegel** final (`siegel-claimondo-partner-v2.svg`) → `public/assets/brand/siegel-claimondo-partner.svg`.
3. **LexDrive-Kanzlei-Logo** → `public/assets/brand/kanzlei-lexdrive-logo.png` (aktuell 404 in Ablauf-Sektion).

## ⚠️ Vor SEA-Live ersetzen (UWG / E-E-A-T)

Im Code mit `data-placeholder="true"` markiert (Pre-Live-Sweep: `grep -rn 'data-placeholder' components/`):
- alle `cases/praxis-*` (KI/Platzhalter, „echt"-Anspruch)
- ggf. Gutachter-Porträts/Gesichts-Bilder aus `shared/` (siehe `_ASSET_MANIFEST.md` §80)

„5,0★"-Aussage: Quelle „7 Google-Bewertungen" ist im UI sichtbar belegt (Reviews-Badge) — UWG-konform,
solange die Bewertungszahl stimmt.
