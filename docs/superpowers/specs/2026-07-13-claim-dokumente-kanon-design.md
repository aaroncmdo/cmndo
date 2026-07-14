# Kanonische Claim-Ableitung + Pflichtdokumente — Design

**Datum:** 2026-07-13
**Branch:** `kitta/claim-dokumente-kanon` (Worktree off staging)
**Auftrag (Aaron):** „audite die abgeleiteten claim views für alle rollen. die ableitung soll vollständig durch die claim base oder claim full laufen und entities ziehen aus der db und auch die pflichtdokumente sollen sauber daraus gelesen werden. lass uns das jetzt prod reif bauen."
**Scope-Entscheidungen (Aaron):** (1) volle Detail-Konvergenz **inkl. v_faelle-Retirement, solo**; (2) Dokument-Engines **konsolidieren**; (3) View-DDL minimal-additiv (Entity + Aggregat), Gutachten-Base-Normalisierung an 6f60c510.

Verwandte Marker: `BROADCAST-claim-dokumente-kanon-program`, `COORDINATION-AN-6f60c510-*`, `COORDINATION-AN-470d55c9-*`, `COORDINATION-AN-f6db1bed-*`. Audit-Grundlage: `AUDIT-abgeleitete-views-mapping-konsistenz-detailview`.

---

## 1. Problem / Ist-Zustand (prod-verifiziert 2026-07-13)

### 1.1 View-Topologie
- `v_claim_base` = normalisierte Basis (`FROM claims` + Laterals). **Phase** ← `v_claim_phase`-Entity ✅, **Payments** ← `v_claim_payments`-Entity ✅, aber **Gutachten** ← rohe `LEFT JOIN gutachten g` ❌ (die kanonische Entity `v_gutachten_werte` existiert, wird aber ignoriert — der letzte Roh-Tabellen-Join). **Dokumente: fehlen komplett.**
- `v_claim_full` = dünner Passthrough `FROM v_claim_base` + JSONB-Aggregate (`parties`, `vehicle_involvements`, `payments`, `mietwagen`, `vs_korrespondenz`, `repairs`). **Kein `dokumente`-Aggregat.**
- `v_faelle_mit_aktuellem_termin` = Legacy-Alias `FROM v_claim_base` (+ Termin-Join). **84 Reader / 52 Files.** Soll retired werden.
- `v_claim_workstate` = `FROM v_claim_full` ✅. `v_claim_listing` = re-joint `claims`+`profiles`+`vehicles` (nutzt aber `v_claim_phase`+`v_claim_kunde_name`-Entities). `v_claim_sv` + `v_werkstatt_auftrag` = **0 Reader in `src/`** (unwired).

### 1.2 Grants (prod)
`v_claim_full` / `v_faelle` / `v_claim_phase` / `v_gutachten_werte` / `v_claim_listing` = `authenticated`-`SELECT` ✅. **`v_claim_base` = NICHT `authenticated`-granted** (nur `service_role`). → jede neue Entity/Aggregat, die User-Consumer lesen, braucht `GRANT SELECT … TO authenticated` + Row-Gate `claim_sichtbar_fuer_aktuellen_user`.

### 1.3 Pflichtdokumente — 4 konkurrierende „Was ist Pflicht"-Engines
- **A (intended):** `dokument_katalog`-Regeln (`freigeschaltet_wenn`/`pflicht_wenn` JSONB) + `ruleEvaluator.ts` (`evaluateKatalogRule`). **Der Materialisierungs-Loop in `create-pflicht.ts` ist deaktiviert** → Regeln materialisieren keine Rows mehr.
- **B (live-UI):** `data-requirements.ts` (hardcoded `DOC_DEFINITIONS`, 8 Slots, eigene `condition(claim)`-Prädikate) — was Kunde/SV/KB tatsächlich rendern (`getOffeneDokumentAnforderungen`).
- **C (cron-only):** `pflicht-dokumente.ts` (`PFLICHT_DOKUMENTE_MATRIX`, Phase×Szenario, **inkompatible Slot-IDs**) — nur der Reminder-Cron.
- **+ `WeitereDokumenteCard.PFLICHT_TYPEN`** (4. lokale Klassifikation).
- **Persistenz:** `pflichtdokumente`-Tabelle (211 Rows, nur 13 distinct `dokument_typ` vs 44 Katalog-Slots → **stale/sparse**), geseedet aus `erwartung.ts` (`berechneErwartung`) + Ad-hoc-Inserts.
- **Status:** `pflichtdokumente.status` (app-geschrieben), aber Read-Time-„erfüllt" hängt an **`fall_dokumente`-Datei-Existenz** (nicht am Status). `claims.dokumente_vollstaendig_fuer_phase` = Cron (Engine C über `fall_dokumente`).
- **Kein DB-View über Dokumente.** Jede Rolle liest `fall_dokumente`/`pflichtdokumente` ad-hoc `fall_id`-gekeyt (Kunde/SV/Makler/Admin — 4 Stellen).
- **Sichtbarkeit:** `fall_dokumente.sichtbar_fuer[]` in RLS erzwungen + Code-Map-2.-Ebene (`sichtbarkeit.ts`) nur auf der SV-Fläche. `pflichtdokumente` hat KEINE Sichtbarkeits-Dimension.

### 1.4 Detail-Loader pro Rolle
- Kunde: `getKundeFallDetailRecord` → `v_claim_full`. SV: `getFallForSv` → `v_faelle`. Makler: `getMaklerFallDetail` → `v_faelle`. Admin/Dispatch/Kanzlei: `getFallById` → `v_faelle` (geteilte Route `/faelle/[id]`).
- **Geteilte Facade existiert:** `getClaimDetail(supabase, claimId, rolle, viewer?)` (470d55c9, #4039 staging) — Bundle incl. `pflichtDokumente`; Kunde+SV migriert; Admin/KB (D2) + v_faelle-Retirement **geparkt**.

---

## 2. Zielarchitektur

`v_claim_base → v_claim_full` bleibt DER Ableitungs-Hub. Jede Entität aus EINER kanonischen DB-Quelle; die Rollen-Views/Loader projizieren nur.

```
Entities (je EINE Quelle):
  v_claim_phase ✅   v_claim_payments ✅   v_gutachten_werte (→Base #7, 6f60c510)
  v_claim_dokumente ★NEU★  (SQL-Regel-Evaluator über dokument_katalog + fall_dokumente)

v_claim_base ─► v_claim_full ─► ALLE Detail-Reader (über getClaimDetail)
                    │ + dokumente jsonb (additiv ★NEU★)
                    └─► v_claim_workstate
v_faelle_mit_aktuellem_termin ─► RETIRE (Reader → v_claim_full)
```

---

## 3. Das Dokument-Modell (Kern)

### 3.1 SQL-Regel-Evaluator (ersetzt Engine A/B/C in SQL)
Neue `immutable` Function:
```
dokument_regel_trifft(regel jsonb, ctx jsonb) returns boolean
```
- Portiert `evaluateKatalogRule` (`src/lib/dokumente/ruleEvaluator.ts`) 1:1: Operatoren `eq, neq, in, not_in, gt, lt, gte, lte, is_null, is_not_null, truthy, falsy, and, or, not`; rekursiv über `conditions[]`/`condition`. `regel IS NULL` → `freigeschaltet`=true / `pflicht`=false (NULL-Semantik wie `katalog.ts`). `{}` (kein `op`) → true (wie `regelZuText`/getSlots-Verhalten).
- **Kontext** `dokument_katalog_ctx(claim_id) returns jsonb`: flacher Key-Space `lead.<feld>` (aus `leads` via `claims.lead_id`) + `fall.<feld>` (aus `claims`), exakt wie `buildKatalogContext`. (SV-Quali-Felder `sv_*` sind NICHT claim-scoped → in `v_claim_dokumente` nicht gebraucht.)
- **Parity-Gate:** SQL ≡ TS `evaluateKatalogRule` über ALLE Claims × aktive Slots = 0 Diff (opt-in Test).

### 3.2 `v_claim_dokumente` (neue Entity)
Eine Zeile je **(Claim × claim-scoped Katalog-Slot)** ∪ **(Ad-hoc-`pflichtdokumente`-Anforderung)**.
- **Basis-Menge:** `dokument_katalog WHERE aktiv AND kategorie <> 'gutachter_verifizierung'` (Letztere sind SV-Profil-Dokumente, sv_id-gekeyt — nicht Claim-Dokumente) — je Claim gekreuzt.
- **Abgeleitete Spalten:**
  - `freigeschaltet` = `dokument_regel_trifft(freigeschaltet_wenn, ctx)`
  - `pflicht` = `freigeschaltet AND pflicht_wenn IS NOT NULL AND dokument_regel_trifft(pflicht_wenn, ctx)`
  - `status` (offen/hochgeladen/geprueft/abgelehnt) — **SSoT = `fall_dokumente`** (s. 3.3)
  - `datei_url` / `storage_path` / `dokument_id` / `hochgeladen_am` ← neuestes `fall_dokumente` je Slot
  - `sichtbar_fuer[]` / `uploadbar_von[]` / `label` / `kategorie` / `beschreibung` / `sort_order` ← Katalog
  - `frist` / `quelle` / `angefordert_von_rolle` / `pflicht_row_id` ← `pflichtdokumente` (falls Ad-hoc/materialisiert)
- **Filter:** nur `freigeschaltet` Slots (nicht-freigeschaltete = `not_applicable`, nicht ausgeliefert), + Row-Gate `claim_sichtbar_fuer_aktuellen_user(claim_id)`. `GRANT SELECT TO authenticated`.
- **Sichtbarkeit:** die `sichtbar_fuer[]`-Spalte bleibt in der Row; Rollen-Filterung macht der Consumer/RLS (heutige Semantik erhalten — kein Rollen-Gate in der Entity, damit sie universell konsumierbar bleibt; der Consumer filtert `sichtbar_fuer @> ARRAY[rolle]` wie heute in `getSichtbarFuerRolle`).

### 3.3 Status-SSoT = `fall_dokumente`
`status` je Slot aus `fall_dokumente` (neuestes nicht-gelöschtes je `dokument_typ`/`pflichtdokument_id`):
- `abgelehnt_am IS NOT NULL` → `abgelehnt`
- geprüft (Review-State „ok" im `_review`-JSONB) → `geprueft`
- `storage_path` vorhanden → `hochgeladen`
- sonst → `offen`

Konsistent mit `beleg-review-ocr-status-fix` (Review-SSoT = `_review`-JSONB) + dem verifizierten „erfüllt = URL da". `pflichtdokumente.status` wird **nicht mehr** als Status-Quelle gelesen; `pflichtdokumente` bleibt nur für **Ad-hoc-Anforderungen** (KB/SV fordert Extra-Doku, `angefordert_von_rolle`/`begruendung`/`frist`).

### 3.4 Rollup (ersetzt Cron-Flag)
`dokumente_vollstaendig(claim_id)` = `NOT EXISTS(pflicht AND status='offen')` — aus `v_claim_dokumente` abgeleitet. Der Reminder-Cron liest den Rollup statt Engine C; `claims.dokumente_vollstaendig_fuer_phase` wird nicht mehr vom Cron geschrieben (Read-abgeleitet). (Falls ein Writer den Flag noch braucht: als GENERATED/Trigger — Entscheidung im Plan; Default = derive-at-read.)

### 3.5 Code-Konsolidierung
- **EIN** Modul (`src/lib/dokumente/pflicht.ts` o.ä.) liest `v_claim_dokumente` und liefert die bestehende `PflichtSlotForView[]`-Shape.
- **Abgelöst:** `data-requirements.ts` (Engine B), `pflicht-dokumente.ts` (Engine C), `WeitereDokumenteCard.PFLICHT_TYPEN`; `erwartung.ts`/`create-pflicht.ts`-Materialisierung entfällt für Katalog-Docs (nur Ad-hoc bleibt). `pflicht-evaluator.ts` (Matrix-Wrapper für `PflichtDocMatrix.tsx`) bleibt als **Admin-Diagnose** ODER wird auf `v_claim_dokumente` umgestellt (Plan).
- `getPflichtdokumenteForFall` (`pflicht-for-fall.ts`) liest `v_claim_dokumente` → `getClaimDetail.pflichtDokumente` erbt automatisch (Facade-API unverändert).
- **Cutover-Gate:** neue Pflicht-Menge vs. heutige Engine-B-Ausgabe je Claim diffen + Abweichungen explizit reconcilen, BEVOR die UI umschaltet (Aarons Engine-Konsolidierungs-Risiko abgesichert).

### 3.6 `dokumente`-Aggregat auf `v_claim_full` (P2, 6f60c510-koordiniert)
Additive Spalte `dokumente jsonb` = `jsonb_agg` aus `v_claim_dokumente` je Claim (analog `parties`/`payments`). Rein additiv, shape-preserving. Rollen, die `v_claim_full` lesen, bekommen Dokumente inline; alle anderen joinen die Entity per `claim_id`.

---

## 4. Detail-Konvergenz + `v_faelle`-Retirement (P4/P5)

- Alle 84 `v_faelle`-Reader → `v_claim_full`. Detail-Loader (SV/Makler/Admin) durch `getClaimDetail`-Facade; Widgets/Finance/Crons direkt `v_claim_full`.
- **Flat-Shape-Adapter:** `v_faelle` liefert flaches Legacy-Alias-Record ≠ nested `ClaimFull`. Adapter (in der Facade/Loader) mappt die ~40 Felder → Consumer unverändert. Löst die von 470d55c9 dokumentierte D2-Impedanz (staff-core flat vs nested; kanzlei/dispatch→'kunde'-pflicht-Bundling → `pflichtRolle`-Override).
- **Batches (je PR + Prod-Smoke):** (a) SV-Loader, (b) Makler-Loader, (c) Admin-Monolith `faelle/[id]/page.tsx` (D2), (d) Widgets/Finance/Crons, (e) Rest.
- **`DROP VIEW v_faelle_mit_aktuellem_termin`** erst wenn Reader=0 (grep + `pg_depend` verifiziert).

---

## 5. Phasen (jede einzeln prod-reif)

| Phase | Inhalt | DDL | Kollision |
|---|---|---|---|
| **P1** | SQL-Evaluator + `v_claim_dokumente` + Code-Konsolidierung + `getPflichtdokumenteForFall`/Facade-Feed + Rollup | neue Function+Entity (0 Kollision) | niedrig |
| **P2** | additives `dokumente`-Aggregat auf `v_claim_full` | 1 additive `CREATE OR REPLACE` | 6f60c510-Sync |
| **P3** | Gutachten raw→`v_gutachten_werte` in Base | — (Spec → 6f60c510 #7) | Handoff |
| **P4** | `v_faelle`-Reader → `v_claim_full` (Batches) | — | 470d55c9/f6db1bed-Marker |
| **P5** | `DROP v_faelle` | 1 DROP | nach Reader=0 |

P1 zuerst (Kern-Wert, kollisionsarm). P3 = 6f60c510-Timing (hinter deren abrechnungsweg-Keystone).

---

## 6. Koordination
- **Worktree** `kitta/claim-dokumente-kanon` off staging (raus aus der aar-956-Kollisionszone).
- **6f60c510** (v_claim_full/base-Owner): Sequenz für additiven `v_claim_full`-Replace (kein Doppel-`CREATE OR REPLACE`) + Gutachten-#7-Spec. Marker gesetzt.
- **470d55c9** (Facade): baue AUF `getClaimDetail`, übernehme D2/v_faelle-Retirement, Guard-Tests (`claim-phase-parity`/`claim-status-invariant`) grün. Marker gesetzt.
- **f6db1bed** (Makler aktiv): Heads-up vor `makler/queries.ts`-Touch. Marker gesetzt.
- **FG-Lanes (FG5/6/7):** `v_claim_dokumente` hängt an 15 lead/fall-Flags (nicht droppen ohne Abstimmung) — im Broadcast gelistet.
- **35660476** (Release): saubere Migs — volle `CREATE OR REPLACE` + `RAISE WARNING` + File-nach-getrackter-Version (Regel 2). Kein fragiler `pg_get_viewdef+replace`-Guard.

---

## 7. Verifikation
- **SQL-Evaluator ≡ TS `evaluateKatalogRule`** (alle Claims × aktive Slots, 0 Diff; opt-in `RUN_PARITY=1`).
- **Neue Pflicht-Menge vs. Engine-B** (heutige Live-UI) je Claim — Diffs reconcilen vor Cutover.
- **`v_claim_full`-Shape-Diff-Harness** (nonexempt_diffs=0) für das additive Aggregat; 470d55c9-Guard-Tests grün.
- **v_faelle-Reader=0** vor DROP (grep + `pg_depend`).
- **Prod-Smoke je Rolle** (Kunde/SV/Makler/Admin/Dispatch/Kanzlei) auf **OLD-Claim** (faelle.id≠claim_id): Dokumente + Detail rendern (Playwright, Test-Konten telefon=NULL, `PLAYWRIGHT_BASE_URL=https://app.claimondo.de`).
- Route-Changes → voller `npm run build` (Next-15-Validator); 4 Ratchets 0-neu; knip clean; 7-Punkte-Audit je Commit.

---

## 8. Risiken & Mitigation
1. **Engine-Konsolidierung ändert „was ist Pflicht"** → Parity + Engine-B-Reconcile-Gate (§7) vor UI-Cutover.
2. **v_faelle-Blast-Radius (84 Reader)** → Batches + Facade-Funnel + Drop-last + Reader=0-Gate.
3. **Paralleles `v_claim_full`-Replace mit 6f60c510** → Marker-Sequenz, Def auf deren Live-Stand basieren.
4. **Grants:** neue Entity braucht `GRANT SELECT TO authenticated` + Row-Gate (v_claim_base-Falle vermeiden).
5. **Status-SSoT-Wechsel** (`pflichtdokumente.status` → `fall_dokumente`): QC-Approve/Reject-Writer prüfen, dass der Review-State (`_review`-JSONB) korrekt gelesen wird.

---

## 9. Nicht-Ziele / bewusst ausgelagert
- Gutachten-Base-Normalisierung applyt **6f60c510** (deren #7, ihre Fläche) — ich liefere die Spec (§P3).
- SV-Profil-Verifizierungs-Dokumente (`kategorie='gutachter_verifizierung'`) bleiben ihr eigenes, sv_id-gekeytes Subsystem — NICHT in `v_claim_dokumente`.
- `v_claim_listing`-Struktur-Drift (re-joint claims) = optional/Folge (nutzt schon Entities für Phase+Name).
- `v_claim_sv` / `v_werkstatt_auftrag` (0 Reader) = kein Touch (ausser sie tauchen als Reader auf).
