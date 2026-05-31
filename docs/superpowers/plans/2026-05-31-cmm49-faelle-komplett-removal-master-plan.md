# CMM-49 — faelle Komplett-Removal: DER Master-Plan (einmal durchziehen)

> **Für agentische Worker + alle Sessions:** Dies ist die **verbindliche Reststrecke** bis `DROP TABLE faelle`. Reihenfolge ist bindend. Heimat-Entscheidungen (§1) sind **gelockt** — NICHT neu verhandeln. Jede Phase = 1+ PR vs `staging`. Vor jeder Migration Live-Re-Messung (geteilte DB, parallele Sessions). `- [ ]` = abhaken. **Keine Strategie-Neuverhandlung mehr.**

**Richtung (Aaron, 31.05., LOCKED):** `faelle` **komplett weg** — Tabelle gedroppt, **kein** Bridge/Kompat-View. `fall_id` **stirbt mit** (claim_id überall, `/faelle/[id]` → claim-id-Route). Maximal sauber.

**Konsequenz dieser Strategie (wichtig):** Unter dem Total-Drop sind **alle inkrementellen per-Spalten-DROP-Sub-Projekte MOOT** (SP-A „34 Duplikat-Spalten", einzelne `DROP COLUMN`-PRs etc.) — die Spalten sterben mit dem Table-Drop. Es zählt **nur** die Reader/Writer-Migration **weg** von faelle (Phase C/D), dann fällt die ganze Tabelle (Phase G). Das spart die ganzen Drop-Column-PRs.

**Autoritatives Inventar (NICHT dupliziert):** `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (+ §R-Revalidierung). Dieser Plan = die gelockte Sequenz + Heimat-Entscheidungen + Ticket-Mapping darüber.

---

## 0 · Definition of Done

- [ ] `DROP TABLE faelle` appliziert, **kein** Ersatz-View.
- [ ] `0×` `.from('faelle')` im `src/`-Baum · `0×` `faelle` in Views/Funktionen/Crons/Policies.
- [ ] `fall_id` aus allen ~13 Kind-Tabellen gedroppt — `claim_id` einzige ID.
- [ ] `/faelle/[id]` + `/kunde/faelle/[id]` → claim-id-Route (308-Redirect für Bookmarks).
- [ ] `generate_typescript_types` gelaufen, `faelle`-Block aus `database.types.ts` weg.
- [ ] `npm run build` grün · alle Portale gesmoket (Kunde/SV/Admin/Kanzlei/Dispatch/Magic-Link) mit Screenshot.

## 1 · Gelockte Heimat-Entscheidungen (KEINE Neuverhandlung)

| Domäne | Spalten | Heimat (gelockt) | Ticket | Stand |
|---|---|---|---|---|
| Fahrzeug/FIN | kennzeichen, fahrzeug_*, fin_*, hsn, tsn, erstzulassung, lackfarbe_code, kilometerstand | **`vehicles`** via `claims.vehicle_id` | CMM-50/68 | ✅ Schema+Views+Write+Backfill done; nur 1 FIN vorhanden |
| Vorschäden/Cardentity | hat_vorschaeden, vorschaden_*, cardentity_* | **`vehicle_vorschaeden` + `vehicles` + `claims`-Flags** | CMM-64 | View-Repoint ✅ (#2114); Writer (PR2) + Reader-Sweep offen |
| Kunde-Identität | kunde_id, kunde_vorname/_nachname/_telefon/_adresse/_email | **`claim_parties` (geschaedigter)** | CMM-63 SP-C1 | ✅ done; 1 kunde_id-Divergenz reconcilen |
| Kunde-Geo | kunde_lat, kunde_lng | **`claims`** (additiv) | CMM-65-Scope | offen (kein Party-Pendant) |
| Gegner-Partei | gegner_name, gegner_versicherung, gegner_kennzeichen | **`claim_parties` (unfallgegner)** | CMM-63 **SP-C2** | 🔴 offen (Label „Done" trügt) |
| Gegner-Skalar | gegner_anzahl_beteiligte, gegner_fahrzeugtyp, gegner_versicherung_anfrage_datum | **`claims`** (additiv) | CMM-63 SP-C2 | 🔴 offen |
| Halter | halter_* + ist_fahrzeughalter | **`claim_parties` (halter)** | CMM-67 **SP-C3** | 🔴 Backlog, nicht begonnen |
| Ownership | organisation_id, dispatch_id | **`claims`** (additiv) | CMM-65-Scope | offen |
| Lifecycle | status (`fall_status`) | **`claims`** (status/phase-abgeleitet) | **AAR-939** | 🔴 cross-session, duales Lifecycle |
| Business-Rest | ust_id, bank_name, firma_name, leasinggeber_name, zahlung_erwartet_am, mietwagen_kanzlei_informiert(_am), auszahlung_kunde_* | **`claims`** (additiv; auszahlung → ggf. `claim_payments`) | CMM-65-Rest | je Spalte vor ADD Redundanz/Coverage prüfen; Tote droppen |
| Lead-Attribution | source_channel, source_domain | **bleibt — redundant via `claims.lead_id → leads`** | — | ✅ mismatch=0, kein ADD |
| Timestamp | created_at (`fall_created_at`) | **`claims.created_at`** (Shift akzeptiert) ODER reader-driven | — | mismatch=72 → Reader-Bedarf prüfen |
| ID-Bridge | id (`fall_id`) | **stirbt** (claim_id, Route-Switch §E) | CMM-28 | LOCKED |

**Verify-vor-ADD-Regel:** vor jedem ADD live `information_schema.columns` + Coverage prüfen. Additiv + EXCEPT-0/0-fähig.

## 2 · Stand JETZT (reconciled über Docs + Linear + diese Session)

### ✅ WIRKLICH erledigt (nicht nochmal anfassen)
- **CMM-60** claims.sv_id native · **CMM-62** Cardentity/Vorschäden-Heimat-Entscheidung · **CMM-65** faelle-only Operativ/Finanz/Timestamp → claims (außer kunde_id) · **CMM-61** Reader/Writer-Sweep relocateter Spalten (Rest = Views → CMM-66) · **CMM-50/68** vehicles Schema+COALESCE-Views+Write-Path+Backfill · **CMM-58/52-57/59** Vorarbeit+Bugs · **Phase 4.1** v_claim_timeline faelle-frei (#2053).
- **Diese Session (31.05.):** **B4 FK-Re-Key 42/47** inkl. Batch C (#2105) · **B2 RLS** `can_access_fall` = **0 Policy-Consumer**, faelle-RLS 100% claim_id (#2108) · **B1 vehicles-Backfill** (#2112) · **CMM-64 PR3** Vorschäden/Cardentity-View-Repoint (#2114) · **vollmacht_datum-Bug** gefixt (#2110).

> **Reconciliation:** Die alten Drop-Readiness-Docs führen B2(RLS) + B4(FK) + B1(vehicles) + vollmacht noch als „offen" — **diese Session hat sie geschlossen.** Nicht erneut planen.

### 🔴 Sieht „Done" aus, ist es ABER NICHT (Label-vs-Body-Drift — nicht überspringen!)
- **CMM-63 (Linear: Done)** → real nur **SP-C1 (kunde_id)** erledigt. **SP-C2 (Gegner) + Bankdaten-Klärung OFFEN.** → Phase A1.
- **CMM-66 (Linear: Done, „Reopened 31.05.")** → real nur Teil 1 (mandatsnummer) + sv_id. **Teil 2 = 5 Views (`v_claim_full`, `v_claim_listing`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) joinen noch faelle = harter CASCADE-Blocker.** → Phase B.
- **CMM-46/47/48 (Done)** decken nur die **obsolete 41-Duplikate-Idee**, NICHT die Drop-Strecke. **Nicht als Drop-Fortschritt zählen.**

### 🟡 Zu verifizieren
- **CMM-51 gutachten-Sub-Table** (In Progress, stale seit 15.05., verwaister Branch `kitta/aar-cluster-fg-gutachten`): **Live prüfen**, ob die gutachten-Migration wirklich durch ist, bevor Phase B/C darauf baut.

## 3 · Die Reststrecke — Phasen (Reihenfolge verbindlich)

> **A (Heimat) → B (Views) → C (Reader) → D (Writer) → E (fall_id-Tod) → F (DB-intern) → G (DROP).** A-Slices parallelisierbar. Jede Phase grün + gesmoket vor der nächsten. Kein Bridge → §G erst wenn `grep .from('faelle')` = 0.

### Phase A — Heimat abschließen (additive Spalten + Backfill; kein View/Reader-Change)
- [ ] **A0 CMM-51 verifizieren** — gutachten-Sub-Table live komplett? (Voraussetzung für B/C.)
- [ ] **A1 Gegner (CMM-63 SP-C2)** → `claim_parties(unfallgegner)` (name/versicherung/kennzeichen) + `claims` (anzahl_beteiligte, fahrzeugtyp, versicherung_anfrage_datum). Backfill. + **Bankdaten-Klärung** (CMM-63-Body-Rest).
- [ ] **A2 Ownership** → `claims.organisation_id` + `claims.dispatch_id` (additiv + FK + Backfill).
- [ ] **A3 Halter (CMM-67 SP-C3)** → `claim_parties(halter)` (alle halter_* + geburtsdatum) + `claims.ist_fahrzeughalter`. Backfill.
- [ ] **A4 Kunde-Geo** → `claims.kunde_lat/_lng` (additiv + Backfill).
- [ ] **A5 kunde_id-Reconcile (CMM-63)** — 1 Divergenz `f.kunde_id ≠ c.geschaedigter_user_id` klären.
- [ ] **A6 Business-Rest** → `claims` (ust_id/bank_name/firma_name/zahlung_erwartet_am/mietwagen_kanzlei_informiert/auszahlung_kunde_*); je Spalte vorher Redundanz/Coverage, Tote droppen.
- [ ] **A7 Lifecycle/fall_status (AAR-939)** — claims-Quelle definieren (`CASE` aus `claims.status`/`v_claim_phase`). **Hard-Sync mit AAR-939-Ownern VOR B/D.**

### Phase B — Views claims-nativ (= CMM-66 Teil 2; je EXCEPT-0/0, PR3-Pattern)
`replace()`-Transform Live-Viewdef + Self-Assert (0× `f.`) + Output-EXCEPT-0/0-Guard + reloptions-Recheck.
- [ ] **B1 `v_claim_full`** — Rest-f.* (gegner/ownership/kunde/halter/fahrzeug-COALESCE-Cutover; fall_id/fall_status erst nach §E/§A7). *Bug mitnehmen: f.mandatsnummer ist schon jetzt stale → kf.mandatsnummer.*
- [ ] **B2 `v_faelle_mit_aktuellem_termin`** — schwerster View (~50 f.* rest).
- [ ] **B3 `faelle_kunde_view` + `faelle_sv_view`** — `FROM faelle` → `FROM claims`.
- [ ] **B4 `v_claim_listing`** — `f.id AS fall_id`-Output bleibt bis §E, dann LEFT JOIN weg.

### Phase C — Reader-Sweeps pro Portal (~338 GENUINE, Audit §3.5/§R.4)
Pro Portal 1 PR + Smoke. *Inkl. 7 echte `kanzlei_faelle`-Top-Level-Reader (Audit-Grenzfall).*
- [ ] **C1 Kunde** · [ ] **C2 SV/Gutachter** (~25 in gutachter/fall/[id]) · [ ] **C3 Kanzlei** · [ ] **C4 Admin** · [ ] **C5 Magic-Link** · [ ] **C6 Communications/SLA/Crons** (Stillbreaker-Gefahr) · [ ] **C7 LexDrive/Finance/OCR/Termin/Tasks/Brand/Helpers**

### Phase D — Writer-Migration (~40 Sites, Audit §3.6)
- [ ] **D1 Unconditional-Touches streichen** (`core.ts:79,115`, `eskalation-actions.ts:66,108` — nur updated_at).
- [ ] **D2 Genesis-Inserts invertieren** (`convert-lead-to-claim`, `admin/faelle/anlegen` → claim-first).
- [ ] **D3 Status-SSoT** (`state-machine.ts` → `claims.status`; hängt an §A7).
- [ ] **D4 `splitOrKeepFaelleUpdate` retirement** (cluster-weise; bei leerem Set Helper löschen).
- [ ] **D5 Billing/OCR/Test-Writer** + **Latente Bugs:** Stripe-Webhook `route.ts:338` (Provision in tote faelle-Kopie) · `besichtigungsort.ts:69` else-Zweig schreibt faelle.

### Phase E — fall_id-Tod + Route-Switch (CMM-28)
- [ ] **E1 Route-Switch** `/faelle/[id]` + `/kunde/faelle/[id]` → claim.id (308-Redirect).
- [ ] **E2 Kind-`fall_id` droppen** (FK drop + `DROP COLUMN`; Reader/Trigger vorher auf claim_id) + 4 Legacy-Pointer (`leads.konvertiert_zu_fall_id` etc.).
- [ ] **E3 View-fall_id-Outputs entfernen** (`v_claim_listing`/`v_claim_full`).

### Phase F — DB-intern claim-zentrisch (Audit §3.2/§R.2/§3.3)
- [ ] **F1 Funktional-Trigger replizieren** auf `claims` AFTER UPDATE: `on_filmcheck_done`, `on_gutachten_eingegangen`, `on_regulierung`, `trg_sa_bestaetigt_termin` (Notification-Baseline vorher). *= die 4 „toten Trigger-Landminen".*
- [ ] **F2 Funktionen/Crons** claim-zentrisch: `dsgvo_anonymize_user_data` (DSGVO-kritisch, scharf testen), `can_access_fall`-Drop, `apply_gutachten_ocr`, 3 Crons, delete-Helper.
- [ ] **F3 RLS** — 29 Policies in 17 Tabellen + `leads_staff_all_consolidated`-faelle-JOIN → claims/Sub-Tables.
- [ ] **F4 Sync-Trigger droppen** (`trg_sync_claims_sv_id_to_faelle`, `trg_sync_faelle_sv_id_to_claims`, kanzlei_paket/kanzlei_faelle/fall_dokumente-Sync, `trg_derive_claim_id`-Net aus B4).

### Phase G — DROP (Aaron-gated, separate Session, Rücksprache-Pflicht)
- [ ] **G1** Live-Final: `0×` `.from('faelle')`, `0×` faelle in Views/Fn/Policies, 0 fall_id-Reader.
- [ ] **G2** `DROP TABLE faelle CASCADE`.
- [ ] **G3** `generate_typescript_types`.
- [ ] **G4** `npm run build` + Voll-Portal-Smoke (Screenshots). **Aaron-Abnahme.**

## 4 · Verifikation (pro Phase)
- **Views:** EXCEPT-0/0-Guard + reloptions-Recheck + 0×-f.-Self-Assert (PR3-Pattern, bewährt #2114).
- **Reader/Writer:** Portal-Smoke + Screenshot; `npm run build` bei Routen/Actions.
- **DSGVO-Fn** vor §G scharf testen · **Notification-Baseline** vor §F1 · **Anon-RPC-Sentinel** (`can_access_fall`) vor/nach §F2.

## 5 · Risiken + Koordination
- **AAR-939-Lifecycle** (`fall_status`, §A7/§D3): aktive Parallel-Sessions (monika-embed, embed-b, dispatch). **Vor §A7 abstimmen.**
- **Geteilte DB / parallele Sessions:** Live-Re-Messung vor jeder Migration; Branch-/File-Kollision via Session-Marker.
- **Label-vs-Body-Drift:** Linear-Status NICHT trauen für CMM-63/66 (§2). Body lesen.
- **Kein Bridge:** §G2 erst wenn Phase C komplett (`grep .from('faelle')` = 0).
- **Route-Switch (§E1):** Legacy-Redirect Pflicht (Bookmarks/Magic-Links).

## 6 · Quellen
- Inventar: `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (+ §R + Phase-4.1-Done).
- 31.05.-Stand: `docs/31.05.2026/cmm-claim-ssot-session-31.05.md` · Master-Rahmen: `docs/16.05.2026/...` · Breaker-Inventar: `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md`.
- Diese Session: #2105/#2108/#2112/#2114/#2110. Memory: `project_cmm_phase_24_finishing`.
- **Überholt/verworfen:** Bridge-Spec `2026-05-31-cmm49-faelle-drop-bridge-strategie.md` (#2115). SP-A + alle per-Spalten-DROP-Sub-Projekte (MOOT unter Total-Drop).
