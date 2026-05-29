# Asset-Status — Kfz-Gutachter Wuppertal

**✅ LIVE seit 29.05.2026:** `https://kfz-unfallgutachter-wuppertal.de` (PM2 :3003) — echte,
**für Web optimierte** Assets im Deploy (Quell-Bilder waren ~19 MB/Stück → resized/recompressed
auf 132 MB → 4,7 MB; Hero 1600w, Besichtigung 900w, Cases 820w). Smoke 46/0.

**Stand:** 29.05.2026 · **Vollständige `brand-assets-archiv.zip` geliefert** — echte Assets eingespielt.
Die Landingpage rendert lokal mit echten Wuppertal-Bildern (Hero/Team/Kundengespräch/Logo/Stadt/OG/
Favicon), echten Praxis-Cases (`cases/praxis-*.webp`) und der echten Besichtigungs-Foto-Reihe
(`besichtigung/schritt-1…6`). Zusätzlich sind 4 autounfall-io-Hero-Bilder als Ratgeber-Karten-Banner
eingebaut (`ratgeber/`).

## Git: `public/assets/img/` ist gitignored (bewusst)
Die Bild-Binaries sind **~400 MB** (`shared/` allein 398 MB große KI-PNGs) → **nicht im Repo**
(Bloat/PR/CI). Sie werden bei Dev + Deploy aus `brand-assets-archiv.zip` nach `public/assets/img/`
extrahiert (siehe DEPLOY.md §3), analog `autounfall-io` (Drive-Assets). **Committet** sind nur:
- `public/assets/img/ratgeber/*.webp` (4 autounfall-Heroes, ~90 KB — Ratgeber-Banner)
- `public/assets/brand/siegel-claimondo-partner.svg` (Fallback) + `public/favicon.svg`

Falls Versionierung der großen Assets gewünscht: git-lfs.

## ⚠️ Vor SEA-Live prüfen/ersetzen (UWG / E-E-A-T)
Im Code mit `data-placeholder="true"` markiert (Pre-Live-Sweep: `grep -rn 'data-placeholder' components/`):
- `cases/praxis-*` (laut `_ASSET_MANIFEST.md` §80 KI-generiert mit „echt"-Anspruch)
- Team-Foto + Besichtigungs-Schritte (teils KI laut Manifest §80: `gutachter-portrait`, `gutachter-arbeit`,
  `schritt-5-technik-alt`, `ergebnis-kunde`)
→ vor Go-Live durch echte Fotos ersetzen bzw. menschlich freigeben. „5,0★" ist im UI über das
Google-Bewertungs-Badge belegt (UWG-konform bei korrekter Bewertungszahl).

## Noch offen (klein)
- **Claimondo-Partner-Siegel** final (`siegel-claimondo-partner-v2.svg`) → ersetzt aktuell den
  `logo-mark.svg`-Fallback unter `public/assets/brand/siegel-claimondo-partner.svg`.
- **LexDrive-Kanzlei-Logo** (`public/assets/brand/kanzlei-lexdrive-logo.png`) — war nicht im Archiv;
  aktuell kleine 404 in der Ablauf-Sektion (Partnerkanzlei-Zeile).
- **Footer-Betreiber** auf „Kitta & Sprafke UG" vereinheitlicht — bitte gegen `claimondo.de`-Impressum bestätigen.
