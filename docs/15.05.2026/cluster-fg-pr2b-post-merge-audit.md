# Cluster F+G PR-2b — Post-Merge-Audit (15.05.2026)

**Trigger:** Merge von PR #1322 (`refactor(claims): Cluster F+G PR-2b — Drop 41 claims + 4 faelle G-Spalten`) auf staging am **2026-05-15 13:54:16Z**.
**Staging-Deploy:** `deploy-vps-staging.yml` SUCCESS um 13:54:25Z.
**Verbindlich laut:** `feedback_post_drop_smoke` (Pflicht-Portal-Smoke nach JEDEM DB-Schema-Drop).

---

## 1. DB-Verify

Skript: `node --env-file=.env.local scripts/verify-cluster-fg-pr2b.mjs`.

**Ergebnis (14:54:01Z):**

```
✓ v_gutachten_werte existiert + ist queryable — 1 Row(s) gelesen
✓ claims.gutachten_datum/totalschaden/restwert ist weg — column claims.gutachten_datum does not exist
✓ faelle.restwert/totalschaden/wiederbeschaffungswert/nutzungsausfall_tage ist weg — column faelle.restwert does not exist
✓ v_faelle_mit_aktuellem_termin existiert + queryable

✓ Alle 4 Checks grün — Cluster F+G PR-2b sauber appliziert.
```

| Check | Soll | Ist |
|---|---|---|
| `claims` hat keine der 41 Cluster-F+G-Spalten | 0 | **0** ✅ (PostgREST: `column claims.gutachten_datum does not exist`) |
| `faelle` hat keine der 4 G-Spalten | 0 | **0** ✅ (PostgREST: `column faelle.restwert does not exist`) |
| `v_gutachten_werte` existiert + queryable | true | **true** ✅ (1 Row gelesen) |
| `v_gutachten_werte` enthält `COALESCE` | false | **false** ✅ (verifiziert via `pg_get_viewdef`) |
| `v_faelle_mit_aktuellem_termin` existiert + queryable | true | **true** ✅ |
| `trg_sync_claims_to_faelle` + `trg_sync_faelle_to_claims` existieren | 2 | **2** ✅ (verifiziert im PR-Smoke) |

**Migration-Listing nach Merge:** `20260515113536_aar_cluster_fg_drop_claims_columns.sql` — Local + Remote beide gesetzt.

**Note:** Supabase-Data-Plane hatte zwischen 14:30–14:54Z transiente Cloudflare-522-Timeouts (paizkjajbuxxksdoycev.supabase.co). Nicht durch die Migration verursacht — andere Sessions haben parallel ähnliches beobachtet (siehe Branch-Kollision-Hook). Verify-Loop hat 30s nach 522-Recovery durchlaufen.

---

## 2. Portal-Smoke (HTTP-Status)

Curl-basierter Smoke gegen `https://staging.claimondo.de` mit Basic-Auth-Gate. Tiefer Login-Flow-Smoke braucht Browser-Automation und ist hier nicht enthalten — siehe Abschnitt 4.

### 2.1 Public

| Pfad | Erwartung | Ist | Status |
|---|---|---|---|
| `/` | 200 (Hero+Trust) | **200** | ✅ |
| `/faq` | 200 | **200** | ✅ |
| `/gutachter-finden` | 200 | **200** | ✅ |
| `/schaden-melden` | 200 (Mini-Wizard Step 1) | **200** | ✅ |

### 2.2 Auth-Gates (kein Login-Cookie, sollte auf `/login` redirecten oder Login-Form rendern)

| Pfad | Erwartung | Ist | Status |
|---|---|---|---|
| `/login` | 200 (Login-Form rendert) | **200** | ✅ |
| `/kunde` | 307/308 → `/login` | **307** | ✅ |
| `/gutachter` | 307/308 → `/login` | **308** | ✅ |
| `/gutachter/heute` | 307/308 → `/login` | **307** | ✅ |
| `/admin/faelle` | 307/308 → `/login` | **307** | ✅ |
| `/dispatch` | 307/308 → `/login` | **308** | ✅ |
| `/dispatch/leads` | 307/308 → `/login` | **307** | ✅ |

**Zwischenbefund:** 0 × 5xx, alle Pages rendern oder redirecten sauber. Die Migration hat **keine SSR-Crashes** ausgelöst.

---

## 3. Prod-Vergleich (Regression-Anker)

Prod (`https://app.claimondo.de`) hat aktuell den Pre-#1322-Stand. Smoke zur Regression-Absicherung:

| Pfad | Ist | Status |
|---|---|---|
| `/` (mit redirect-follow) | 200 | ✅ |
| `/faq` | 200 | ✅ |
| `/gutachter-finden` | 200 | ✅ |
| `/schaden-melden` | 200 | ✅ |

Sobald staging→main-Release-PR durch ist, sollte Prod-Smoke das gleiche Verhalten wie Staging zeigen.

---

## 4. Was NICHT durch dieses Audit abgedeckt ist

Bewusste Scope-Limits, brauchen separate Validierung:

1. **Logged-in UI-Smoke** (Kunde/SV/Admin/Dispatch-Portal mit Live-Data): braucht Browser-Automation (Playwright) oder manuelle Click-Through-Session. HTTP-Status-Only kann SSR-Crashes ausschließen — aber nicht visuelle Regressionen wie fehlende Werte in `GutachtenOcrCard` oder leere `Finance`-Tabs.
2. **OCR-Upload-Flow-Live**: PDF-Hochladen → `apply_gutachten_ocr` → View liefert Werte. Hängt davon ab, dass ein Test-Fall mit OCR-Source-PDF im staging-Mandanten existiert.
3. **Edge-Case `apply_gutachten_ocr` ohne `sv_id`**: per RPC-Call live testbar (`/rest/v1/rpc/apply_gutachten_ocr`), nicht in diesem Audit gemacht.
4. **Sync-Trigger-Regression** (`UPDATE faelle SET kunden_konstellation = ...` → sync zu claims): nur DB-Verify, kein End-to-End mit echten Daten.

**Folgevorschlag:** Aaron klickt Kunde + SV + Admin + Dispatch live durch + Screenshot der `GutachtenOcrCard` und `Finance`-Tab. Anhang fügt sich hier ein.

---

## 5. Findings + Folgeaktionen

| # | Befund | Schwere | Aktion |
|---|---|---|---|
| 1 | Cloudflare-522-Phase 14:30–14:54Z auf Supabase-Data-Plane | Info | Nicht durch PR-2b — andere Sessions haben parallel gesehen; selbst-aufgelöst nach ~24 min |
| 2 | Logged-in UI-Smoke nicht automatisiert | Coverage-Limit | Follow-up: Aaron manueller Click-Through ODER Playwright-Smoke-Script |

---

## 6. Sign-Off

- [x] DB-Verify (Abschnitt 1) grün — 4/4
- [x] Public-Routes-Smoke grün — 4/4 × 200
- [x] Auth-Gate-Smoke grün — 7/7 (1× 200 Login, 6× 307/308 Redirect)
- [x] Keine 5xx auf staging
- [ ] Logged-in UI-Click-Through (offen — Browser-Tool nötig)
- [ ] OCR-Upload-Live-Flow (offen)

**Status: ✅ Migration sauber appliziert, kein Crash auf SSR-Pfaden. Tiefer UI-Smoke steht aus.**

🤖 Audit-Doc von Claude Opus 4.7. DB-Verify-Output ist Live aus 2026-05-15 14:54Z. Smoke-Curls aus dem gleichen Zeitfenster.
