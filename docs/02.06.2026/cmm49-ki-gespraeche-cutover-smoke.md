# CMM-49 Drop-Runway — Pilot-0 Cutover `ki_gespraeche` — Smoke & Audit (02.06.2026)

Erster ausgeführter Batch des Drop-Runways (Plan: `docs/superpowers/plans/2026-06-02-cmm49-faelle-drop-runway.md`, §4.0). Validiert das vollständige `fall_id`→`claim_id`-Cutover-Muster (§5) live.

## Tabelle / Ausgangslage (Live-Audit)
- `ki_gespraeche`: **0 Rows**, **0 Live-Code-Refs** (nur Kommentare in `makler/copilot/route.ts` + `faq-bot/ask.ts` + generierte Typen — kein `from('ki_gespraeche')`).
- `claim_id` bereits vorhanden (Backfill durch `cmm49_rekey_batch_b`), `fall_id` nullable.
- Gewählt als Pilot-0, weil 0-Kopplung → das Migrations-/FK-/Tracking-Muster sauber + risikofrei verifizierbar.

## KEY-Finding: `fall_id` hat Dependents
Ein nackter `DROP COLUMN fall_id` schlug fehl:
```
ERROR: 2BP01: cannot drop column fall_id ... other objects depend on it
DETAIL: policy ki_gespraeche_kunde_insert depends on column fall_id
        trigger trg_derive_claim_id depends on column fall_id
```
→ **Jeder** FK-Drop muss zuerst die Dependents lösen (in §5 Schritt 4 aufgenommen):
1. RLS-Policy `ki_gespraeche_kunde_insert` (Kunde-Scope) von `fall_id IN (faelle WHERE kunde_id=auth.uid())` → `claim_id IS NOT NULL AND is_claim_user_party(claim_id)` (kanonischer Helper; **`faelle.kunde_id` ≠ `claims.geschaedigter_user_id` bei 1 Fall** → Spalte NICHT inlinen). Staff-Policy war bereits claim-based (`can_access_claim`).
2. `trg_derive_claim_id` (Funktion `derive_claim_id_from_fall`, von ~42 Triggern geteilt) auf DIESER Tabelle gedroppt — Funktion bleibt.

## Migration
`20260602125054_cmm49_ki_gespraeche_drop_fall_id.sql` (Plugin, recorded version == Dateiname, kein Twin-Drift). Inhalt: DROP POLICY + CREATE POLICY (claim-based) → DROP TRIGGER → ALTER TABLE DROP COLUMN fall_id.

## Verifikation (execute_sql READ, post-migration)
- `fall_id` Spalte: **weg** ✓ · `claim_id`: **da** ✓
- `trg_derive_claim_id` auf ki_gespraeche: **weg** ✓
- `ki_gespraeche_kunde_insert` WITH CHECK: `(rolle='kunde' AND user_id=auth.uid() AND claim_id IS NOT NULL AND is_claim_user_party(claim_id))` ✓ (claim-based, kein fall_id mehr)
- `npx tsc --noEmit`: **grün** (0 Code-Refs → kein Consumer bricht; generierte Typen lag-en für ki_gespraeche.fall_id, Regen aufgeschoben wie b″ — 0 Consumer).
- Funktionaler Smoke: n/a (0 Rows, 0 Code-Refs — kein Feature nutzt die Tabelle; „post-MVP"-Platzhalter).

## KEY-Finding: Moving Target
FK-Zahl auf `faelle` **stieg** während dieses Batches von 45 → **46** (parallele Sessions legten neue `fall_id`-FK-Tabellen an, z.B. `aar939_embed_tracking_webhook_monitoring`). → Runway-Regel (§3.9): **neue Tabellen MÜSSEN `claim_id` referenzieren, nie `fall_id`**, sonst konvergiert der Drop nie. P4 macht finalen FK-Re-Count.

## Status
- §2 Batch-Katalog: `FK-ai-dead` → ki_gespraeche **done**, ai_usage_log frei.
- Nächster Pilot (Reader-Pattern): `fall_summaries` (§4.1).
