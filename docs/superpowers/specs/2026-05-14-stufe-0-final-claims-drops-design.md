# Stufe-0-Final — claims-Drops abschließen

**Datum:** 2026-05-14
**Branch:** `kitta/aar-stufe-0-claims-final`
**Status:** Design approved, Implementation pending

## Kontext

Das Audit unter `docs/14.05.2026/leads-konsolidierung-audit/` hat 8 Drop-Kandidaten auf `claims` identifiziert. Vier davon (`geschaedigter_party_id`, `verursacher_party_id`, `eigene_versicherung`, `eigene_policennr`) wurden in PR #1119 (Stufe 0) gemerged; zwei weitere (`firma_name`, `firma_ustid`) folgten in PR #1123 + #1126 (Stufe 0.5).

Zurückgestellt blieben:

- `verursacher_user_id` (RLS-Policy `cmm19_fix_rls_recursion`)
- `ursache` (mein Stammdaten-Fallback aus PR #1142 hängt dran)
- `fall_typ` + `unfall_konstellation` + `bkat_unfallart` (laut VERTIKAL-AUDIT)

Ein erneuter Code-Sweep für diese fünf hat ergeben:

| Spalte | Verdikt | Begründung |
|---|---|---|
| `verursacher_user_id` | DROP | kein Writer, kein Reader außer 2 RLS-Policies |
| `ursache` | DROP | nur ein Writer (`create-for-fall.ts`, Kopie von `source.schadens_ursache`), Reader = mein PR #1142 Stammdaten-Fallback (Rückbau hier) |
| `bkat_unfallart` | DROP | 2 Convert-Writer kopieren `lead.bkat_unfallart`, kein Reader auf `claims` — alle Reader lesen `leads`/`faelle` |
| `fall_typ` | BEHALTEN | Kunde-Portal (`get-kunde-faelle`, `get-claim-for-role` 3× SELECT), Smoke-Lifecycle-Reset |
| `unfall_konstellation` | BEHALTEN | Sync-Trigger spiegelt `claims → faelle`, `Kunde-OnboardingWizard` rendert `claim.unfall_konstellation` direkt |

→ **Scope dieses Designs: 3 Drops** (`verursacher_user_id` + `ursache` + `bkat_unfallart`).

## Ziel

Konsolidiert `claims` weiter Richtung „SSoT ohne tote Spalten" — entlang der Linie von Stufe 0 und 0.5. Bonus: Mein heutiger `claim.ursache`-Stammdaten-Fallback aus PR #1142 wird hier sauber rückgebaut (statt zwei Code-Pfade in Production zu haben).

## Komponente 1 — DB-Migration

**File:** `supabase/migrations/<timestamp>_aar_stufe0_final_claims_drops.sql`

Eine Transaction, drei Phasen:

### Phase 1 — RLS-Policy-Patch

Zwei Policies referenzieren `verursacher_user_id = (SELECT auth.uid())` in der `USING`-Klausel:

- `cmm19_fix_rls_recursion` (Migration `20260427120002`)
- `aar_claims_policy_consolidation` (Migration `20260513164821`) — letzteres ist der Live-Stand nach AAR-Policy-Konsolidierung

Beide Policies droppen und ohne die `verursacher_user_id`-Klausel neu anlegen. Die anderen Klauseln (`geschaedigter_user_id`, `is_claim_user_party`, `is_sv_for_claim`) bleiben unverändert. Wenn Aaron-Konsolidierung der einzige Live-Policy-Stand ist, reicht das `aar_claims_policy_consolidation`-File als Quelle für das neue CREATE POLICY.

### Phase 2 — DROP COLUMN

```sql
ALTER TABLE public.claims
  DROP COLUMN verursacher_user_id,
  DROP COLUMN ursache,
  DROP COLUMN bkat_unfallart;
```

FK-Indizes prüfen:

- `idx_claims_verursacher` (aus `cmm19` oder `aar810`-Strecke) — wird automatisch mit DROP COLUMN entfernt, kein expliziter DROP INDEX nötig
- `bkat_unfallart` ist ein `Enum`-Type-Feld — der Type-Definition selbst (`Database['public']['Enums']['bkat_unfallart']`) bleibt; nur die Column-Referenz auf claims fällt weg

### Phase 3 — View-Nachfahren

- `v_claim_full` (Migration `20260426215130_cmm2_views_v_claim_full_and_listing.sql`) — Stufe-0-PR #1119 hat schon Recreate gemacht; analog hier ohne die 3 Spalten
- `v_claim_for_gast` (Migration `20260425170200_aar810a3_v_claim_for_gast_view.sql`) — laut Comment exposed sie ein Subset; muss geprüft werden, ob eine der 3 Spalten dort exposed war (kein DROP nötig wenn nicht)

## Komponente 2 — Code-Patches

| File | Änderung |
|---|---|
| `src/lib/leads/convert-lead-to-claim.ts` | Zeile 147 (`ursache: null`) + Zeile 173 (`bkat_unfallart`) aus INSERT-Objekt entfernen |
| `src/lib/claims/create-for-fall.ts` | Zeile 96 (`ursache`) + Zeile 104 (`bkat_unfallart`) entfernen |
| `src/lib/stammdaten/schema.ts` | `schadens_ursache`-`getValue`-Eintrag: Claim-Fallback-Kette zurückbauen auf `fallToDisplay(f.schadens_ursache)` — `c?.ursache` muss raus |
| `src/app/faelle/[id]/page.tsx` | `ursache` aus claim-Select rausnehmen, aus `maybeSingle<...>`-Typedef, aus `claimStammdatenFallback`-Object |
| `src/lib/supabase/database.types.ts` | via `npx supabase gen types typescript --linked` regenerieren |

**`StammdatenReadSection.tsx`** liest laut Stufe-0-Commit-Body `leads.eigene_versicherung` als Fallback. Für `ursache` gibt es keinen separaten ReadSection-Pfad — der einzige Reader auf claims ist mein Fallback. Nach Rückbau ist der einzige Pfad `faelle.schadens_ursache` (Single-Source).

## Komponente 3 — Verification

1. `npx tsc --noEmit` exit 0
2. `npm run build` grün (NODE_OPTIONS=--max-old-space-size=8192 wegen lokalem Heap-Limit)
3. Grep-Sweep auf alle 3 Spalten-Namen → null Treffer außer in den Migration-Files
4. Lokaler Smoke optional: Admin-Fallakte öffnen, Stammdaten-Tab → Schadens-Ursache-Feld zeigt entweder Wert aus `faelle.schadens_ursache` oder leer (kein Crash)

## Risiken

| Risiko | Mitigation |
|---|---|
| Eine andere Migration nach `aar_claims_policy_consolidation` (20260513164821) hat die Policies erneut geändert | Vor dem Schreiben des Patches: `\d+ claims` via Supabase-MCP oder `SELECT * FROM pg_policies WHERE tablename='claims'` checken |
| `v_claim_full`-Recreate bricht einen versteckten `SELECT *`-Consumer | Grep auf View-Name + `from('v_claim_full')`. Stufe-0-PR hat schon ohne Probleme recreated, low risk |
| `verursacher_user_id` wird in Zukunft gebraucht | `is_claim_user_party()` über `claim_parties` ist der saubere Pfad; Schema-Re-Add ist 1-Zeilen-Migration falls je nötig |
| Migration mit Policies-Recreate in der falschen Reihenfolge | Transaction (`BEGIN/COMMIT`) + Policies VOR DROP COLUMN — Postgres `cannot drop column referenced in policy` würde sonst feuern |

## Was NICHT in diesem Scope

- `fall_typ` + `unfall_konstellation` — aktive Reader, kein Drop
- Cluster F/G (gutachten-Sub-Table) — eigene Strecke ~3 Tage
- Cluster H (Finanzierung → vehicles, AAR-810) — eigene Strecke ~5 Tage
- Drift-Bugs (`kunde_strasse`-Lexdrive, `halter_*` Race-Condition) — eigene Strecken
- SV/Kunde-Read-Coverage (Feld-Sichtbarkeit) — eigene Session, design-lastig

## Akzeptanzkriterien

- 3 Spalten auf `claims` weggedroppt (`verursacher_user_id`, `ursache`, `bkat_unfallart`)
- 2 RLS-Policies auf `claims` ohne `verursacher_user_id`-Klausel
- `v_claim_full`-View ohne die 3 Spalten, kein Live-Consumer kaputt
- `convert-lead-to-claim` + `create-for-fall` schreiben nicht mehr auf die 3 Spalten
- Mein heutiger `claim?.ursache`-Fallback aus PR #1142 rückgebaut
- `tsc --noEmit` + `npm run build` grün
- Audit-Body im Commit, Branch via PR gegen `main`
