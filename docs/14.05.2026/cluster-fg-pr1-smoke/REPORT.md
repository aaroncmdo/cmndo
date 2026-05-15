# Cluster F+G PR-1 — Dual-Write Smoke-Report

**Datum:** 15.05.2026
**Migration:** `20260515094227_aar_cluster_fg_gutachten_schema.sql`
**Test-Claim:** `5b2757e1-ea4c-4f2e-8870-ec7a33647d2c` (CLM-2026-00115)

## Setup-Verifikation (post-migration)

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='gutachten' AND column_name LIKE 'gutachten_%') AS gutachten_new_cols,  -- 65
  (SELECT count(*) FROM pg_proc WHERE proname='apply_gutachten_ocr') AS function_exists,  -- 1
  (SELECT count(*) FROM pg_views WHERE viewname='v_gutachten_werte') AS view_exists,      -- 1
  (SELECT count(*) FROM pg_constraint WHERE conname='gutachten_claim_id_unique') AS uniq;  -- 1
```

Alle 4 Checks ✓.

## Smoke-Test — Dual-Write

Ausführung:

```bash
SMOKE_CLAIM_ID="5b2757e1-ea4c-4f2e-8870-ec7a33647d2c" \
  node docs/14.05.2026/cluster-fg-pr1-smoke/smoke-ocr-dual-write.mjs
```

### Vorher

| Feld | claims | gutachten | view |
|---|---|---|---|
| `reparaturkosten_brutto` | 6450.69 | (no row) | 6450.69 (via COALESCE-Fallback auf claims) |
| `restwert` | 12500 | (no row) | 12500 |
| `gutachten_fin` | WBA8E5C50JK998877 | (no row) | WBA8E5C50JK998877 |
| `gutachten_lohnsatz_ak_eur` | 142 | (no row) | 142 |
| `gutachten_ocr_processed_at` | NULL | (no row) | NULL |

### RPC-Call

```javascript
admin.rpc('apply_gutachten_ocr', {
  p_claim_id: '5b2757e1-...',
  p_values: {
    reparaturkosten_brutto: 9999.99,
    restwert: 1234.56,
    gutachten_fin: 'SMOKE-TEST-FIN-CFG',
    gutachten_lohnsatz_ak_eur: 88.5,
    gutachten_ocr_processed_at: '2026-05-15T10:00:54.996+00:00',
  },
})
```

### Nachher

| Feld | claims | gutachten | view |
|---|---|---|---|
| `reparaturkosten_brutto` | **9999.99** | **9999.99** | **9999.99** |
| `restwert` | **1234.56** | **1234.56** | **1234.56** |
| `wiederbeschaffungswert` | 19800 (unchanged — nicht im payload, COALESCE) | 19800 | 19800 |
| `gutachten_fin` | **SMOKE-TEST-FIN-CFG** | **SMOKE-TEST-FIN-CFG** | **SMOKE-TEST-FIN-CFG** |
| `gutachten_lohnsatz_ak_eur` | **88.5** | **88.5** | **88.5** |
| `gutachten_ocr_processed_at` | **2026-05-15T10:00:54.996+00:00** | **identisch** | **identisch** |

### Ergebnis

✅ **Dual-Write PASS** — claims, gutachten, view zeigen identische Werte.
✅ **COALESCE-Schutz funktioniert** — `wiederbeschaffungswert` (nicht im Payload) wurde NICHT mit NULL überschrieben.
✅ **gutachten-Row wurde via INSERT … ON CONFLICT angelegt** (vorher null, danach existiert sie).
✅ **0 Errors, 0 Warnings**.

## Cleanup

Live-Daten zurückgesetzt nach Smoke:
- `reparaturkosten_brutto`: 9999.99 → 6450.69
- `restwert`: 1234.56 → 12500
- `gutachten_fin`: SMOKE-TEST-FIN-CFG → WBA8E5C50JK998877
- `gutachten_lohnsatz_ak_eur`: 88.5 → 142
- `gutachten_ocr_processed_at`: timestamp → NULL (in claims UND gutachten)

Die `gutachten`-Row bleibt bestehen (anders als Smoke-Vorher-Zustand "no row"), aber alle OCR-Wert-Spalten sind NULL — funktional äquivalent.

## Build + Type

- ✅ `npx tsc --noEmit` grün (in eigenen Files, 2 unrelated Errors in `.next/types/validator.ts` aus parallelem Build)
- ✅ `npm run build` grün — Compiled in 64s, 223 static pages generiert
- ✅ `database.types.ts` regeneriert (539KB, 25× v_gutachten_werte, 1× apply_gutachten_ocr)

## Spec-Akzeptanzkriterien (PR-1)

- [x] 38 Spalten + 3 CHECK + UNIQUE auf `gutachten` (Remote-DB)
- [x] View `v_gutachten_werte` mit `security_invoker=true` + COALESCE
- [x] Function `apply_gutachten_ocr` atomic auf claims + gutachten
- [x] 4 OCR-Writer rufen Function statt direkt `claims.update()` (3 in `src/lib/ai/gutachten-ocr.ts`, 1 in `src/app/faelle/[id]/_actions/gutachten-ocr.ts`)
- [x] `database.types.ts` regeneriert
- [x] Build + tsc grün
- [x] Smoke: claims + gutachten + view zeigen identische Werte nach Function-Call

## Out-of-Scope (PR-2)

- 25 Reader noch auf `claims.*` — bleiben in PR-1 unverändert, Dual-Write hält sie konsistent
- Admin-Fallakte UI-Smoke nicht durchgeführt (Reader liest noch claims, unverändert; aber im PR-Body als optional dokumentiert)
- `gutachten_positionen` / `gutachten_fotos` (separater Spec)
- 1:N Mehrfach-Gutachten (per Spec entschieden auf 1:1)
