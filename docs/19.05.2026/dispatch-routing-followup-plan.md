# Dispatch-Routing Followup — Plan

Branch: `kitta/aar-dispatch-routing-followup` (Sub-Branch von `kitta/aar-kfzgutachter-ads-lp` @ `19faf3b0`)
Worktree: `.claude/worktrees/aar-dispatch-routing-followup/`

## Scope (Aaron 2026-05-19)

1. **`zugewiesen_an`-Avatar in Dispatch-Liste** — Doppel-Calls verhindern
2. **Auto-Routing im Convert-RPC** — Round-Robin (least-loaded), Stadt-basiert als Phase 2 (braucht erst `profiles.zustaendigkeits_*`-Schema)
3. **Sound-Cue + Browser-Push** — Sound via Web-Audio-API (sofort), Service-Worker-Push als optionaler Folgeschritt mit VAPID-Keys
4. **Smoke-Test für Push-Flow** — analog zum `smoke-popover-e2e.mjs`, prüft `benachrichtigungen`-Inserts

## Task-Reihenfolge

| # | Was | Files |
|---|---|---|
| T1 | Migration: `convert_anfrage_zu_lead`-RPC erweitern um Round-Robin-Assignment | `supabase/migrations/<ts>_convert_round_robin.sql` |
| T2 | Types regen + Dispatch-Liste lädt `zugewiesen_an` + Profile-Avatar | `src/app/dispatch/leads/page.tsx`, `LeadsViewToggle.tsx` |
| T3 | Sound-Cue beim Realtime-Insert (Web-Audio-API, kein File-Asset) | `LeadsViewToggle.tsx` |
| T4 | Smoke-Test: LP-Submit → check `benachrichtigungen` + `leads.zugewiesen_an` | `scripts/smoke-push-flow.mjs` |
| T5 | Optional: VAPID-Setup + Service-Worker für Browser-Push | separate Migration + Worker-File |

## Test-Plan

- `npm run test src/app/kfzgutachter-lp src/app/api/kfzgutachter-lp` muss weiter grün bleiben (51 Tests)
- Smoke-Lauf vor PR: `node scripts/smoke-popover-e2e.mjs` + `node scripts/smoke-push-flow.mjs`
- Cleanup-Scripts erweitern

## Out-of-scope

- VAPID-Key-Generation in Production (Aaron-Side)
- `push_subscriptions`-Tabelle (kommt mit T5 wenn überhaupt)
- Stadt-basiertes Routing (braucht `profiles.region` oder `zustaendigkeits_plzs`-Array)
