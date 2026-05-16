# CMM-60 Schritt 1 — `claims.sv_id` Apply + Verifikation

**Stand:** 2026-05-16 (abends) · Branch `kitta/cmm-60-claims-sv-id` · Migration `20260516174112_cmm60_claims_sv_id.sql`

CMM-60 Schritt 1 (strukturelle Grundlage `claims.sv_id`) wurde appliziert und verifiziert. Schritt 2 (RLS-Umstellung) + Schritt 3 (Writer-Migration) folgen separat — Schritt 2 ist mit Aaron durchzugehen.

---

## 1 · Pre-Apply-Probe (`scripts/probe-cmm60-preapply.sql`)

| Check | Ergebnis |
|---|---|
| `claims.sv_id` existiert | false (erwartet — noch nicht angelegt) |
| Migration `20260516174112` getrackt | false |
| Trigger `trg_sync_faelle_sv_id_to_claims` existiert | false |
| `faelle` total | 30 |
| `faelle` mit `claim_id` | 30 |
| `faelle` mit `sv_id` | 21 |
| `faelle` mit `sv_id` UND `claim_id` (Backfill-Erwartung) | 21 |

Saubere Greenfield-Ausgangslage, kein Drift durch Parallel-Sessions.

## 2 · Apply

Targeted-Apply (Drift-Workaround, siehe Handoff §4 — `20260515020338_aar_fix_isochrone_polygon_format.sql` hängt lokal-only):

```
npx supabase db query --linked --agent yes --file supabase/migrations/20260516174112_cmm60_claims_sv_id.sql
npx supabase migration repair --status applied 20260516174112
```

Beides exit 0.

## 3 · Post-Apply-Verifikation (`scripts/probe-cmm60-postapply.sql`)

| Check | Ergebnis |
|---|---|
| `claims.sv_id` existiert | true |
| Migration `20260516174112` getrackt | true |
| Index `idx_claims_sv_id` existiert | true |
| Trigger `trg_sync_faelle_sv_id_to_claims` existiert | true |
| FK `claims.sv_id` → `sachverstaendige` | true |
| `claims` mit `sv_id` (Backfill, Erwartung 21) | **21** |
| `claims.sv_id` ≠ `faelle.sv_id` (Mismatches) | **0** |

Backfill exakt 21 Rows, 0 Mismatches gegen `faelle.sv_id`.

## 4 · Trigger-Smoke (`scripts/probe-cmm60-trigger-smoke.sql`)

Transaktional mit `ROLLBACK` — keine echte Datenänderung. An `faelle` `0fa542a5-…` (claim `0f19efb3-…`):

1. `faelle.sv_id` → `NULL` gesetzt
2. `faelle.sv_id` → anderer SV gesetzt
3. Verifikation: `claims.sv_id == faelle.sv_id` → **true** (`1da11741-…` auf beiden Seiten)

Übergangs-Trigger `sync_faelle_sv_id_to_claims` spiegelt korrekt.

## 5 · Types

`src/lib/supabase/database.types.ts` neu generiert (`supabase gen types typescript --linked`).
Diff = +10 Zeilen, rein additiv: `claims.sv_id: string | null` in Row/Insert/Update + FK-Relation `claims_sv_id_fkey`. Kein App-Code referenziert `claims.sv_id` (Writer-Migration = Schritt 3).

## 6 · Offen — Schritt 2 + 3

- **Schritt 2 (RLS):** `is_sv_for_claim` + abhängige Policies von `faelle.sv_id` auf `claims.sv_id` umstellen. **Heikel** (Memory `feedback_rls_function_grants` — SECURITY-DEFINER-Grants gehen bei `CREATE OR REPLACE` verloren, Inzident AAR-894). Jede Policy einzeln + `GRANT EXECUTE` idempotent. **Mit Aaron durchgehen.**
- **Schritt 3 (Writer):** `sv_id`-Writer (heute `faelle`) auf `claims` umstellen + Reverse-Sync-Trigger `claims→faelle`. Übergangs-Trigger aus Schritt 1 bleibt bis dahin aktiv.
