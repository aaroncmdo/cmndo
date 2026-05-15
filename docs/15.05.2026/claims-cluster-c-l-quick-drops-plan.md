# Plan — claims Cluster C + L Quick-Drops

> **⚠️ OBSOLET / ALREADY DONE — 15.05.2026 09:50:**
> Pre-Check ergab: 4 der 5 Spalten wurden am 14.05.2026 bereits von der `aar-stufe-0-claims-final`-Session gedroppt (Migrations `20260514132634_aar_claims_drop_dead_party_eigene_vs.sql`, `20260514142739_aar_claims_drop_firma_name_with_trigger_patch.sql`, `20260514144005_aar_claims_drop_firma_ustid.sql`). Die 5. Spalte (`verursacher_user_id`) existierte nie — Vertikal-Audit-Eintrag war hypothetisch.
> AAR-919 wurde **nicht angelegt**, dieses Plan-Doc bleibt als Lesson archiviert: **Vertikal-Audit vom 14.05. ist 1 Tag älter als der aktuelle DB-Stand.** Vor jedem Cluster-Refactor erst `information_schema.columns` checken, sonst Duplikat-Arbeit.

**Datum:** 15.05.2026 · **Status:** OBSOLET (bereits umgesetzt am 14.05.)
**Vorlage:** `docs/14.05.2026/leads-konsolidierung-audit/CLAIMS-VERTIKAL-AUDIT.md` (Cluster C + L) — vor Stufe-0-Final geschrieben
**Vorgänger:** PR #1288 (AAR-918 A2 Finanz), PR #1290 (Audit-Docs)

## Was

5 Spalten auf `claims` mit Coverage 0/11 droppen — alle haben in `claim_parties` einen kanonischen Counterpart, keine Code-Writer.

| Spalte | Cluster | Coverage | Counterpart | Action |
|---|---|---|---|---|
| `claims.geschaedigter_party_id` | C | 0/11 | `claim_parties.rolle='geschaedigter'` | DROP |
| `claims.verursacher_user_id` | C | 0/11 | RLS-Pfad ungenutzt | DROP (mit RLS-Pre-Check) |
| `claims.verursacher_party_id` | C | 0/11 | `claim_parties.rolle='verursacher'` | DROP |
| `claims.firma_name` | L | 0/11 | `claim_parties.firma` | DROP |
| `claims.firma_ustid` | L | 0/11 | `claim_parties.ust_id` | DROP |

Behalten (Cluster C):
- `claims.geschaedigter_user_id` (9/11) — RLS-Policy nutzt das als direkten Cache, JOIN über `claim_parties` wäre RLS-rekursiv.

## Pre-Checks (Pflicht vor Migration)

```sql
-- 1. Coverage-Verifikation
SELECT
  count(*) FILTER (WHERE geschaedigter_party_id IS NOT NULL) AS c1,
  count(*) FILTER (WHERE verursacher_user_id IS NOT NULL) AS c2,
  count(*) FILTER (WHERE verursacher_party_id IS NOT NULL) AS c3,
  count(*) FILTER (WHERE firma_name IS NOT NULL) AS c4,
  count(*) FILTER (WHERE firma_ustid IS NOT NULL) AS c5
FROM claims;
-- erwartet: alle 0

-- 2. RLS-Policies prüfen ob sie auf die 5 Spalten referenzieren
SELECT policyname, qual, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='claims'
  AND (qual::text ~ 'verursacher_user_id|verursacher_party_id|geschaedigter_party_id|firma_name|firma_ustid'
    OR with_check::text ~ 'verursacher_user_id|verursacher_party_id|geschaedigter_party_id|firma_name|firma_ustid');
-- erwartet: 0 rows

-- 3. Sync-Trigger-Spalten-Liste prüfen
SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname IN ('claims','faelle') AND t.tgname ILIKE 'trg_sync%';
-- falls Spalten in UPDATE OF -Liste: Trigger nachziehen
```

## Code-Sweep

```
grep -rn "geschaedigter_party_id\|verursacher_user_id\|verursacher_party_id" src/ --include='*.ts' --include='*.tsx'
grep -rn "claims\.firma_name\|claims\.firma_ustid" src/
```

Erwartung laut Vertikal-Audit: 0 Writer. Falls Reader: auf `claim_parties` umstellen oder droppen.

## Migration

```sql
-- aar919_claims_drop_cluster_c_l.sql
ALTER TABLE public.claims DROP COLUMN IF EXISTS geschaedigter_party_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS verursacher_user_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS verursacher_party_id;
ALTER TABLE public.claims DROP COLUMN IF EXISTS firma_name;
ALTER TABLE public.claims DROP COLUMN IF EXISTS firma_ustid;

-- Falls Sync-Trigger ein DROP TRIGGER + CREATE TRIGGER mit reduzierter
-- UPDATE OF-Liste braucht — siehe Pre-Check 3.

-- Falls v_claim_full oder v_claim_for_gast die Spalten exposed → View neu
DROP VIEW IF EXISTS public.v_claim_full CASCADE;
DROP VIEW IF EXISTS public.v_claim_for_gast CASCADE;
-- CREATE VIEW ... (ohne die 5 Spalten) — Vorlage aus aktueller View-Definition
```

## Risiko

Niedrig. Coverage 0/11 ist klare Indikation toten Schemas. Pre-Check 2 (RLS-Referenz) ist der einzige Stolperstein — wenn `verursacher_user_id` doch in einer Policy versteckt ist, blockt das Postgres das DROP nicht aber Reader brechen.

Memory `feedback_post_drop_smoke`: nach DROP volle Portal-Smoke. Hier aber: Coverage=0 → Reader, wenn vorhanden, returnen eh immer null. Smoke-Pflicht wie üblich.

## Worktree

```
git worktree add C:/Users/Aaron Sprafke/stampit-app/stampit-app/wt-aar919 -b kitta/aar919-claims-cluster-c-l-drops origin/main
```

## Linear

Neues Ticket AAR-919 anlegen, Referenz auf Vertikal-Audit + dieses Plan-Doc. Akzeptanzkriterien:
- [ ] 5 Spalten gedroppt via Migration
- [ ] Sync-Trigger-Liste cleaned wenn Spalten enthalten waren
- [ ] Views (v_claim_full, v_claim_for_gast) neu erstellt ohne die 5 Spalten falls referenziert
- [ ] 4 SQL-Proofs in PR-Body
- [ ] Post-Smoke Admin/SV/Kunde-Fallakte lädt ohne 5xx

## Aufwand

~45-60 min: Pre-Checks (15 min) + Migration (10 min) + Code-Sweep (15 min) + DB-Apply + Smoke (15 min) + PR.

## Was NICHT in diesem Ticket

- Cluster F+G (Gutachten-OCR + Werte) → `aar-cluster-fg-gutachten`-Session
- Cluster D (Gegner-VS) → Vertikal-Audit: behalten, nicht redundant
- A5 created_by_user_id Guard → eigenes Folge-Ticket (Trigger analog AAR-913)
- A9 status/phase Reader-Consistency-Audit → eigenes Folge-Ticket
