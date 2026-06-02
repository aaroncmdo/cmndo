# CMM-49 Drop-Runway — Batch FK-pilot-2 `fall_summaries` (Reader-Pattern) — Smoke & Audit (02.06.2026)

Zweiter Batch des Drop-Runways (Plan §4.1). Demonstriert das **Reader-Repoint-Pattern** (das die ~401 faelle-Reader brauchen) + wendet die §5-Lektion an: **neue** Migrationsversion → `Supabase Preview` validiert den Replay sauber (anders als der edit-in-place bei ki_gespraeche).

## Ausgangslage (Live-Audit)
`fall_summaries`: **0 Rows**, `claim_id` bereits da (`cmm49_rekey_batch_b`), `fall_id` vorhanden. fall_id-Dependents: nur `trg_derive_claim_id`-Trigger + Index `idx_fall_summaries_fall_id` (faellt auto mit der Spalte). Einzige Policy `fall_summaries_staff` ist **rein rollenbasiert** (kein fall_id) — in Baseline UND live identisch → **kein** Policy-Repoint, kein LIVE≠REPLAY-Problem (anders als ki_gespraeche, wo staff untracked repointet war).

## Reader-Repoint (P2) — 5 Files → `claim_id` (interim)
Pattern (§5, interim — claimId via `faelle.claim_id`-Lookup, P4-TODO: aus Claim-Kontext threaden):
- `src/lib/copilot/briefing.ts` (`ladeLetzteAnalyse`) — read → claim_id
- `src/lib/faq-bot/analyse.ts` (`wurdeHeuteBereitsAnalysiert` read + `maybeAnalyseBotInteraktion` insert) → claim_id
- `src/app/faelle/[id]/ai-actions.ts` (`generateFallSummary` insert) → claim_id
- `src/app/api/fall-summaries/route.ts` — `fall_id`-Query-Param bleibt (externer Contract), intern auf claim_id aufgeloest; select `fall_id`→`claim_id`
- `src/components/admin/FaqBotAnalyseCard.tsx` (`ladeLetzteAnalyse`) → claim_id

Andere-Tabellen-`fall_id` (pflichtdokumente/nachrichten/timeline/tasks/…) in denselben Files NICHT angefasst.

## Migration (P3) — `20260602133100_cmm49_fall_summaries_drop_fall_id.sql`
`DROP TRIGGER trg_derive_claim_id` + `ALTER TABLE fall_summaries DROP COLUMN fall_id` (Plugin, recorded version == Dateiname). **Neue** Version → Preview re-replayt.

## Verifikation
- Post-Migration (execute_sql READ): `fall_id` **weg**, `claim_id` **da**, `trg_derive_claim_id` **weg** ✓.
- `npx tsc --noEmit`: **grün** (alle 5 Files nutzen untyped Clients → claim_id-Refs type-safe; reader-repoint kompiliert).
- **Replay-Gate `Supabase Preview`:** als NEUE Migration getriggert → erwartet **grün** (empirischer Replay-Beweis — die §5-Lektion umgesetzt; bei ki_gespraeche war's edit-in-place → skip). Nach Push beobachtet.
- Funktionaler Feature-Smoke: n/a (0 Rows; AI-Summary-Feature wird von aktuellen Daten nicht exerziert) → post-merge auf deploytem Staging.

## Status
- §2 Batch-Katalog: `FK-pilot-2` (fall_summaries) **done**.
- Interim-Resolution (`faelle.claim_id`-Lookup in 5 Files) als **P4-TODO** markiert (vor dem faelle-DROP aus Claim-Kontext threaden).
- Nächster: weitere FK-/Reader-Batches aus §2 (jeweils eigener PR, neue Migrationsversion).
