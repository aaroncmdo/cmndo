# Vehicle-FIN-Unifikation — Design

Stand: 2026-07-21
Status: Design (approved Aaron: „das passt"). Noch nicht implementiert.
Branch/Worktree: `kitta/vehicle-fin-unifikation` (aus `origin/staging`).

## Problem / Kontext

`vehicles` ist die kanonische Fahrzeug-SSoT (CMM-50/68). Der zentrale Write-Path `src/lib/vehicles/ensure-vehicle.ts` dedupliziert FIN-keyed (`ensureVehicleFromFin`, `ON CONFLICT(fin)`). ABER:

- Die **manuelle** Flotten-Anlage (`addFahrzeugToFlotte` → `createVehicleStub`) legt **FIN-lose Stubs** an (nur Kennzeichen/Hersteller/Modell). Der **ZB1-Fahrzeugschein-Scan-Pfad macht es bereits richtig** (`zb1-batch-anlage.ts:65-68`: FIN → `ensureVehicleFromFin`, sonst Stub) — nur die manuelle Form ist die Lücke.
- Kommt später eine FIN rein (Claim + ZB1-OCR), erzeugt `ensureVehicleFromFin` eine **separate** FIN-Row und der Caller hängt `claims.vehicle_id` darauf um → **verwaist den Stub**. `flotten_fahrzeuge` + `schadenkarten.fahrzeug_id` zeigen weiter auf den Stub → **zwei `vehicles`-Rows fürs selbe Auto**, Flotte↔Claim nicht unifiziert.

## Scope

- **A1** — manuelle Flotten-Anlage FIN-fähig machen (Lücke schließen, Muster wie ZB1).
- **A2** — Stub→FIN-Merge „sobald die FIN da ist" (die offene „Cleanup = Folge").

**Nicht in Scope:** Cardentity-Enrich (bewusst raus, Aaron; Cardentity eh 401-tot). Der ZB1-Pfad (schon korrekt). Sub-Projekt B (Foto-Zustandsdoku, eigener Spec).

## A1 — Manuelle Anlage FIN-fähig (klein, kein DB-Change)

- `FahrzeugForm` (`src/lib/kunde/firma-flotte.ts`) um optionale `fin?`/`hsn?`/`tsn?` erweitern.
- `addFahrzeugToFlotte` (`src/lib/flotte/mutate-flotte.ts`): FIN vorhanden **und** 17-Zeichen-gültig (`VIN_REGEX` aus `ensure-vehicle.ts`-Muster) → `ensureVehicleFromFin({ fin, snapshot: { kennzeichen, hersteller, modell, hsn, tsn } })` (dedup) → dann `bindeVehicleAnFlotte`. Sonst → `createVehicleStub` (Status quo). **Exakt das Verzweigungsmuster von `zb1-batch-anlage.ts:65-68`.**
- UI: FIN/HSN/TSN-Felder (optional) in die „Fahrzeug hinzufügen"-Form — Flottenmanager (`FlotteClient`) + Admin (`FirmenFlotteDetailClient` „Fahrzeuge"-Add).
- Ergebnis: manuelle Anlage mit FIN erzeugt/findet die kanonische FIN-Row statt eines Stubs. **Wenn** die FIN eine bereits existierende Row trifft → A2-Merge greift (Stub, der evtl. schon in der Flotte lag, wird absorbiert).

## A2 — Stub→FIN-Merge

### Merge-RPC (Migration via Supabase-Plugin, Regel 2)

`merge_stub_vehicle(p_stub uuid, p_target uuid) RETURNS void`, `SECURITY DEFINER`, `EXECUTE` nur für `service_role` (interne Wartungs-Op, kein anon/authenticated). Ablauf atomar in EINER Transaktion:

1. **Guards** (sonst `RAISE EXCEPTION`): `p_stub <> p_target`; `p_stub`-Row existiert mit `fin IS NULL` (echter Stub); `p_target`-Row existiert mit `fin IS NOT NULL`. Verhindert das Mergen zweier echter Fahrzeuge.
2. **Re-Point aller 10 FK-Tabellen** `stub → target`. 6 ohne Unique = plainer `UPDATE`. 4 mit Unique-Konflikt-Risiko = konflikt-sicher (erst kollidierende Stub-Rows auflösen, dann `UPDATE`):

   | Tabelle | Spalte | Unique | Handling |
   |---|---|---|---|
   | claims | vehicle_id | — | `UPDATE … SET vehicle_id=target WHERE vehicle_id=stub` |
   | claim_parties | vehicle_id | — | plain UPDATE |
   | claim_mietwagen | vehicle_id | — | plain UPDATE |
   | leads | vehicle_id | — | plain UPDATE |
   | repairs | vehicle_id | — | plain UPDATE |
   | vehicle_vorschaeden | vehicle_id | — | plain UPDATE |
   | claim_vehicle_involvements | vehicle_id | `UNIQUE(claim_id,vehicle_id)` | `DELETE` Stub-Rows, für die `(claim_id,target)` schon existiert; dann UPDATE Rest |
   | flotten_fahrzeuge | vehicle_id | `UNIQUE(firma_id,vehicle_id)` | `DELETE` Stub-Rows, für die `(firma_id,target)` schon existiert; dann UPDATE Rest |
   | schadenkarten | **fahrzeug_id** | partial `UNIQUE(fahrzeug_id) WHERE status='gebunden'` | Nicht-'gebunden' plain UPDATE; 'gebunden' Stub-Karte: hat target schon eine 'gebunden' → Stub-Karte auf `status='ersetzt'` setzen (Record + Historie bleiben, Partial-Unique erfüllt) UND `fahrzeug_id=target`; sonst plain UPDATE |
   | vehicle_ownership_history | vehicle_id | partial `UNIQUE(vehicle_id) WHERE bis IS NULL` | hat target schon eine aktive (`bis IS NULL`) → Stub-Row `bis=now()` schließen; dann UPDATE |

3. **`DELETE FROM vehicles WHERE id = p_stub`** — nach dem Re-Point ist der Stub referenzlos (RESTRICT-FKs claims/involvements sind umgehängt; CASCADE-FKs sind umgehängt, würden sonst mitgelöscht).

Idempotent: zweiter Aufruf mit gedroppter Stub-id → Guard „Stub existiert nicht" → No-op (Helper schluckt das).

### Trigger — zentralisiert im Write-Path

Statt an ~13 Call-Sites bespoke Logik zu streuen: `ensureVehicleFromFin` bekommt einen **optionalen** Parameter `supersedesVehicleId?: string`. Nach dem FIN-Upsert: wenn `supersedesVehicleId` gesetzt, `≠` der resultierenden FIN-Row-id, und die supersedes-Row ein **Stub** (`fin IS NULL`) ist → `rpc('merge_stub_vehicle', { p_stub: supersedesVehicleId, p_target: finRowId })`. Non-critical (Fehler → `console.warn`, bricht nichts).

**Call-Sites** übergeben ihr aktuelles Record-Fahrzeug als `supersedesVehicleId` — **fokussiert auf die Claim/Lead-FIN-Pfade zuerst** (der Flotten-/Schadenkarten-Fall läuft genau hier durch): `ocr-fahrzeugschein/route.ts`, `faelle/[id]/_actions/stammdaten.ts` (FIN-Save), `upload/zb1/[token]/actions.ts`. Jede liest `claims.vehicle_id` (bzw. `leads.vehicle_id`) direkt vor dem `ensureVehicleFromFin`-Aufruf und reicht sie als `supersedesVehicleId` durch. Restliche Sites (`flow`, `gutachter/fall`, `vor-ort`, `admin/faelle/anlegen`) per Boy-Scout nachziehen.

**Bewusst nur CONTEXTUAL:** der Merge greift ausschließlich, wenn ein Record (Claim/Lead) EINDEUTIG auf den Stub zeigt — der Record liefert die Stub-id. **Kein Fuzzy-Kennzeichen-Matching.** Die manuelle Flotten-Anlage-mit-FIN (A1) routet nur über `ensureVehicleFromFin` (FIN-Dedup); übergibt KEINE `supersedesVehicleId` (sie kennt keinen eindeutigen Vorgänger-Stub). Folge: legt jemand dasselbe Auto erst als Stub (nur Kennzeichen) und später erneut mit FIN in die Flotte, kann kurzzeitig eine Dublette (Stub + FIN-Row) in der Flotte stehen — seltener Minor-Edge, out-of-MVP (alten Stub manuell entfernen; ein kennzeichen-basierter Reconciler ist ein separater späterer Datenlauf).

## Error-Handling / Safety

- RPC atomar (eine Transaktion) → kein halb-gemergter Zwischenzustand.
- Merge nur Stub→Real (Guards) → nie Datenverlust durch Mergen zweier echter Fahrzeuge.
- Trigger non-critical → ein Merge-Fehler bricht die FIN-Gewinnung/OCR nicht (Muster wie der restliche `ensure-vehicle.ts`-Code).
- Server-Actions/Helper: Result-Object, kein `throw`.

## Testing

- **A1:** Unit (vitest) für die `addFahrzeugToFlotte`-Verzweigung: FIN gültig → `ensureVehicleFromFin`-Pfad; ungültig/leer → `createVehicleStub` (Mock beide, Muster wie `zb1-batch-anlage.test.ts`).
- **A2 Helper:** Unit für die Guard-Logik in `ensureVehicleFromFin` (supersedes=Stub & ≠ → RPC gerufen; supersedes=Real oder = → nicht gerufen; supersedes fehlt → nicht gerufen). RPC gemockt.
- **A2 RPC:** Fixture-Smoke via `execute_sql` (READ nach Merge) auf einem **eigens angelegten Test-Trio** (Stub + FIN-Row + je 1 Referenz in flotten_fahrzeuge/schadenkarten/claims): merge_stub_vehicle rufen, dann assert: alle Referenzen zeigen auf target, Stub-Row weg. **Kein Prod-Kundendatensatz** — nur selbst angelegte Test-UUIDs, danach aufräumen.
- **Regel 4:** Prod-Smoke nach Deploy — manuelle Flotten-Anlage mit FIN (A1) + ein Claim-FIN-Fluss, der einen Flotten-Stub absorbiert (A2), via Test-Konto; Flotte↔Claim zeigen danach auf eine Row.

## Risiken

- `schadenkarten`/`ownership` Partial-Unique-Kollision = seltene Edge (Stub-Auto mit aktiver Karte/Owner UND target hat schon eine). Handling (Karte→'ersetzt', Owner-Row schließen) bewahrt Records; im PR/Marker dokumentieren.
- 13 Trigger-Sites: nur die 3 Claim-FIN-primären in diesem PR, Rest Boy-Scout → dokumentierter Teil-Rollout, kein stiller Cap.
- `schadenkarten` nicht in `database.types.ts` → `AnyDb`-Cast beibehalten.

## Out of Scope
Cardentity-Enrich; ZB1-Pfad (schon korrekt); globaler Reconciler/Backfill bestehender Alt-Stubs (eigener Datenlauf, später); Sub-Projekt B (Foto-Zustandsdoku).
