# Unused-Indexes — Deferral (14.05.2026)

**Audit-Item:** P3.5 aus `AUDIT-2026-05-13.md` (121 INFO-Lints `unused_index`).
**Empfehlung:** **Heute nicht droppen.** Re-Audit in **2 Wochen** (= 2026-05-28).

---

## Stats-Maturity

```sql
SELECT stats_reset, current_timestamp - stats_reset AS age
FROM pg_stat_database WHERE datname = current_database();
-- 2026-02-12 23:53:40+00 → 89 Tage
```

**89 Tage Stats-History — sollte mehr als ausreichen** (Empfehlung war ≥ 7 Tage). Aber:

## Warum trotzdem Deferral

Die Migration `20260513163628_aar_perf_fk_indexes` (heute 16:36 angewendet) hat **~100 FK-Indexes** neu angelegt. Diese haben **erst ein paar Stunden Stats-Window** — selbst aktiv genutzte Hot-Path-Queries würden hier als `idx_scan=0` erscheinen.

Beispiele aus der frisch angelegten Liste, die als „unused" geflaggt sind, aber wahrscheinlich gleich beim ersten Volumen-Spike Treffer kriegen:
- `idx_faelle_dispatch_id` (Dispatch-Portal-Hot-Path)
- `idx_faelle_lead_id` (Lead → Fall-Konversion-Lookups)
- `idx_faelle_konvertiert_von_lead`
- `idx_flow_links_fall_id` (Magic-Link-Lookups in Fallakte)
- `idx_gutachten_created_by_user_id` u. v. a. m.

Ein Drop dieser Indexes heute würde sie morgen wieder als „missing FK-Index" im Performance-Advisor zeigen → Endlos-Schleife.

## Was sicher droppbar wäre

Bei einer Mini-Drop-Migration ließen sich nur die offensichtlich-leblosen Indexes mitnehmen:

| Index | Tabelle | Size | Begründung |
|---|---|---|---|
| `idx_cron_audit_job_started` | cron_jobs_audit | **1088 kB** | Audit-Log-Tabelle, wird nur geschrieben (per pg_cron-Hook), Query-Pfad existiert nicht |
| `idx_sv_spezifikationen_gin` | sachverstaendige | 32 kB | GIN für JSON-Feld, in der Marketing-Page-Suche nicht (mehr) verwendet |
| `idx_sv_schadenarten_gin` | sachverstaendige | 32 kB | wie oben |
| `idx_sv_qualifikationen_neu_gin` | sachverstaendige | 24 kB | wie oben |

**Auch das aber:** Marketing-Page `/gutachter-finden` ist erst **diese Woche scharf gegangen** (Smoke-Tests am 13.05.). Die GIN-Indexes könnten noch gebraucht werden, sobald echter Traffic einsetzt. Konservativ: drin lassen.

→ Effektiver Drop-Kandidat heute: **0 Indexes**.

## Re-Audit-Plan

**2026-05-28** (= 2 Wochen Reife der heutigen FK-Indexes):

```sql
-- Volle Liste der dann-immer-noch-unused mit Größen-Sortierung
SELECT
  s.indexrelname, s.relname, pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
  s.idx_scan, current_timestamp - p.stats_reset AS stats_age
FROM pg_stat_user_indexes s
JOIN pg_stat_database p ON p.datname = current_database()
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
  AND s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
  AND pg_relation_size(s.indexrelid) > 0
ORDER BY pg_relation_size(s.indexrelid) DESC;
```

Klassifikation pro Index:
- **Drop:** Index auf Spalte, die kein Query-Pfad mehr nutzt (Feature gestrichen, Spalte deprecated)
- **Keep + comment:** Index für FK-Constraint-Lookup (Postgres macht das implizit ohne Index, aber bei `ON DELETE CASCADE` mit großen Kindtabellen ist der Index notwendig)
- **Wait:** Index für Feature, das real-traffic-mäßig noch nicht angelaufen ist (Marketing-Pages, neue Onboarding-Flows)

## Quellen

- Audit-MD: `docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md` §4.5
- Live-Queries via Supabase MCP (14.05.2026 00:35)
- Stats-Reset: 89 Tage alt
- Frische FK-Indexes: `supabase/migrations/20260513163628_aar_perf_fk_indexes.sql`
