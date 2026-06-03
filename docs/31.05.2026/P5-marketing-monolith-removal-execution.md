# P5 — Marketing aus Monolith entfernt (Execution) · 31.05.2026

Branch `kitta/p5-marketing-aus-monolith` (off `origin/staging`). Setzt Handoff
`docs/31.05.2026/HANDOFF-P5-marketing-aus-monolith-entfernen.md` um. Marketing läuft
komplett aus dem :3006-Build (P1–P3 LIVE); der Monolith wird hier portal-only.

## Ergebnis: 282 Files gelöscht, `tsc --noEmit` grün (0 Fehler)

| Kategorie | Anzahl |
|---|---|
| `src/app/` Marketing-Routen + Root-Files | 96 |
| `src/content/claimondo/**` (.md) | 105 |
| `src/lib/{feed,content}` | 15 |
| `src/components/{content,landing,seo,marketing,gutachter-partner}` | 57 |
| `src/data/*-mapping + decoder-versicherer-cross + versicherer-detail` | 6 |
| + `api/cron/refresh-staedte-top20`, `onboarding/KartenWizardToggle.tsx` | (in app/components) |

Root-Files: `page.tsx, sitemap.ts, robots.ts, llms.txt, llms-full.txt, opengraph-image.tsx, feed.json, feed.xml, feed/, (marketing)/[koeln]`.
Barrel `components/shared/index.ts`: toter `LandingCta`-Re-Export entfernt.

## Korrekturen ggü. Handoff-Lösch-Set (Re-Verifikation gegen origin/staging)
Der Handoff-Set war **unvollständig/teilweise falsch** — bei blinder Anwendung wäre der Build gebrochen:
- **`makler/`** ist NICHT marketing-only (enthält `(shell)/onboarding/pending` = Makler-Portal). → nur `makler/partner-werden` gelöscht, Portal behalten.
- **3 Cross-Deps aus Nicht-Marketing-Code** in Marketing-Routen (Handoff übersah, hätte tsc gebrochen): `api/cron/refresh-staedte-top20` (→ kfz-gutachter/staedte+freshness; verwaiste Marketing-SEO-Infra → gelöscht), `components/landing/HauptseiteClient` (→ kfz-gutachter/staedte) + ganzes `components/landing` (marketing-only, 0 Portal-Ref → gelöscht), `onboarding/KartenWizardToggle` (→ schaden-melden/MiniWizardClient; nur von gutachter-finden genutzt → gelöscht; **Rest von `components/onboarding` = DynamicWizard = Portal-Wizard, behalten**, von `kunde/onboarding-details` genutzt).
- **Daten-Dateinamen korrigiert:** `decoder-versicherer-cross.ts` / `versicherer-detail.ts` (Handoff schrieb `-mapping`-Suffix, real ohne).
- **Weitere Marketing-Orphans** (knip): `components/seo/AuthorBox`, `components/marketing/TrackingHooks`, `components/gutachter-partner/*`, `components/shared/LandingCta`, `lib/seo/brand-fakten-library` — alle 0 Refs → gelöscht.

## Nuancen (Handoff-P5b) gelöst
- **`app/page.tsx`** gelöscht — safe: `proxy.ts` leitet `app.claimondo.de/` → `/login` (Middleware, nicht Page); claimondo.de läuft aus :3006.
- **`robots.ts` gelöscht** (statt scopen): `proxy.ts` serviert `app.claimondo.de/robots.txt` inline (Disallow:/); claimondo.de-robots aus :3006. Monolith-robots.ts war dead + importierte gelöschten Content.
- **`favicon.ico` behalten** (App braucht eins). **`lib/seo/alternates`+`conversion-handoff` behalten** (von layout.tsx genutzt). **`VersichererSelect`** war schon pre-delete unimportiert (pre-existing orphan, nicht P5-Scope) → belassen.

## Verifikation
- `tsc --noEmit` grün (0 Fehler) — **das P5-Gate** (Handoff). Voller `next build` läuft im CI-`build`-Check am PR (Monolith-Build OOMt im Worktree).
- Referenz-Sweep: 0 verbliebene Imports gelöschter Module; `proxy.ts` rein string-basiert (Redirects intakt, kein gelöschter Import).
- `next.config` `/schaden-melden/schritt-*`-Redirects sind jetzt tot-aber-harmlos (proxy forwarded `/schaden-melden/*` → claimondo.de vor next.config) → belassen (optional-Cleanup).

## NICHT in diesem PR (Folge)
- **P4 — nginx-Fallback entfernen** (`claimondo.de 404 → :3000`): NACH P5-Deploy, VPS (Aaron). Bis dahin bleibt der Fallback als harmloses Netz.
- Live-Sweep claimondo.de (199 URLs) testet :3006 (unverändert von P5) — Aaron beim Deploy/P4.
- Vorbestehende Portal-Orphans (knip: gutachter/fall/_components etc.) — nicht P5-Scope.
