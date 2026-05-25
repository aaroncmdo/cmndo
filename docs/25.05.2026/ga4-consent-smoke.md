# Smoke: GA4 Consent-Mode v2 + Host-Gating (25.05.2026)

Branch `kitta/ga4-consent-mode-v2` (PR #1709). Spec/Plan: `docs/superpowers/specs/2026-05-25-ga4-consent-mode-design.md` · `docs/superpowers/plans/2026-05-25-ga4-consent-mode.md`.

## Statische Verifikation

| Gate | Ergebnis |
|---|---|
| `vitest` (consent.ts) | ✅ 8/8 (isTrackingHost: apex/www ✓, app./gutachter./makler./kfzgutachter./schaden./staging ✗, Port/Case/null, localhost dev✓/prod✗) |
| `tsc --noEmit` | ✅ 0 Fehler projektweit, 0 in Touched-Files |
| `next build` (Compile + TypeScript) | ✅ Compiled successfully + TypeScript finished |
| `npm run check:token-audit` | ✅ 1705 Files, 0 Verstöße |

### Build-Hinweis (kein Regress)
Der **volle** static-export bricht lokal bei `/gutachter-partner` ab (Build-Zeit-Supabase-`count` mit `revalidate=3600`, >60s-Timeout × 3). **Baseline-Test bewiesen environmental:** `git stash` meiner Änderungen + Rebuild von reinem `origin/staging` scheitert **identisch** an derselben Seite → DB-Last (mehrere aktive Sessions + Supabase-Connection-Limits), **nicht** diese Änderung. CI-Build ist das autoritative Gate.

## Lokaler Positiv-Smoke (Runtime)

Dev-Server `PORT=3010`, Test-Measurement-ID `G-1234567890` (NICHT die echte — keine Prod-Property-Pollution), Seite `/datenschutz` (leichtgewichtig, minimale DB-Last). Playwright, `window.dataLayer` inspiziert.

| Check | Ergebnis |
|---|---|
| gtag.js-Script auf localhost (Host-Gate dev-seam) | ✅ `GTAG_SCRIPT_COUNT: 1` |
| Consent-Default **vor** `js`/`config` (race-frei) | ✅ Reihenfolge: `consent default` → `js` → `config` |
| Consent-Default-Werte | ✅ `ad_storage/ad_user_data/ad_personalization/analytics_storage = denied`, `wait_for_update: 500` |
| "Alle akzeptieren" → Update | ✅ `consent update` = alle vier `granted` |
| Banner verschwindet nach Accept | ✅ (Screenshot) |
| Console-Errors | ✅ keine |

dataLayer nach Accept (gekürzt):
```
["consent","default",{...alle denied, wait_for_update:500}]
["js", <date>]
["config","G-1234567890"]
["consent","update",{...alle granted}]
```

## Offen (nach Merge)
- **Staging-Negativ-Smoke:** `app.staging.claimondo.de` → KEIN gtag-Script (Host-Allow-list greift), Banner wirft nicht. (Positiv-Pfad auf staging nicht möglich — Host-Gate; daher hier lokal verifiziert.)
- **Rollout:** `NEXT_PUBLIC_GA4_ID=G-CFMJHZM2NR` erst **nach** Merge auf prod build-time setzen + rebuild (Spec §Rollout).
