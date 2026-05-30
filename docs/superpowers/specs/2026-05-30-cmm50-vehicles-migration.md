# CMM-50 (SP-E) — vehicles-Migration — Spec (FINAL, re-sequenziert + adversarial-verifiziert)

**Master:** CMM-44 (faelle-Drop) · **Ticket:** [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) (High, Backlog) · **Position:** harter blockedBy fuer CMM-49 (faelle DROP) + Phase-4.2-Unblocker fuer die Fahrzeug-Spalten der 4 schweren Views
**Audit:** Workflow `wf_82364751-2a5` (3 Finder, 654k) + Re-Grounding 30.05. (Probe `scripts/probe-cmm50-vehicles.mjs`, RPC-Signatur, leads/claims/claim_parties-Schema, Linear CMM-63/65/49) + Verify-Workflow `wf_093f7c2e-763` (5 Agenten, 586k: write-path/reader/views/db-facts + adversarialer Kritiker)
**Status dieses Docs:** SCOPING FINALISIERT — alle 4 Aaron-Entscheidungen (§0) + 10 Verify-Korrekturen eingearbeitet. Noch kein Code; Implementierung in eigenen PRs.

---

## 0 · Entscheidungen (Aaron, 30.05.) — bindend

| # | Frage | Entscheidung | Konsequenz im Spec |
|---|---|---|---|
| 1 | Session-Modus | **Nur final scopen**, nicht implementieren | dieses Doc + Plan + Linear; kein Code-PR |
| 2 | Halter-Spalten (`ist_fahrzeughalter`/`firma_name`/`ust_id`) | **An SP-C/CMM-63 delegieren** | **raus aus CMM-50-Scope** — §4 zeigt nur das Mapping (Ziel-Spalten existieren bereits + werden bei Konversion schon teilweise befüllt) |
| 3 | `lackfarbe_code` | **Auf bestehende Spalte mappen** | → **`vehicles.farbcode`** (live verifiziert) — **keine neue Spalte**, fällt aus 50.1 raus. Wird live von genau **1** Reader gelesen (email/flows direkt-faelle) |
| 4 | 50.0 Write-Path | **Als eigenständiges Produkt-Gap-Feature vorziehen** | 50.0 = Lead-Deliverable (unabhängig vom faelle-Drop shippbar, rein additiv); 50.1–50.3 = Migrations-Tail |

---

## 1 · Der Befund, der CMM-50 umdeutet (live bestätigt 30.05., doppelt verifiziert)

CMM-50 war als „Reader von `faelle.fahrzeug_*` auf `vehicles` umlenken" gedacht. **Der Audit zeigt: das geht so nicht — die `vehicles`-SSoT ist leer, weil der Write-Path nie gebaut wurde.**

Live-Stand (Probe + information_schema 30.05.):

| Fakt | Wert |
|---|---|
| `vehicles` Zeilen | **0** |
| `vehicles` Spalten | 45 (inkl. `farbe_klartext` **und** `farbcode` **und** `ist_metallic`) |
| `claims.vehicle_id` | **75/75 NULL** |
| `claim_vehicle_involvements` | **0 Zeilen** (8 Spalten: id, claim_id, vehicle_id, rolle, beschaedigung_grad, reihenfolge, notiz, created_at) |
| `faelle.vehicle_id`-Spalte | **existiert nicht mehr** (gedroppt) — Legacy-Daten liegen als **flache** `faelle.fahrzeug_*`-Spalten (alle ~leer, nur `fin_vin`=1 non-null) |
| `leads.vehicle_id` | **existiert** (uuid, 0 gesetzt) · `leads.fin` (text) ist das FIN-Feld auf leads — **leads hat KEIN `fin_vin`** (faelle nutzt `fin_vin`) |
| `upsert_vehicle_by_fin`-RPC Caller in `src/` | **0** (einziger Treffer: `database.types.ts:16090`, generiert) |

**Ursache:** AAR-773/AAR-810 (25.04.) bauten die vehicles-Infrastruktur (Tabelle, `*.vehicle_id`-Spalten, `upsert_vehicle_by_fin`-RPC, `claim_vehicle_involvements`) + **eine einmalige Backfill-Migration** (`20260425120300`). Die **Application-Layer-Verdrahtung kam nie**: die RPC hat 0 Caller, kein Code schreibt je `leads.vehicle_id` oder eine `vehicles`-Row. `convert-lead-to-claim.ts` liest `claims.vehicle_id` aus `lead.vehicle_id` (das runtime nie gesetzt wird) → immer NULL, der `claim_vehicle_involvements`-Zweig (Z.419) feuert nie.

**Read-Seite ist teilweise fertig** — `get-kunde-faelle.ts` ist bereits **vehicles-FIRST mit faelle-Snapshot-FALLBACK** (joint `claim_vehicle_involvements`+`vehicles` :236-256, fällt via `??` auf `fall.fahrzeug_*` :314-316 zurück). **Write-Seite fehlt komplett** → der Fallback ist heute der einzige aktive Pfad.

**Konsequenz (doppelt):**
1. Die Reader auf eine leere SSoT umzulenken wäre eine **Daten-Regression** → **der Write-Path muss zuerst** (50.0 vor 50.3).
2. Es ist zugleich ein **Produkt-Gap**: aktuell landet kein einziges Fahrzeug in der vehicles-SSoT — `vehicle_ownership_history` (Halterwechsel-Tracking) + jede fahrzeug-zentrierte Auswertung bleiben leer. **Darum ziehen wir 50.0 als eigenständiges Feature vor (Entscheidung 4).**

---

## 2 · Die RPC, die 50.0 trägt — `upsert_vehicle_by_fin` (live gelesen)

Signatur (Migration `20260425120400_aar773_upsert_vehicle_by_fin_rpc.sql`):

```sql
upsert_vehicle_by_fin(
  p_fin            VARCHAR(17),              -- Pflicht; 17-Zeichen + ISO-3779-Validierung (RAISE bei Verstoß)
  p_kennzeichen    VARCHAR(20)  DEFAULT NULL,
  p_hsn            VARCHAR(4)   DEFAULT NULL,
  p_tsn            VARCHAR(3)   DEFAULT NULL,
  p_hersteller     TEXT         DEFAULT NULL,  -- COALESCE auf 'Unbekannt'
  p_modell         TEXT         DEFAULT NULL,  -- → modell_haupttyp
  p_owner_id       UUID         DEFAULT NULL,  -- ⚠ triggert vehicle_ownership_history (Halterwechsel-Detection)
  p_quelle         TEXT         DEFAULT 'manual',
  p_kilometerstand INTEGER      DEFAULT NULL
) RETURNS UUID                                 -- die vehicle-id (ON CONFLICT (fin) DO UPDATE)
-- SECURITY DEFINER, GRANT EXECUTE TO authenticated, service_role
```

**Wichtige Einschränkung für 50.0/50.1:** Die RPC schreibt **nur 8 Felder** (fin, kennzeichen_aktuell, hsn, tsn, hersteller, modell_haupttyp, current_owner_id, aktueller_kilometerstand[_at]). Sie kennt **kein** `farbcode`/`farbe_klartext`/`bauart`/`baujahr_monat`/`erstzulassung`/`variante`/… Der richere Snapshot (Farbe, Bauart, Baujahr, Erstzulassung) kann über die RPC **nicht** befüllt werden.

→ **Architektur-Konsequenz:** Der 50.0-Helper `ensureVehicleFromFin` ruft die RPC für die FIN-Kern-Identität; in **50.0** nur diese 8 Kernfelder. Snapshot-Restfelder erst **50.1**: entweder Secondary-`UPDATE vehicles SET farbcode=…, bauart=…, baujahr_monat=…, erstzulassung=… WHERE id=<ret>` **oder** RPC-Erweiterung (sauberer, atomar) — Entscheid in 50.1 (Plan AK 2.3).

**`p_owner_id`-Nebenwirkung:** gesetzter Owner triggert `vehicle_ownership_history`. Owner-Auflösung pro Call-Site (s. §5): ZB1-OCR/Lead = **kein** Owner (`undefined`, Account existiert noch nicht); Lead-Konversion = aufgelöste Kunde-`user_id`; saveFinVin/enrich (Fall) = Geschädigter-`user_id`. Inkonsistentes Owner-Passing erzeugt sonst Ghost-History-Rows.

---

## 3 · Inventar (de-noised: 4 direkte + 4 View-Reader + 5 Writer — kuratiert, nicht 55)

Der „55 GENUINE"-Count (alte CMM-50-Description) war statisch überzählt. **Achtung:** dies ist ein **kuratiertes** Inventar (89 Files referenzieren fahrzeug-Spalten, 222 machen `.from('faelle')`) — bei der 50.3-Implementierung **paren-balanced re-greppen**. Verify-Workflow `wf_093f7c2e-763` hat alle Einträge file:line bestätigt + **eine Korrektur** geliefert (4. direkter Reader, s. u.).

### Reader
| File | Portal | Quelle | Spalten / Anmerkung |
|---|---|---|---|
| `lib/claims/get-kunde-faelle.ts` | kunde | **direkt faelle (Fallback)** | kennzeichen, fahrzeug_hersteller/modell/baujahr — **bereits vehicles-FIRST** (cvi+vehicles :236-256), faelle nur `??`-Fallback :314-316 |
| `lib/email/google/flows.ts` | lib/email | **direkt faelle** + View | fahrzeug_hersteller/modell, kennzeichen, **`lackfarbe_code`** (nur direkt-Pfad :71/:186) · View-Pfad :238 |
| `lib/kanzlei/push-mandat.ts` | kanzlei | **direkt faelle** | firma_name, kennzeichen (:84) |
| **`lib/makler/copilot-prompt.ts`** | makler | **direkt faelle** | **(NEU, Verify-Fund)** `from('faelle').select('*')` :86, nutzt fahrzeug_hersteller/modell :167, fahrzeug_baujahr :202 — war im alten Inventar **fehlend** |
| `lib/fall/queries.ts` | admin/sv/kunde | View `v_faelle_mit_aktuellem_termin` | kennzeichen, fahrzeug_hersteller/modell/baujahr |
| `lib/makler/queries.ts` | makler | View `v_faelle_mit_aktuellem_termin` | fahrzeug_*, kennzeichen, fin_vin, kilometerstand, erstzulassung |
| `lib/ai/briefing.ts` (+ sibling `lib/copilot/briefing.ts`) | sv | View `select *` | fahrzeug_*, kilometerstand, erstzulassung, kennzeichen |
| `app/faelle/[id]/ai-actions.ts` | admin/kb | View `select *` | fahrzeug_hersteller/modell, kennzeichen |

→ **4 direkte faelle-Reader** (get-kunde-faelle [Fallback], email/flows, push-mandat, **makler/copilot-prompt**) + **4 View-Reader** (alle über `v_faelle_mit_aktuellem_termin`).

**Nicht in der Reader-Liste — `lib/stammdaten/schema.ts`** (war fälschlich als „View / 13 Felder" geführt): **kein DB-Reader.** Null `.from()`/Client — reine `STAMMDATEN_FIELD_SCHEMA`-Definition mit `getValue(fall, lead, claim)`-Accessors auf **vom Caller übergebene** Objekte. Sieht vehicles-Daten nur, wenn ein künftiger Caller ihm ein vehicles-gesourctes Objekt füttert. **Braucht in 50.3 keine eigene Änderung** — nur die Selects seiner Caller (StammdatenAccordion/Detail) zählen.

**View-Attribution (Korrektur):** Von diesen Readern wird real nur **`v_faelle_mit_aktuellem_termin`** abgefragt. `v_claim_full` taucht nur als Kommentar in get-kunde-faelle.ts:7 auf; `faelle_kunde_view`/`faelle_sv_view` werden von keinem der 8 gelesen. Der **4-View-Repoint (50.3 AK 3.1) ist ein globaler Plan** (alle 4 sourcen heute `f.fahrzeug_*`, s. §5/Verify) — aber er „trägt" nicht alle 8 Reader; die Reader hängen an `v_faelle_mit_aktuellem_termin`.

### Writer (5) — **keiner berührt heute `vehicles` oder `*.vehicle_id`**
| File | Trigger | heute | 50.0-Eingriff |
|---|---|---|---|
| `app/upload/zb1/[token]/actions.ts` | ZB1-OCR | `leads.fin`+Snapshot (:163-179) | **AK 0.1** ensureVehicleFromFin → `leads.vehicle_id` |
| `lib/cardentity/enrich-fahrzeug.ts` | Cardentity-FIN-Enrich | `from(table).update` (:82), `table∈{leads,faelle}` | **AK 0.2** Lead-Zweig → `leads.vehicle_id`; **Fall-Zweig → erst `faelle.claim_id` auflösen, dann `claims.vehicle_id`** (kein faelle.vehicle_id!) |
| `app/faelle/[id]/_actions/stammdaten.ts` (`saveFinVin`) | manuelle FIN | `faelle.update({fin_vin,fin_quelle,fin_extrahiert_am})` (:355-362) | **AK 0.3** → `faelle.claim_id` auflösen (Pattern aus `updateFallField` :189-194), dann `claims.vehicle_id` |
| `lib/leads/convert-lead-to-claim.ts` | Lead-Konversion | propagiert `lead.vehicle_id` (immer NULL) → claims :206 / claim_parties :357 / cvi :419 | **AK 0.4** Fallback-Upsert wenn `lead.fin` da, kein vehicle_id → alle drei Surfaces füttern |
| `app/dispatch/leads/[id]/_actions/stammdaten.ts` | manuelle Lead-Edit | field-agnostischer Allowlist-Bulk-Update (:131); `vehicle_id` **nicht** in Allowlist | optional — braucht einen **fin-gekeyten Hook**, keine Zeile im Bulk-Update |

---

## 4 · Spalten-Domänen-Mapping (24 faelle-Spalten, live verifiziert)

| faelle-Spalte | Domäne | Ziel | Status |
|---|---|---|---|
| kennzeichen | vehicle | `vehicles.kennzeichen_aktuell` | RPC ✓ |
| fahrzeug_hersteller | vehicle | `vehicles.hersteller` | RPC ✓ |
| fahrzeug_modell | vehicle | `vehicles.modell_haupttyp` | RPC ✓ |
| fahrzeug_typ | vehicle | `vehicles.bauart` | UPDATE (nicht in RPC) |
| fahrzeug_baujahr (**int**) | vehicle | `vehicles.baujahr_monat` (**date**) | UPDATE + **int→date Cast** (50.1) |
| fahrzeug_farbe | vehicle | `vehicles.farbe_klartext` | UPDATE |
| **lackfarbe_code** | vehicle | **`vehicles.farbcode`** (Entscheidung 3) | UPDATE — **bestehende Spalte, kein ADD**; 1 Reader (email/flows) |
| fin_vin (faelle) / fin (leads) | vehicle | `vehicles.fin` (RPC-Pflichtparam) | RPC ✓ |
| hsn / tsn | vehicle | `vehicles.hsn` / `.tsn` | RPC ✓ |
| erstzulassung (**text**) | vehicle | `vehicles.erstzulassung` (**date**) | UPDATE + **text→date Cast/Parse** (50.1) — faelle ist text *weil* es Freitext hält; COALESCE-Fallback bei nicht-parsebar |
| kilometerstand | vehicle | `vehicles.aktueller_kilometerstand` | RPC ✓ |
| **kennzeichen_buchstaben** | vehicle | **kein Pendant** → 50.1 ADD **oder** aus `kennzeichen_aktuell` ableiten | 50.1 |
| **fahrzeug_ausstattung** (jsonb) | vehicle | **kein Pendant** → 50.1 ADD `jsonb` | 50.1 |
| **fin_quelle / fin_extrahiert_am** | vehicle (Provenance) | **kein Pendant** → 50.1 ADD **oder** claims-Metadaten | 50.1 |
| leasinggeber_name | business | **`claims.leasinggeber_name`** (NEU, 1:1) — live FEHLT → 50.2 ADD | 50.2 |
| bank_name | business | **`claims.finanzierung_bank`** (NEU, **bewusste Umbenennung** bank_name→finanzierung_bank) — live FEHLT → 50.2 ADD | 50.2 |
| **ist_fahrzeughalter** | halter | `claim_parties.ist_halter` (**existiert**) | **→ SP-C/CMM-63 (raus aus CMM-50)** |
| **firma_name** | halter | `claim_parties.firma` (**existiert**) | **→ SP-C/CMM-63** |
| **ust_id** | halter | `claim_parties.ust_id` (**existiert**) | **→ SP-C/CMM-63** |

**Verbleibender CMM-50-Scope:** ~11 vehicle-Spalten (nur **4 Schema-Lücken** nach Entscheidung 3: `kennzeichen_buchstaben`, `fahrzeug_ausstattung`, `fin_quelle`, `fin_extrahiert_am`; 2 davon brauchen **Casts**: baujahr int→date, erstzulassung text→date) + **2 business→claims** (`leasinggeber_name` 1:1, `bank_name`→`finanzierung_bank` umbenannt — beide ADD, Ziele fehlen live). **Halter (3) ist delegiert.**

### Halter-Delegation — Caveat (kein Greenfield!)
`claim_parties` hat die Ziel-Spalten **bereits**: `ist_halter`, `firma`, `ust_id`, `ist_gewerbe`, `vehicle_id` (live verifiziert). **Und sie werden bei Lead-Konversion schon teilweise befüllt** — `convert-lead-to-claim.ts:350-352` snapshottet `lead.ist_fahrzeughalter` → `claim_parties(geschaedigter).ist_halter`. **SP-C3 betrifft also den Relocate der faelle-Edit-Pfad-Snapshot-Spalten** (`faelle.ist_fahrzeughalter`/`firma_name`/`ust_id`), **nicht** den Konversions-Write. **Caveat:** [CMM-63](https://linear.app/aaroncmndo/issue/CMM-63) (SP-C) ist auf **`Done`** gesetzt (nur SP-C1 kunde_id-Ownership fertig) — seine Description listet **SP-C3 Halter** noch als offen. → **Für Aaron:** CMM-63 wieder öffnen (SP-C3) oder neues SP-C3-Issue. (CMM-50 liefert nur das Mapping.)

---

## 5 · Re-Sequenzierung — 50.0 (Feature) → 50.1/50.2/50.3 (Migrations-Tail)

### CMM-50.0 — Write-Path verdrahten · **eigenständiges Produkt-Feature (Entscheidung 4), rein additiv, kein Reader/View berührt**
`upsert_vehicle_by_fin` an den FIN-Gewinnungs-Punkten rufen + `vehicle_id` propagieren. Verhaltens-additiv → **null Regressionsrisiko, sofort shippbar unabhängig vom faelle-Drop.**
- **Helper** `ensureVehicleFromFin({ fin, snapshot, ownerId?, db })` (neu, `src/lib/vehicles/ensure-vehicle.ts`): wraps RPC, Result-Object `{ ok, vehicleId?, error? }`, non-critical try/catch. Owner-Auflösung pro Call-Site (§2). JSDoc: vehicle-Link-Konvention (Task 0.3).
- **AK 0.1 ZB1-OCR** (`upload/zb1/[token]/actions.ts`): nach FIN-Gewinnung → `ensureVehicleFromFin` (ownerId=undefined) → `leads.vehicle_id`.
- **AK 0.2 Cardentity** (`enrich-fahrzeug.ts`, table-parametrisiert): **Lead-Zweig** → `leads.vehicle_id` direkt; **Fall-Zweig** → **erst `faelle.claim_id` auflösen** (kein faelle.vehicle_id), dann `claims.vehicle_id`. ⚠ Per-Zweig-Asymmetrie. ⚠ Datei nutzt heute Legacy-`{ success }`-Shape — Helper-`{ ok }` an der Call-Boundary adaptieren (oder Datei mitmigrieren, AGENTS.md „konsistent pro File").
- **AK 0.3 Manuelle FIN** (`saveFinVin`): nach `fin_vin`-Write → **`faelle.claim_id` auflösen** (Pattern aus `updateFallField` :189-194 — saveFinVin macht den Hop heute NICHT) → `ensureVehicleFromFin` → `claims.vehicle_id`.
- **AK 0.4 Lead-Konversion** (`convert-lead-to-claim.ts`): wenn `lead.vehicle_id` leer aber `lead.fin` da → `ensureVehicleFromFin` (ownerId=Kunde-user_id); dann **alle drei Surfaces** (claims.vehicle_id :206, claim_parties geschaedigter.vehicle_id :357, cvi rolle='geschaedigt' :419). `leads.fin` (nicht fin_vin).
- **AK 0.5 Backfill** (`apply_migration`): bestehende leads/claims mit fin aber ohne vehicle_id → vehicles-Row + vehicle_id (IS-NULL-guarded; live ~1 Datensatz). File == recorded version.
- **AK 0.6 Verify:** neuer FIN-Lead → konvertierter Claim hat `vehicles`-Row + `claims.vehicle_id` + `claim_parties.vehicle_id` + `cvi`-Row (Smoke + DB-Read).

### CMM-50.1 — vehicles Schema-Lücke (DDL via Plugin) — **nur 4 Spalten (lackfarbe raus)**
- **AK 1.1:** `ALTER TABLE vehicles ADD COLUMN`: `kennzeichen_buchstaben text` (oder ableiten), `fahrzeug_ausstattung jsonb`, `fin_quelle text`, `fin_extrahiert_am timestamptz`. Begründung je Spalte im Header. **`lackfarbe_code` → `vehicles.farbcode` (kein ADD).**
- **AK 1.2 Casts:** `fahrzeug_baujahr` (int) → `baujahr_monat` (date) **und** `erstzulassung` (text) → `vehicles.erstzulassung` (date) — Parse/Cast-Strategie + COALESCE-Fallback bei nicht-parsebarem Freitext.
- **AK 1.3 Snapshot-Verdrahtung:** RPC erweitern **oder** Helper macht Secondary-`UPDATE` für farbcode/farbe_klartext/bauart/baujahr_monat/erstzulassung. Achtung: `aktueller_kilometerstand_at` wird von der RPC gesetzt — Secondary-UPDATE darf es nicht clobbern. Helper `ensureVehicleFromFin` entsprechend ausbauen.

### CMM-50.2 — Business-Domänen-Split (DDL: 2 neue claims-Spalten) — Halter delegiert
- **AK 2.1:** `claims.leasinggeber_name` (1:1 aus faelle.leasinggeber_name) + `claims.finanzierung_bank` (**aus faelle.bank_name — bewusste Umbenennung; KEIN `claims.bank_name` anlegen!**) **ADD** (beide live FEHLEND — CMM-65 deckte sie NICHT ab) + Backfill aus faelle.
- **AK 2.2:** Writer `leasinggeber_name`/`bank_name` (lead-fall-mapping, stammdaten) → claims statt faelle. revalidatePath nachziehen.
- **AK 2.3 (delegiert):** Halter → `claim_parties` = **SP-C/CMM-63-Folge (SP-C3), NICHT CMM-50.** Mapping §4. Aaron-Klärung: CMM-63 reopen vs neues Issue.

### CMM-50.3 — Reader-Relocate + View-Repoint (= Phase 4.2 Fahrzeug-Anteil) — **Gate: 50.0 live + vehicles befüllt**
- **AK 3.1 Views:** 4 Views (`v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) sourcen Fahrzeug-Spalten aus `vehicles` via `LEFT JOIN vehicles ON vehicles.id = c.vehicle_id` (COALESCE-Fallback auf `f.fahrzeug_*` bis faelle-Drop). **Verify-Befunde (live pg_views):**
  - Alle 4 sourcen heute `f.fahrzeug_*`, **0** referenzieren `vehicles` → Repoint für alle 4 echt pending.
  - **`v_faelle_mit_aktuellem_termin` trägt den vollen 10-Spalten-Snapshot** (inkl. fahrzeug_farbe, erstzulassung, kilometerstand, fahrzeug_ausstattung, lackfarbe_code) — die anderen 3 nur 4 Spalten. Hier alle 10 repointen, inkl. 50.1-Gap-Spalten + `lackfarbe_code`→`farbcode`.
  - **Template:** `v_claim_listing` macht den Join bereits (`LEFT JOIN vehicles v ON v.id=c.vehicle_id`, `v.kennzeichen_aktuell AS kennzeichen`) — als Vorlage zitieren (ist aber NICHT einer der 4).
  - Join-Key `c.vehicle_id` ist in allen 4 als Passthrough verfügbar. **Join-Richtung unterschiedlich:** `v_claim_full` = `FROM claims c LEFT JOIN faelle f`; die anderen 3 = `FROM faelle f LEFT JOIN claims c`.
  - **CREATE OR REPLACE auf der AKTUELLEN Shape** (Migration `20260528192402` droppte `claims.phase` + baute 6 Views auf `v_claim_phase`/`main_phase`/`sub_phase` um) — sonst regrediert der Phase-Tail. `security_invoker=false` + Grants (Phase-4.1-Template).
- **AK 3.2 direkte Reader:** **4** direkte Reader (`get-kunde-faelle.ts`, `email/google/flows.ts`, `kanzlei/push-mandat.ts`, **`makler/copilot-prompt.ts`**) auf vehicles via vehicle_id. (Re-grep zur Sicherheit — Inventar ist kuratiert.)
- **AK 3.3:** Pre/Post-Parity (View-Output) + Portal-Smoke (SV-Besichtigung, Kunde „mein Auto", Admin, Makler) — Fahrzeug-Anzeige byte-gleich.

---

## 6 · Risiken

| Risiko | Mitigation |
|---|---|
| Reader auf leere SSoT → Fahrzeugdaten weg | **50.0 zuerst**; 50.3 erst nach befüllter SSoT; COALESCE-Fallback auf faelle-Snapshot in Views |
| RPC schreibt nur 8 Felder → Snapshot-Verlust | Helper Secondary-UPDATE **oder** RPC-Erweiterung in 50.1 (§2/AK 1.3); `aktueller_kilometerstand_at` nicht clobbern |
| Fall-side Writer haben nur fallId, kein faelle.vehicle_id | enrich(Fall)/saveFinVin lösen erst `faelle.claim_id` auf (updateFallField-Pattern), dann claims.vehicle_id |
| vehicle_id 3-fach (claims + claim_parties + cvi) inkonsistent | Helper hält für Geschädigt **alle drei** Surfaces synchron (s. Task 0.3); Gegner/weitere nur über cvi + claim_parties(rolle) |
| Halter-Domäne ohne aktives Ticket (CMM-63 = Done) | Aaron-Klärung: CMM-63 SP-C3 reopen vs neues Issue; claim_parties wird bei Konversion bereits teilbefüllt |
| business-Ziele auf claims fehlen + Rename-Falle | 50.2 ADD `leasinggeber_name` (1:1) + `finanzierung_bank` (aus bank_name); **kein claims.bank_name anlegen** |
| erstzulassung text→date Cast schlägt fehl | Parse + COALESCE-Fallback (faelle.erstzulassung hält Freitext) |
| Write-Path berührt sensible Flows (Konversion, OCR) | Jede Sub-Phase eigener PR + Smoke; non-critical try/catch um `ensureVehicleFromFin` |
| `leads.fin` vs `faelle.fin_vin` Naming-Asymmetrie | Helper nimmt FIN als Param; Call-Sites lesen die jeweils richtige Spalte |
| Inventar kuratiert (89 fahrzeug-Refs / 222 from('faelle')) | 50.3-Implementierung: paren-balanced re-grep der direkten fahrzeug-Reads |

---

## 7 · Quellen
- Linear [CMM-50](https://linear.app/aaroncmndo/issue/CMM-50) · [CMM-63](https://linear.app/aaroncmndo/issue/CMM-63) (SP-C, Done — SP-C3 Halter offen) · [CMM-65](https://linear.app/aaroncmndo/issue/CMM-65) (Done — business-Felder NICHT abgedeckt) · [CMM-49](https://linear.app/aaroncmndo/issue/CMM-49) (faelle DROP, blockedBy CMM-50)
- Audit-Workflow `wf_82364751-2a5` · **Verify-Workflow `wf_093f7c2e-763`** (write-path/reader/views/db-facts + Kritiker, alle Befunde file:line) · Probe `scripts/probe-cmm50-vehicles.mjs`
- RPC `supabase/migrations/20260425120400_aar773_upsert_vehicle_by_fin_rpc.sql` · vehicles-Setup `20260425120000..120300` · cvi `20260425150200` · aktuelle View-Shape `20260528192402_cmm44_mp6c_drop_claims_phase.sql`
- Audit-Doc `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` §R.4/§R.5 · Memory `project_cmm50_vehicles_scoping`
