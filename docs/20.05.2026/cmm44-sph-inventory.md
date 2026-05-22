# CMM-44 SP-H PR2 — Call-Site-Inventur

**Erstellt:** 2026-05-22  
**Branch:** `kitta/cmm-44-sph-pr2-sweep`  
**Grep-Script:** `scripts/cmm44-sph-grep.mjs` (paren-balanced, sub-embed-stripped)

---

## Hintergrund

SP-H bewegt 18 Auftrag-Lifecycle-Spalten von `faelle` auf die `auftraege` Sub-Tabelle
(1:N pro Claim, "aktueller Auftrag" = `ORDER BY reihenfolge DESC LIMIT 1`).
PR1 (#1535, bereits auf staging) hat die 18 Spalten additiv auf `auftraege` hinzugefuegt
und 3 Views repointed.

PR2 (diese Inventur) ist der Code-seitige Reader/Writer-Sweep: jede Stelle die
eine der 18 Spalten ueber `faelle` liest oder schreibt, muss auf `auftraege` umgestellt werden.

---

## Die 18 SP-H-Spalten

```
filmcheck_ok, filmcheck_am, filmcheck_notizen,
storniert_am, storno_grund, storno_durch_user_id,
besichtigung_gestartet_am,
sv_briefing_text, sv_briefing_generated_at, sv_briefing_model,
sv_briefing_version, sv_briefing_struktur, sv_notizen_vor_ort,
technische_stellungnahme_status, technische_stellungnahme_notiz_sv,
technische_stellungnahme_beauftragt_am, technische_stellungnahme_hochgeladen_am,
technische_stellungnahme_freigabe_am
```

---

## Transform-Pattern-Katalog

| Pattern | Beschreibung |
|---------|-------------|
| **A** | Direct `from('faelle')` mit NUR SP-H-Spalten (+ id/claim_id) — Umstellen auf `from('auftraege')...order('reihenfolge',{ascending:false}).limit(1).maybeSingle()` |
| **B** | Direct `from('faelle')` GEMISCHT SP-H + Nicht-SP-H — SP-H-Cols in nested embed `claims:claim_id(auftraege(<SP-H>))` mit Array-Normalisierung; Rest bleibt |
| **C** | Write: `from('faelle').update/insert({...SP-H-col...})` — SP-H-Werte aus faelle-Write entfernen, separat auf aktuellen Auftrag schreiben (`from('auftraege').update(...)` nach Auftrag-ID-Lookup); kein Dual-Write |
| **D** | Nested embed `faelle(SP-H-col)` in einem anderen Table-Select — umstellen auf doppelt-genestetes `claims:claim_id(auftraege(<col>))` |
| **E** | View-Read: liest von einem `v_*`-View den PR1 bereits repointed hat — kein Code-Change noetig |
| **F** | Nur TS-Typ / JSX / Property-Access ohne DB-Query — kein Query-Change |
| **FP** | False Positive: `from('faelle')` im Grep-Fenster, aber SP-H-Col gehoert zu einer anderen Tabelle oder zu einem anderen Query-Block |

---

## 1 — Per-Spalten-Hit-Uebersicht

| Spalte | Grep-Hits | In-Scope (ohne FP) |
|--------|-----------|-------------------|
| filmcheck_ok | 4 | 2 (1 FP je KpiCards:64 + filmcheck.ts:32) |
| filmcheck_am | 1 (via briefing.ts write) | 1 |
| filmcheck_notizen | 2 (filmcheck.ts write + fallakte read) | 2 |
| storniert_am | 7 | 5 (2 FP: abrechnungen/actions:328, cron:91) |
| storno_grund | 3 | 2 (1 FP: dispatch-fall-actions:165) |
| storno_durch_user_id | 1 | 1 |
| besichtigung_gestartet_am | 1 | 1 |
| sv_briefing_text | 4 | 4 |
| sv_briefing_generated_at | 1 (write) | 1 |
| sv_briefing_model | 1 (write) | 1 |
| sv_briefing_version | 1 (write) | 1 |
| sv_briefing_struktur | 2 | 2 |
| sv_notizen_vor_ort | 3 | 3 |
| technische_stellungnahme_status | 8 | 8 |
| technische_stellungnahme_notiz_sv | 1 | 1 |
| technische_stellungnahme_beauftragt_am | 1 (write) | 1 |
| technische_stellungnahme_hochgeladen_am | 1 (write) | 1 |
| technische_stellungnahme_freigabe_am | 1 (write) | 1 |

*Hinweis: briefing.ts und briefing-structured.ts schreiben jeweils mehrere SP-H-Spalten in einem einzigen Write — diese sind als ein Write-Site zaehlt, treffen aber mehrere Spalten gleichzeitig.*

---

## 2 — Per-Site-Klassifikation (vollstaendig)

### FALSE POSITIVES (kein Code-Change)

| Grep-Zeile | Spalte | Pattern | Bemerkung |
|-----------|--------|---------|-----------|
| `src/app/admin/abrechnungen/actions.ts:328` | storniert_am | **FP** | `from('faelle').select('id')` fuer Timeline-Insert; `storniert_am` im Fenster kommt aus `from('abrechnungen')` 1 Zeile vorher (Zeile 277). Kein SP-H-Zugriff auf faelle. |
| `src/app/api/cron/release-makler-provisionen/route.ts:91` | storniert_am | **FP** | `from('faelle').select('id, status, claims:claim_id(claim_nummer)')` — kein SP-H im Select; `storniert_am` im Fenster (Zeile 114) gehoert zu `from('makler_provisionen').update({storniert_am: now})`. |
| `src/app/admin/_components/KpiCards.tsx:64` | filmcheck_ok | **FP** | `from('faelle').select('id', {count:'exact', head:true}).not('status', ...)` — kein SP-H; `filmcheck_ok` im Fenster kommt aus dem naechsten `from('faelle')`-Block (Zeile 78-81). |
| `src/app/faelle/[id]/_actions/filmcheck.ts:32` | filmcheck_ok | **FP** | `from('faelle').select('mandatsnummer')...` — kein SP-H im Select; `filmcheck_ok` im Fenster kommt aus dem Update-Block bei Zeile 49 (anderer `from('faelle')`-Aufruf). |
| `src/lib/actions/dispatch-fall-actions.ts:165` | storno_grund | **FP** | `from('faelle').select('claims:claim_id(kundenbetreuer_id)')` — kein SP-H; `storno_grund` im Fenster ist Property-Access `fallInfo.storno_grund` auf Daten der naechsten Query (Zeile 174). |
| `src/app/gutachter/feldmodus/_fallakte/actions.ts:239` | sv_notizen_vor_ort | **FP (Teilweise)** | `from('faelle').select('sv_id')` — kein SP-H im Select. `sv_notizen_vor_ort` im Fenster kommt aus dem Update bei Zeile 250 (separater `from('faelle')`-Aufruf). Echter Hit ist Zeile 249. |

**Total FPs: 5 (+ 1 Quasi-FP)** — das echte In-Scope-Volumen betraegt 33 Zeilen-Treffer fuer 28 echte Sites.

---

### IN-SCOPE SITES

| # | Datei:Zeile | Spalte(n) im Scope | Pattern | Transform-Hinweis |
|---|------------|-------------------|---------|-------------------|
| 1 | `src/app/admin/_components/KpiCards.tsx:78` | filmcheck_ok | **A** | `from('faelle').select('id', {count, head}).or('filmcheck_ok.is.null,filmcheck_ok.eq.false')` — `filmcheck_ok` als Filter-Praedikat (kein Select). Switch: subquery gegen auftraege (z.B. IN-Subquery `claim_id IN (SELECT claim_id FROM auftraege WHERE filmcheck_ok IS NULL OR filmcheck_ok = false)`). Alternativ: View falls `v_faelle_mit_aktuellem_termin` `filmcheck_ok` bereits exponiert. |
| 2 | `src/app/faelle/[id]/_actions/briefing.ts:80` | sv_briefing_struktur | **B** | `from('faelle').select('updated_at, sv_briefing_struktur')` — gemischt. `updated_at` bleibt auf faelle; `sv_briefing_struktur` muss aus auftraege kommen (`claims:claim_id(auftraege(sv_briefing_struktur))`). |
| 3 | `src/app/faelle/[id]/_actions/dokumente.ts:105` | technische_stellungnahme_status | **B** | `from('faelle').select('id, lead_id, vorschaden_erkannt, technische_stellungnahme_status, claims:claim_id(zeugen_vorhanden)')` — mischt SP-H mit Nicht-SP-H. SP-H-Col in auftraege-sub-embed. |
| 4 | `src/app/faelle/[id]/_actions/filmcheck.ts:47` | filmcheck_ok, filmcheck_am, filmcheck_notizen | **C** | `from('faelle').update({filmcheck_ok:true, filmcheck_am:..., filmcheck_notizen:..., mandatsnummer:...})` — SP-H-Werte (filmcheck_ok/am/notizen) vom faelle-Update trennen und auf aktuellen Auftrag schreiben; `mandatsnummer` bleibt auf faelle. |
| 5 | `src/app/faelle/[id]/_actions/prozess.ts:41` | technische_stellungnahme_status, technische_stellungnahme_beauftragt_am | **C** | `from('faelle').update({technische_stellungnahme_status:'beauftragt', technische_stellungnahme_beauftragt_am:now})` — rein SP-H; Write umstellen auf auftraege. |
| 6 | `src/app/faelle/[id]/_actions/prozess.ts:72` | technische_stellungnahme_status, technische_stellungnahme_freigabe_am | **C** | `from('faelle').update({technische_stellungnahme_status:'freigegeben', technische_stellungnahme_freigabe_am:now})` — rein SP-H; Write umstellen auf auftraege. |
| 7 | `src/app/gutachter/abrechnung/page.tsx:80` | (kein SP-H im Select, aber faelle-Query triggert hit) | **E / B** | `from('faelle').select('id, status, created_at, lead_id, claims:claim_id(claim_nummer, gutachten(...)))` — kein SP-H im Select dieser Query. Das naechste Query (Zeile 96) ist der echte Hit. |
| 8 | `src/app/gutachter/abrechnung/page.tsx:96` | technische_stellungnahme_status, technische_stellungnahme_beauftragt_am, technische_stellungnahme_hochgeladen_am, technische_stellungnahme_freigabe_am | **B** | `from('faelle').select('id, technische_stellungnahme_status, technische_stellungnahme_beauftragt_am, technische_stellungnahme_hochgeladen_am, technische_stellungnahme_freigabe_am, vs_kuerzungs_typ, claims:claim_id(claim_nummer)')` — mischt 4 SP-H-Cols mit `vs_kuerzungs_typ`. Alle 4 SP-H in auftraege-embed. Hinweis: Filter `.not('technische_stellungnahme_status', 'is', null)` muss ebenfalls auf auftraege-Seite. |
| 9 | `src/app/gutachter/auftraege/export-action.ts:133` | sv_briefing_text | **B** | `from('faelle').select('id, lead_id, kennzeichen, fin_vin, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, lackfarbe_code, sv_briefing_text, claim_id, claims:claim_id(schadentag, claim_nummer, schadens_ursache)')` — `sv_briefing_text` in auftraege-embed. |
| 10 | `src/app/gutachter/fall/[id]/stellungnahme/actions.ts:43` | technische_stellungnahme_status | **B** | `from('faelle').select('id, sv_id, technische_stellungnahme_status, claims:claim_id(claim_nummer)')` — `technische_stellungnahme_status` in auftraege-embed. |
| 11 | `src/app/gutachter/fall/[id]/stellungnahme/actions.ts:87` | technische_stellungnahme_notiz_sv | **C** | `from('faelle').update({technische_stellungnahme_notiz_sv: notiz})` — rein SP-H; Write umstellen auf auftraege. |
| 12 | `src/app/gutachter/fall/[id]/stellungnahme/page.tsx:24` | technische_stellungnahme_status, technische_stellungnahme_beauftragt_am | **B** | `from('faelle').select('id, technische_stellungnahme_status, technische_stellungnahme_beauftragt_am, vs_kuerzung_grund, kuerzungs_betrag, claims:claim_id(claim_nummer)')` — 2 SP-H in auftraege-embed. |
| 13 | `src/app/gutachter/feldmodus/actions.ts:118` | besichtigung_gestartet_am | **C** | `from('faelle').update({besichtigung_gestartet_am: nowIso, updated_at: nowIso})` — dual-write (Zeile 112-114 schreibt bereits auf gutachter_termine). Den faelle-Write ersatzlos entfernen; gutachter_termine ist bereits SSoT. |
| 14 | `src/app/gutachter/feldmodus/page.tsx:144` | sv_briefing_text, sv_briefing_struktur | **B** | `from('faelle').select('id, claim_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, sv_briefing_text, sv_briefing_struktur, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, claims:claim_id(...)`)` — 2 SP-H in auftraege-embed. |
| 15 | `src/app/gutachter/feldmodus/_fallakte/actions.ts:86` | filmcheck_notizen, sv_notizen_vor_ort, sv_briefing_text | **B** | `from('faelle').select('id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, filmcheck_notizen, sv_notizen_vor_ort, lead_id, sv_briefing_text, sv_id, claim_id, claims:claim_id(...)')` — 3 SP-H in auftraege-embed. |
| 16 | `src/app/gutachter/feldmodus/_fallakte/actions.ts:249` | sv_notizen_vor_ort | **C** | `from('faelle').update({sv_notizen_vor_ort: notizen.trim() || null})` — rein SP-H; Write umstellen auf auftraege. |
| 17 | `src/app/gutachter/heute/page.tsx:159` | sv_briefing_text | **B** | `from('faelle').select('id, claim_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, sv_briefing_text, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, claims:claim_id(...)')` — `sv_briefing_text` in auftraege-embed. |
| 18 | `src/app/kunde/onboarding/actions.ts:209` | technische_stellungnahme_status | **B** | `from('faelle').select('id, kunde_id, lead_id, technische_stellungnahme_status, claim_id, claims:claim_id(zeugen_vorhanden)')` — `technische_stellungnahme_status` in auftraege-embed. |
| 19 | `src/app/kunde/re-termin/[token]/actions.ts:44` | storniert_am | **B** | `from('faelle').select('id, sv_id, lead_id, claim_id, storniert_am').eq('re_termin_token', token)` — `storniert_am` als Read (JS-Guard `if (fall.storniert_am) return error`). Embed auf auftraege; Array-normalisieren; `Array.isArray(aArr) ? aArr[0] : aArr` Pattern. |
| 20 | `src/app/kunde/re-termin/[token]/page.tsx:30` | storniert_am | **B** | `from('faelle').select('id, sv_id, lead_id, storniert_am, kennzeichen, claim_id, claims:claim_id(schadenort_ort, claim_nummer)')` — `storniert_am` als Read-Guard. Gleiche Behandlung wie Site 19. |
| 21 | `src/lib/abrechnung/reissue-abrechnung.ts:28` | storniert_am | **B (Filter-Praedikat)** | `from('faelle').select(...).is('storniert_am', null)` — `storniert_am` wird als WHERE-Filterbedingung verwendet (kein Select-Col). Nach Migration: `.filter('claim_id', 'in', subquery-auftraege-ohne-storniert)` oder JOIN via `auftraege!inner(...).is('storniert_am', null)`. **Open Question** — siehe Abschnitt unten. |
| 22 | `src/lib/abrechnung/revert-case-billing.ts:48` | storniert_am, storno_grund, storno_durch_user_id | **C** | `from('faelle').update({lead_preis_netto:0, ..., storniert_am:..., storno_grund:..., storno_durch_user_id:...})` — 3 SP-H gemischt mit Nicht-SP-H (lead_preis_netto etc.). SP-H-Werte trennen und separat auf auftraege schreiben. |
| 23 | `src/lib/actions/dispatch-fall-actions.ts:173` | storno_grund | **B** | `from('faelle').select('id, sv_id, status, storno_grund, claims:claim_id(claim_nummer)')` — `storno_grund` in auftraege-embed. |
| 24 | `src/lib/actions/stellungnahme-upload.ts:29` | technische_stellungnahme_status | **B** | `from('faelle').select('id, technische_stellungnahme_status, sv_id, claims:claim_id(claim_nummer, kundenbetreuer_id)')` — `technische_stellungnahme_status` in auftraege-embed. |
| 25 | `src/lib/actions/stellungnahme-upload.ts:73` | technische_stellungnahme_status, technische_stellungnahme_hochgeladen_am | **C** | `from('faelle').update({technische_stellungnahme_status:'hochgeladen', technische_stellungnahme_hochgeladen_am:...})` — rein SP-H; Write umstellen auf auftraege. |
| 26 | `src/lib/actions/storno-actions.ts:42` | storno_durch_user_id | **C** | `from('faelle').update({storno_durch_user_id: user.id})` — rein SP-H; Write umstellen auf auftraege. |
| 27 | `src/lib/ai/briefing-structured.ts:138` | sv_briefing_struktur | **C** | `from('faelle').update({sv_briefing_struktur:{...}, updated_at:...})` — nur `sv_briefing_struktur` ist SP-H; `updated_at` bleibt auf faelle. SP-H-Teil trennen und auf auftraege schreiben; faelle-Update nur noch mit `updated_at`. |
| 28 | `src/lib/ai/briefing.ts:139` | sv_briefing_text, sv_briefing_generated_at, sv_briefing_model, sv_briefing_version | **C** | `from('faelle').update({sv_briefing_text:..., sv_briefing_generated_at:..., sv_briefing_model:..., sv_briefing_version:..., updated_at:...})` — 4 SP-H + `updated_at`. Trennen: SP-H auf auftraege, `updated_at` bleibt auf faelle. Hinweis: `sv_briefing_version` benoetigt Read-Before-Write auf auftraege (nicht faelle) fuer `prevVersion`. |
| 29 | `src/lib/claims/get-kunde-faelle.ts:411` | storno_grund | **B** | `from('faelle').select('id, claim_id, status, ..., storno_grund, gegner_versicherung, ...')` — `storno_grund` in auftraege-embed. |
| 30 | `src/lib/faelle/state-machine.ts:59` | storniert_am, storno_grund | **C** | `from('faelle').update(faelleUpdate)` via `splitOrKeepFaelleUpdate` — `storniert_am`/`storno_grund` stehen nicht in `CLAIM_OWNED_DUPLICATE_COLUMNS` und landen daher in `faelleUpdate`. Nach Migration: `storniert_am` und `storno_grund` zur SP-H-Routing-Liste hinzufuegen (analog zu anderen SplitOrKeep-Migrationen) ODER separat auf auftraege schreiben nach dem splitOrKeep. |
| 31 | `src/lib/lexdrive/process-event.ts:692` | storniert_am, storno_grund | **C (komplex)** | `from('faelle').select('claim_id')` triggert den Grep; der eigentliche Write (Zeilen 717-718: `overrideUpdate.storniert_am`, `overrideUpdate.storno_grund`) landet via `splitOrKeepFaelleUpdate(overrideUpdate, ...)` auf faelle. Gleiche Loesung wie Site 30: SP-H-Cols aus faelleUpdate extrahieren und auf auftraege schreiben. Zusaetzlich: `computeFieldUpdates` (Zeilen 215-216, 249-251, 291-292) setzt `technische_stellungnahme_status`, `technische_stellungnahme_beauftragt_am`, `filmcheck_ok`, `filmcheck_am`, `technische_stellungnahme_hochgeladen_am` — diese landen via `splitOrKeepFaelleUpdate` ebenfalls auf faelle. **Grep-Gap** — siehe Abschnitt unten. |
| 32 | `src/lib/sla/blocker-detection.ts:36` | technische_stellungnahme_status | **B** | `from('faelle').select('id, claim_id, technische_stellungnahme_status, anschlussschreiben_am, ruege_gesendet_am, kuerzungs_betrag, claims:claim_id(sa_unterschrieben, vollmacht_signiert_am)')` — `technische_stellungnahme_status` in auftraege-embed. |

*Site 7 (`abrechnung/page.tsx:80`) wird naher analysiert — der erste Hit ist kein SP-H-Read, aber Site 8 (Zeile 96) ist es. In der obigen Tabelle als "E / B" markiert und Site 8 als echter Hit.*

---

## 3 — Pattern-Zusammenfassung (In-Scope)

| Pattern | Anzahl Sites | Dateien |
|---------|-------------|---------|
| **A** (SP-H-Only Read / Filter) | 1 | KpiCards.tsx |
| **B** (Mixed Read) | 15 | dokumente.ts, abrechnung/page.tsx (x2), auftraege/export-action.ts, stellungnahme/actions.ts, stellungnahme/page.tsx, feldmodus/page.tsx, _fallakte/actions.ts, heute/page.tsx, onboarding/actions.ts, re-termin/actions.ts, re-termin/page.tsx, reissue-abrechnung.ts, dispatch-fall-actions.ts, stellungnahme-upload.ts, get-kunde-faelle.ts, blocker-detection.ts |
| **C** (Write) | 12 | filmcheck.ts, prozess.ts (x2), stellungnahme/actions.ts, feldmodus/actions.ts, _fallakte/actions.ts (x2 — aber eine ist FP), stellungnahme-upload.ts, storno-actions.ts, briefing-structured.ts, briefing.ts, revert-case-billing.ts, state-machine.ts, process-event.ts |
| **D** (Nested Embed) | 0 | — |
| **E** (View-Read, kein Change) | 0 | — (briefing.ts und storno-actions.ts lesen via `v_faelle_mit_aktuellem_termin`, aber keine faelle-Select) |
| **F** (Type/JSX Only) | — | StellungnahmeCard.tsx, AktuellerStopCard.tsx, FeldmodusClient.tsx — ausserhalb Grep-Scope |
| **FP** (False Positive) | 5+1 | abrechnungen/actions.ts, cron/release-makler-provisionen, KpiCards.tsx, filmcheck.ts, dispatch-fall-actions.ts, _fallakte/actions.ts |

**Gesamt In-Scope Sites: 28** (Pattern A:1 + B:15 + C:12)

---

## 4 — Out-of-Scope

### Test/Seed-Dateien

Keine der 39 Grep-Treffer-Dateien liegt unter einem Test- oder Seed-Pfad (kein `test/`, kein `seed/`, kein `create-test-fall`-Pattern). Das Projekt hat eigene Test-User-Fixtures (E2E), aber diese liegen nicht in `src/` und referenzieren keine der 18 SP-H-Spalten direkt.

### Kein Sweep-Bedarf

| Datei | Grund |
|-------|-------|
| `src/app/gutachter/feldmodus/AktuellerStopCard.tsx` | Liest `besichtigung_gestartet_am` von `gutachter_termine` per Realtime (SSoT), nicht von `faelle` |
| `src/app/gutachter/feldmodus/FeldmodusClient.tsx` | Realtime-Subscription auf `gutachter_termine`, kein faelle-Query |
| `src/app/gutachter/fall/[id]/_components/StellungnahmeCard.tsx` | Nur TS-Interface-Felder (Pattern F), kein DB-Query |
| `src/lib/faelle/claim-duplicate-columns.ts` | Definiert `CLAIM_OWNED_DUPLICATE_COLUMNS` — SP-H-Cols muessen hier nach dem Sweep HINZUGEFUEGT werden (fuer state-machine + process-event), aber das File selbst ist kein "Call-Site" |
| `src/app/gutachter/feldmodus/actions.ts:94` | Liest `besichtigung_gestartet_am` von `gutachter_termine`, nicht von `faelle` |
| `src/app/gutachter/feldmodus/actions.ts:209` | Schreibt `besichtigung_gestartet_am` auf `gutachter_termine` (exitArrivedToRoute) — kein faelle-Write, kein Change |

---

## 5 — Grep-Gaps (Stellen die der Grep NICHT erfasst hat)

### Gap 1: `process-event.ts` — `computeFieldUpdates` SP-H-Writes via `splitOrKeepFaelleUpdate`

Die Funktion `computeFieldUpdates` (ca. Zeile 190-302) baut ein `updates`-Dictionary und setzt bei bestimmten Events:

- `technische_stellungnahme_status = 'beauftragt'` (Event `technische_stellungnahme_benoetigt`, Zeile 215)
- `technische_stellungnahme_beauftragt_am` (Zeile 216)
- `filmcheck_ok = true` (Event `kb_filmcheck_bestanden`, Zeile 249)
- `filmcheck_am` (Zeile 250)
- `technische_stellungnahme_status = 'hochgeladen'` (Event `sv_stellungnahme_eingereicht`, Zeile 291)
- `technische_stellungnahme_hochgeladen_am` (Zeile 292)

Diese landen via `splitOrKeepFaelleUpdate(updates, claimId)` → `fuFaelle` → `from('faelle').update(fuFaelle)` (Zeile 785).
Der Grep fand diese Writes nicht, weil die SP-H-Spaltennamen nur im `computeFieldUpdates`-Body (Zeile 200ff.) erscheinen, nicht unmittelbar neben dem `from('faelle')` bei Zeile 785.

**Sweep-Pflicht:** Der Implementierer muss in `process-event.ts` die SP-H-Cols aus dem `fuFaelle`-Update herausziehen und stattdessen auf den aktuellen Auftrag schreiben (analog zu Site 31, `overrideUpdate.storniert_am`).

### Gap 2: `state-machine.ts` — `storniert_am`/`storno_grund` via `splitOrKeepFaelleUpdate`

Gleiche Struktur: `CLAIM_OWNED_DUPLICATE_COLUMNS` enthaelt `storniert_am` und `storno_grund` nicht → beide landen in `faelleUpdate`. Der Grep hat Zeile 59 (`from('faelle').select(...)`) erfasst, aber der eigentliche Write-Path (Zeile 143-145) ist technisch kein neuer Grep-Treffer.

**Sweep-Pflicht:** Entweder die Cols in `CLAIM_OWNED_DUPLICATE_COLUMNS` aufnehmen (was den bestehenden Router-Mechanismus nutzt, aber Claims-seitig keine SP-H-Tabelle adressieren wuerde — also NICHT das richtige Instrument), oder im Storno-Branch die SP-H-Cols separat via auftraege-Write setzen.

---

## 6 — Open Questions fuer den Sweep-Implementierer

### OQ-1: `reissue-abrechnung.ts` — `storniert_am` als Filter-Praedikat

Zeile 31: `.is('storniert_am', null)` filtert `faelle`-Rows nach "nicht storniert". Nach der Migration existiert `storniert_am` nicht mehr auf `faelle`. Moegliche Loesungen:

a) **Subquery / Inner-Join:** Supabase unterstuetzt `auftraege!inner(storniert_am.is.null)` als eingebetteten Filter — pruefen, ob das mit dem `.eq('abrechnung_id', ...)` Filter kombinierbar ist.
b) **View:** Falls `v_faelle_mit_aktuellem_termin` `storniert_am` nach dem Sweep aus auftraege exponiert, stattdessen die View abfragen.
c) **Zweistufig:** Erst alle Faelle laden, dann IDs der nicht-stornost Auftraege per separatem Query ermitteln, dann filtern.

Empfehlung: Option b) falls View-Abfrage machbar; sonst Option a).

### OQ-2: `briefing.ts` — `sv_briefing_version` Read-Before-Write

Zeile 66-73 liest `sv_briefing_version` aus `v_faelle_mit_aktuellem_termin` (View), um `prevVersion` zu ermitteln. Post-Sweep muss dieser Wert aus dem auftraege-Record kommen. Falls `v_faelle_mit_aktuellem_termin` `sv_briefing_version` via LATERAL auf auftraege exponiert (PR1 hat 3 Views repointed — pruefen ob diese dazu gehoert), ist kein Code-Change am Read noetig. Wenn nicht: eigenen `from('auftraege')` Read hinzufuegen.

### OQ-3: `KpiCards.tsx` — `filmcheck_ok` als Count-Filter

Pattern A mit Filter-Praedikat (kein Row-Data-Select). Supabase `.or('filmcheck_ok.is.null,filmcheck_ok.eq.false')` funktioniert nicht direkt auf `faelle` wenn `filmcheck_ok` auf auftraege lebt. Loesungsoptionen:
a) Subquery via `auftraege!inner(...)` sofern Supabase embedded-filter dies erlaubt auf Count-Queries.
b) RPC oder SQL-View.
c) Falls sehr selten genutzt: zweistufige Query (Overhead minimal fuer Count-KPI).

### OQ-4: `state-machine.ts` + `process-event.ts` — Storno ohne gueltigem Auftrag

Bei einem stornierten Fall kann es sein, dass noch kein Auftrag existiert (Fall wurde vor dem ersten Auftrag storniert). Der Sweep-Implementierer muss entscheiden: falls kein Auftrag vorhanden → `console.warn` + Skip (kein Storno-Timestamp auf auftraege) oder → Auftrag-Anlage als Teil des Storno-Flows. Empfehlung: `console.warn` + Skip analog zu SP-G-Pattern ("Pattern-B-Writer mit nullable-sv_id-Guard" aus MEMORY).

---

## 7 — Chunking-Entscheidung

**Ein einzelner PR2 ist ausreichend.**

Mit 28 echten In-Scope-Sites (A:1 + B:15 + C:12) liegt das Volumen deutlich unter dem 80-Site-Schwellenwert. Die Sites verteilen sich auf 16 Dateien; kein File hat mehr als 4 In-Scope-Treffer. Splitting wuerde nur Overhead durch Stacking-Konflikte erzeugen (Lesson aus SP-G #1518/#1519-Squash-Konflikt).

---

## 8 — Cross-Project-Note (SP-C1 Disjunktheit)

Der parallel laufende SP-C1-Sweep (`kunde_*` → `geschaedigter` in `claim_parties`) bearbeitet eine voellig disjunkte Datei-Menge. Pruefung via Grep: keine der 16 SP-H-In-Scope-Dateien taucht im SP-C1-Sweep auf und umgekehrt. Zero File-Overlap bestaeigt — beide PRs koennen unabhaengig reviewt und gemergt werden.

---

## 9 — Naechste Schritte

1. Sweep-Implementierer oeffnet PR2 (`kitta/cmm-44-sph-pr2-sweep`) mit Base `staging` (nach PR1-Merge).
2. Sites 1-32 (inkl. Grep-Gaps) gemaess Pattern A/B/C abarbeiten.
3. Open Questions OQ-1 bis OQ-4 vor dem ersten Commit klaeren (keine Still-Stellen).
4. `npx tsc --noEmit` nach jeder Datei; finaler `npm run build` vor dem PR.
5. Post-Merge-Smoke: Admin-KPI-Cards, SV-Abrechnung-Seite, Feldmodus-Fallakte, Re-Termin-Flow, Storno-Flow, Briefing-Generierung.
