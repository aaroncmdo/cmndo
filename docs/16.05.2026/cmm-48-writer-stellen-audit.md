# CMM-48 — Writer-Stellen-Audit (`faelle` → `claims`)

**Datum:** 2026-05-16
**Ticket:** CMM-48 (Sub 4 von CMM-44, Phase 3 — Writer-Migration)
**Scope dieses Dokuments:** Bestandsaufnahme + Klassifikation **aller** Code-Stellen die in `faelle` schreiben. Keine Code-Änderung — reine Analyse als Grundlage für die Subsystem-PRs.

---

## 0 · KRITISCH — faelle-Writes auf bereits gedroppte Spalten

**Bei der Re-Verifikation (2026-05-16, Live-Schema-Probe `scripts/probe-faelle-schema.mjs`, 341 Spalten) gefunden:** PR #1322 hat 4 G-Spalten aus `faelle` gedroppt (`restwert`, `totalschaden`, `wiederbeschaffungswert`, `nutzungsausfall_tage`) und „3 Writer umgestellt" — **2 Writer wurden übersehen**. Diese schreiben weiter auf die toten Spalten → PostgREST-`schema cache`-Error → Statement crasht.

| Stelle | Tote Spalten | Pfad | Schweregrad | Ticket |
|---|---|---|---|---|
| `src/app/api/ocr-gutachten/route.ts:145` | restwert, wiederbeschaffungswert, nutzungsausfall_tage, totalschaden (conditional) | Gutachter lädt Gutachten-PDF hoch (`gutachter/fall/[id]/actions.ts:200` → `fetch /api/ocr-gutachten`) | **PROD-BUG** — crasht bei jedem Gutachten mit WBW/Restwert; der ganze OCR-Update (inkl. legit Felder `schadens_hoehe_netto`, `gutachter_honorar`, `fin_vin`) schlägt fehl | **CMM-53** (Urgent) |
| `src/lib/mietwagen/actions.ts:59` | nutzungsausfall_tage (in `MietwagenUpdate`-Type) | `MietwagenEditCard.tsx:59` sendet `nutzungsausfall_tage` **immer** mit | **PROD-BUG** — jeder Mietwagen-Edit durch Admin/KB crasht | **CMM-54** (Urgent) |
| `src/app/api/seed-testdata/route.ts:496` | restwert, totalschaden, wiederbeschaffungswert, nutzungsausfall_tage | Seed-Route | niedrig — kein Prod-Pfad | (in CMM-53/54 mitnehmen) |

**Empirisch verifiziert:** `scripts/probe-dead-column-writes.mjs` — non-destruktiver Probe-Write gegen staging-DB, beide Prod-Stellen liefern `Could not find … column of 'faelle' in the schema cache`.

**Empfehlung:** Sofort-Hotfix für die 2 Prod-Bugs — gehört eigentlich zu PR #1322 (F+G-Cluster). Die G-Werte leben jetzt in der `gutachten`-Sub-Tabelle (kanonischer Writer = RPC `apply_gutachten_ocr`). `ocr-gutachten/route.ts` muss auf die RPC umgestellt werden (parallel zum bereits migrierten `lib/ai/gutachten-ocr.ts`). Für `mietwagen` muss geklärt werden wohin `nutzungsausfall_tage` jetzt gehört (Mietwagen-Edit ist kein OCR-Pfad).

> Lehre: Spalten-Existenz IMMER live gegen `information_schema` / `select('*')` prüfen, nicht nur gegen die Sync-Trigger-Liste. Die erste Audit-Runde hat diese 3 Stellen als „WORKFLOW" durchgewinkt, weil die toten Spalten nicht in der 34-Sync-Liste stehen.

---

## 1 · Methodik

`grep -rnE "from\('faelle'\)" src/` → jede `.update()/.insert()/.upsert()`-Stelle geöffnet, Spalten-Keys extrahiert.

**Klassifikations-Regel:** Es gibt **34 Duplikat-Spalten** — sie existieren auf `faelle` UND `claims` und werden vom DB-Trigger `sync_faelle_to_claims` / `sync_claims_to_faelle` gespiegelt (Stand nach PR #1322, Migration `20260515113536_aar_cluster_fg_drop_claims_columns.sql`):

```
abgeschlossen_am, auslandskennzeichen, brn, fahrerflucht, finanzierung_leasing,
finanzierungsgeber_adresse, finanzierungsgeber_name, finanzierungsgeber_vertragsnr,
gegner_bekannt, gegner_versicherung_id, gegner_versicherungsnummer, gewerbe_flag,
kanzlei_ansprechpartner_email, kanzlei_ansprechpartner_name,
kanzlei_ansprechpartner_telefon, kanzlei_uebergeben_am, kunde_email,
kunden_konstellation, kundenbetreuer_id, polizei_aktenzeichen,
polizei_bericht_vorhanden, polizei_vor_ort, polizeibericht_status,
sachschaden_beschreibung, spezifikation, unfall_konstellation,
unfallskizze_ablehnung_grund, unfallskizze_bestaetigt, unfallskizze_generiert_am,
unfallskizze_svg, unfallskizze_url, vehicle_id, vorsteuerabzugsberechtigt,
zeugen_kontakte
```

- **WORKFLOW** — Stelle schreibt ausschließlich Workflow-Spalten (`status`, `sv_id`, `abrechnung_id`, `*_erinnerung_gesendet`, `vs_eskalationsstufe`, `claim_id`, `abtretung_*`, …) → bleibt auf `faelle`, **keine Migration**.
- **DUPLIKAT** — Stelle schreibt ausschließlich Duplikat-Spalten → Write komplett auf `claims` umstellen.
- **MIXED** — Stelle schreibt beides → Write **splitten**: Duplikat-Spalten nach `claims`, Workflow-Spalten bleiben `faelle`.

---

## 2 · Ergebnis-Übersicht

| Klassifikation | Anzahl | Aktion |
|---|---:|---|
| **KAPUTT** (schreibt gedroppte Spalte) | 3 | **Sofort-Hotfix** — siehe §0 |
| WORKFLOW | 84 | keine — bleibt `faelle` |
| DUPLIKAT (rein) | 1 | Write → `claims` |
| MIXED | 13 | Write splitten |
| **Gesamt Writer-Call-Sites** | **101** | |

→ **3 Stellen sind aktuell kaputt** (§0, 2 davon Prod-Bugs). **14 von 101** brauchen die CMM-48-Migration. Der Großteil (`faelle` als Workflow-/Assignment-Tabelle) bleibt unverändert — das deckt sich mit der CMM-Zielarchitektur (`faelle` wird in Phase 6 zur reinen Assignment-Tabelle, behält Workflow-Spalten).

> Die 3 KAPUTT-Stellen standen in der ersten Audit-Runde als „WORKFLOW" — die Klassifikation prüfte nur „Spalte in 34-Sync-Liste?", nicht „Spalte existiert noch?". Re-Verifikation gegen das Live-Schema (341 Spalten) hat sie aufgedeckt.

---

## 3 · Die 14 migrationspflichtigen Stellen

### 3.1 · Rein DUPLIKAT (1)

| Datei:Zeile | Spalten | Empfehlung |
|---|---|---|
| `src/app/gutachter/termine/[id]/actions.ts:371` | `polizei_aktenzeichen` | Write direkt auf `claims` (per `fall.claim_id`). Trivial — ein Feld. |

### 3.2 · MIXED (13) — Write splitten

| # | Datei:Zeile | Duplikat-Spalten | Subsystem | Aufwand |
|---|---|---|---|---|
| 1 | `src/lib/lead-fall-mapping.ts:382` (`buildFallInsertFromLead`) | ~24 der 34 (spezifikation, kunden_konstellation, unfall_konstellation, gegner_*, polizei_*, finanzierungsgeber_*, zeugen_kontakte, unfallskizze_*, sachschaden_beschreibung, kunde_email, fahrerflucht, auslandskennzeichen, gegner_bekannt, gewerbe_flag, finanzierung_leasing, vorsteuerabzugsberechtigt) | Lead-Konversion | **groß** — zentraler Insert-Builder, von `convert-lead-to-claim.ts:388` genutzt. Header sagt: Phase-6-Drop geplant. |
| 2 | `src/lib/faelle/state-machine.ts:123` | `abgeschlossen_am`, `kanzlei_uebergeben_am` | State-Machine | mittel — `transitionFallStatus`, von ALLEN Status-Wechseln genutzt |
| 3 | `src/lib/lexdrive/process-event.ts:689` (`computeFieldUpdates`) | `abgeschlossen_am`, `kanzlei_uebergeben_am` | LexDrive | mittel |
| 4 | `src/lib/lexdrive/process-event.ts:683` (`overrideUpdate`) | `abgeschlossen_am` | LexDrive | klein |
| 5 | `src/app/faelle/[id]/_actions/kanzlei-paket.ts:239` | `kanzlei_ansprechpartner_name/email/telefon` | Kanzlei-Paket | klein — 3 Felder |
| 6 | `src/app/faelle/[id]/_actions/stammdaten.ts:184` (`updateFallField`) | dynamisch — `FALL_EDITABLE_FIELDS`-Whitelist enthält `kunde_email`, `gegner_versicherung_id`, `gegner_versicherungsnummer`, `sachschaden_beschreibung` | Fallakte-Edit | mittel — generische Field-Update-Action, braucht Spalten-Routing-Map |
| 7 | `src/lib/faelle/kb-assignment.ts:66` (`updateKbOnFallAndClaim`) | `kundenbetreuer_id` | KB-Zuweisung | **bereits gelöst** — Helper schreibt schon beide Tabellen (faelle + claims), siehe CMM-48-Mini PR #1320 |
| 8 | `src/components/faelle/OcrAutoFillModal.tsx:80` | `gegner_versicherungsnummer` | OCR-AutoFill | klein |
| 9 | `src/app/api/ocr-fahrzeugschein/route.ts:80` | `brn` | OCR | klein |
| 10 | `src/app/admin/faelle/anlegen/actions.ts:91` | `spezifikation` | Admin-Fall-Anlage | klein |
| 11 | `src/app/api/admin/create-test-fall/route.ts:111` | 6 Duplikate | **Test-Route** | niedrig-prio — kein Prod-Pfad |
| 12 | `src/app/api/seed-testdata/route.ts:496` | 5 Duplikate | **Seed-Route** | niedrig-prio — kein Prod-Pfad |
| 13 | `src/app/api/seed-testdata/route.ts:887` | `unfall_konstellation` | **Seed-Route** | niedrig-prio — kein Prod-Pfad |

---

## 4 · Empfohlene Migrations-Reihenfolge (pro Subsystem ein PR)

CMM-48-Ticket-Vorgabe: „Migration pro Subsystem in 1 PR, nicht 54 Mini-PRs" — wegen Race-Condition-Risiko bei parallel laufenden Tabs.

| PR | Stellen | Begründung Reihenfolge |
|---|---|---|
| **PR-A** | #7 `kb-assignment` | Bereits gelöst (PR #1320) — nur verifizieren, ggf. abhaken. |
| **PR-B** | #1 `buildFallInsertFromLead` | Größter Hebel, alle Lead-Konversionen. Sollte als erstes „echtes" PR, weil der claims-Insert in `convert-lead-to-claim.ts` die Duplikat-Spalten schon schreibt — `buildFallInsertFromLead` muss sie nur **nicht mehr** auf faelle setzen (Sync-Trigger zieht von claims). Risiko: INSERT-Zeit-Sync greift nicht → faelle-Spalten bleiben initial null bis erstes UPDATE. Lösung im PR mitdenken. |
| **PR-C** | #2 `state-machine`, #3+#4 `lexdrive/process-event` | `abgeschlossen_am` + `kanzlei_uebergeben_am` — beide Stellen schreiben dieselben 2 Duplikat-Spalten. Zusammen migrieren. |
| **PR-D** | #5 `kanzlei-paket`, #6 `stammdaten` updateFallField | Fallakte-Edit-Pfade. `updateFallField` braucht eine Spalten-Routing-Map (welche Spalte → welche Tabelle). |
| **PR-E** | #8 OCR-AutoFill, #9 ocr-fahrzeugschein, #10 admin-anlegen, #1 (rein-Duplikat gutachter/termine) | Einzelfeld-Stellen, klein, zusammen abräumbar. |
| **PR-F** | #11/#12/#13 Test-/Seed-Routes | Zuletzt, niedrigste Prio — kein Prod-Pfad, nur für späteren `faelle`-Spalten-Drop relevant. |

Nach PR-A bis PR-F: `rg ".from('faelle')" src/ | rg ".(update|insert|upsert)"` ergibt nur noch WORKFLOW-Stellen → **CMM-49 (Phase-4-DROP der Duplikat-Spalten) kann starten.**

---

## 5 · Offene Punkte / Risiken

- **INSERT-Zeit-Sync greift nicht.** `sync_faelle_to_claims` / `sync_claims_to_faelle` sind `AFTER UPDATE`-Trigger — beim initialen INSERT (z.B. `buildFallInsertFromLead`) wird NICHT gespiegelt. Wer Duplikat-Spalten beim INSERT auf claims schreibt, hat faelle initial null. Reader die faelle lesen, müssten bis Phase-6-Drop also weiter faelle-Werte bekommen → entweder claims-INSERT + sofortiges faelle-UPDATE, oder faelle-INSERT behalten bis Phase 6. **Pro PR entscheiden.**
- **`updateFallField` (#6)** braucht eine Spalten→Tabelle-Routing-Map. Die `FALL_EDITABLE_FIELDS`-Whitelist mischt Workflow- und Duplikat-Spalten frei.
- **`schadens_*`-Spalten** (`schadens_datum/adresse/plz/ort/ursache/...`) sind im Audit als Workflow klassifiziert, weil sie NICHT in der 34-Sync-Liste stehen. Falls sie eigentlich Duplikate sein sollten (claims hat ggf. `schadentag`/`schadenort_*` als Pendant mit anderem Namen), ist das ein **Rename-Mapping**, kein 1:1-Sync — separat prüfen, nicht Teil dieses Audits.
- **Test-/Seed-Routes (#11–13)** schreiben Duplikat-Spalten direkt; für die laufende Trigger-Sync irrelevant, aber beim finalen `faelle`-Spalten-Drop (CMM-49) brechen sie → in PR-F mitnehmen.

---

## 6 · Quellen

- `grep`-Enumeration src/ (2026-05-16)
- Sync-Trigger-Spaltenliste: `supabase/migrations/20260515113536_aar_cluster_fg_drop_claims_columns.sql`
- CMM-48-Mini (convertLeadToFall): PRs #1320, #1332, #1343, #1353 — bereits gemerged
- Ticket CMM-48 / Parent CMM-44
