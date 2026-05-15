# Cluster F+G PR-2b — Post-Merge-Audit (15.05.2026)

**Trigger:** Merge von PR #1322 (`refactor(claims): Cluster F+G PR-2b — Drop 41 claims + 4 faelle G-Spalten`) auf staging.
**Verbindlich laut:** `feedback_post_drop_smoke` (Pflicht-Portal-Smoke nach JEDEM DB-Schema-Drop, Screenshots im selben Turn).

---

## 1. DB-Verify

Skript: `node scripts/verify-cluster-fg-pr2b.mjs`.

Erwartete Ausgabe:

| Check | Soll | Ist |
|---|---|---|
| `claims` hat keine der 41 Cluster-F+G-Spalten | 0 | _post-merge füllen_ |
| `faelle` hat keine der 4 G-Spalten | 0 | _post-merge füllen_ |
| `v_gutachten_werte` existiert | true | _post-merge füllen_ |
| `v_gutachten_werte` enthält `COALESCE` | false | _post-merge füllen_ |
| `v_faelle_mit_aktuellem_termin` existiert | true | _post-merge füllen_ |
| `trg_sync_claims_to_faelle` + `trg_sync_faelle_to_claims` existieren | 2 | _post-merge füllen_ |
| `apply_gutachten_ocr` schreibt nicht mehr auf `claims` | true | _post-merge füllen_ |

Migration-Listing nach Merge:

```bash
npx supabase migration list --linked | grep 20260515113536
# Erwartet: Local + Remote beide gesetzt
```

---

## 2. Portal-Smoke

Alle Pfade mit Screenshot im selben Turn dokumentieren.

### 2.1 Public (kein Login)

| Pfad | Erwartung | Screenshot |
|---|---|---|
| `https://staging.claimondo.de/` | Hero + Trust-Strip, kein 500er | _einbetten_ |
| `https://staging.claimondo.de/faq` | FAQ rendert | _einbetten_ |
| `https://staging.claimondo.de/gutachter-finden` | Suche rendert | _einbetten_ |
| `https://staging.claimondo.de/schaden-melden` | Mini-Wizard Step 1 rendert | _einbetten_ |

### 2.2 Kunde (`test-kunde@claimondo.de`)

| Pfad | Erwartung | Screenshot |
|---|---|---|
| `/kunde` | Dashboard rendert, kein RSC-Crash | _einbetten_ |
| `/kunde/faelle/<id>` | Fall-Detail rendert, **OCR-Card mit Werten aus `v_gutachten_werte`** | _einbetten_ |
| `/kunde/faelle/<id>` Ausfallentschädigung-Card | Wert aus `nutzungsausfall_tage * tagessatz` | _einbetten_ |
| `/kunde/onboarding` | Renderbar | _einbetten_ |

### 2.3 SV (`test-sv@claimondo.de`)

| Pfad | Erwartung | Screenshot |
|---|---|---|
| `/gutachter` | Tagesplan zeigt Termine (RLS-Function-Grants laut AAR-921 sind grün) | _einbetten_ |
| `/gutachter/heute` | Isochrone + Termine rendern | _einbetten_ |
| `/gutachter/fall/<id>` | Gutachten-Card mit Werten | _einbetten_ |
| `/gutachter/kalender` | Termine sichtbar | _einbetten_ |

### 2.4 Admin (`test-admin@claimondo.de`)

| Pfad | Erwartung | Screenshot |
|---|---|---|
| `/faelle` | Liste rendert | _einbetten_ |
| `/faelle/<id>` | Fallakte rendert, `GutachtenOcrCard` zeigt Werte | _einbetten_ |
| `/admin/team` | Team-Page rendert | _einbetten_ |
| `/admin/finance` | Finance-Tab eines Falls: `wiederbeschaffungswert`, `restwert`, `reparaturkosten`, `nutzungsausfallGesamt` aus View | _einbetten_ |

### 2.5 Dispatch (`test-dispatch@claimondo.de`)

| Pfad | Erwartung | Screenshot |
|---|---|---|
| `/dispatch` | Karte + Leads rendern | _einbetten_ |
| `/dispatch/leads` | Liste rendert | _einbetten_ |
| `/dispatch/leads/<id>` | Lead-Detail, kein Crash durch fehlende `claims.gutachten_*` | _einbetten_ |

---

## 3. Funktionale Smokes

### 3.1 OCR-Upload-Flow

1. Login als SV (`test-sv@claimondo.de`)
2. Fall öffnen, der bereits ein erstgutachten-`auftraege`-Eintrag hat
3. PDF-Gutachten hochladen (z.B. `docs/PICS/Gutachten Alexander Miljkovic RS IL 88.pdf`)
4. OCR-Pipeline triggert → `apply_gutachten_ocr` schreibt in `gutachten`
5. Verify: View liefert die Werte → Admin-`GutachtenOcrCard` zeigt sie

```sql
-- Manuell verifizierbar:
SELECT claim_id, reparaturkosten_brutto, restwert, totalschaden, nutzungsausfall_tage
FROM v_gutachten_werte WHERE claim_id = '<TEST-CLAIM-ID>';
```

### 3.2 Edge-Case: Fall ohne `sv_id`

`apply_gutachten_ocr` mit p_claim_id für einen Fall ohne `sv_id` → early-return (kein Row, kein Crash). Smoke per direktem RPC-Call:

```sql
SELECT public.apply_gutachten_ocr(
  '<fall-ohne-sv-claim-id>'::uuid,
  '{"reparaturkosten_brutto": 1000}'::jsonb
);
-- Erwartet: void, kein Error
SELECT count(*) FROM gutachten WHERE claim_id = '<fall-ohne-sv-claim-id>';
-- Erwartet: 0
```

### 3.3 Sync-Trigger-Regression

`UPDATE faelle SET kunden_konstellation = ...` muss noch immer Sync auf claims triggern. Verify durch lokales Update + claims-Select.

```sql
-- Vorher:
SELECT id, kunden_konstellation FROM claims WHERE id = '<test-claim>';
-- Update auf faelle:
UPDATE faelle SET kunden_konstellation = 'kk-test' WHERE claim_id = '<test-claim>';
-- Verify Sync:
SELECT kunden_konstellation FROM claims WHERE id = '<test-claim>'; -- = 'kk-test'
```

---

## 4. Findings + Folgeaktionen

_post-merge füllen — pro Befund: Pfad, Beobachtung, Schweregrad (Crash / Optisch / Edge-Case), Fix-Ticket._

| # | Befund | Schwere | Aktion |
|---|---|---|---|
| 1 | _tbd_ | _tbd_ | _tbd_ |

---

## 5. Sign-Off

- [ ] DB-Verify (Abschnitt 1) grün
- [ ] Alle 4 Portal-Bereiche durchklickbar, keine 500er
- [ ] OCR-Upload + View-Read durchgängig
- [ ] Edge-Case `sv_id is NULL` toleriert
- [ ] Sync-Trigger noch immer funktional

Status: **_offen — wartet auf #1322 merge_**

🤖 Vorbereitet von Claude Opus 4.7 (Skeleton vor Merge), Findings nach Merge eingetragen.
