# Stream A — Doc-25-Gaps (Foundation-Capability)

**Sprint:** 1 · **Tag:** 7 · **Owner:** Claude Code · **Aufwand:** 6 h
**Quell-Spec:** Doc 25 §3 (`marketing-strategy/strategy/`)
**Code-Files:** `src/lib/content/claimondo-mdx.ts`, `src/app/haftpflicht/`, `src/app/decoder/`, `src/app/sitemap.ts`

## Auftrag

1. `publish_status`-Gate: Assets mit `publish_status: draft` aus sitemap + Listing ausschliessen
2. Hub-Pages `/haftpflicht` + `/decoder` (ClusterHubGrid)
3. +10 fehlende Spokes ergaenzen
4. Build-Smoke als PR-Pflicht

## DoD

- `publish_status`-Gate aktiv, Hub-Pages rendern, +10 Spokes live, Build gruen

## Validation

- Spoke mit `publish_status: draft` erscheint NICHT in sitemap
- `curl /haftpflicht` + `curl /decoder` liefern Hub-Page

## Gotchas (aus Doc-16-Erfahrung)

- Neue public Route MUSS in `middleware.ts` publicPaths + `proxy.ts` MARKETING_PREFIXES,
  sonst 307→/login fuer anon + Crawler (Build bleibt gruen — stiller Trap)
- Build mit `NODE_OPTIONS=8192` (TS-Check-OOM); Smoke via `next dev` (`next start` kaputt mit `output: standalone`)
