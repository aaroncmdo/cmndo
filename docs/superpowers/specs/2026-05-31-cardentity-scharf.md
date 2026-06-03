# Cardentity scharf stellen — manuell-only + claim/vehicle-gebunden (CMM-64 PR2)

**Datum:** 2026-05-31 · **Branch:** `kitta/cmm64-cardentity-scharf` (off staging)
**Bezug:** CMM-64 PR2 (Writer) — baut auf PR1-Schema (#2085, live).
**Aaron-Entscheidungen (31.05.):** Creds gesetzt (verifiziert: OAuth-Token erhalten) · Datenziel = voll claim/vehicle-gebunden · UX = Bestätigungs-Dialog (~15€) · **kein Auto-Fire, nur manuell** · Trigger an dispatch/KB/admin/SV · **EIN Button macht beides**: erst Fahrzeugdaten (Enrich), dann Vorschaden-Check — auf einen manuellen Klick.

## Kern-Insight: ein Report-Pull = beides
`enrich-fahrzeug` (Fahrzeug-Stammdaten) UND `typ-b` (Vorschaden) rufen denselben `getVehicleReport`. Ein einziger (kostenpflichtiger) Pull liefert `make/model/equipment` (Fahrzeugdaten) **und** `events` (Vorschäden). → Eine unifizierte Aktion, ein Call, beide Outcomes. Kein Doppel-Call, keine Doppel-Kosten.

## ⚠️ Kostenleck (Anlass)
Beide Familien feuerten bisher automatisch bei FIN. `enrich` (8 Sites) ruft den **echten kostenpflichtigen** Report — war nur stumm, weil Creds fehlten. Mit Creds live würde jede FIN automatisch ~15€ auslösen. Deshalb: ALLE 11 Auto-Fire-Sites raus.

---

## 0 · Ist-Zustand (empirisch)

- **Auto-Fire (weg):** 3 Sites feuern Typ-A sobald FIN da: `api/ocr-fahrzeugschein/route.ts:138-147`, `gutachter/fall/[id]/actions.ts:469-478`, `lib/actions/konvertiere-anfrage-zu-fall.ts:387-401`. Plus interne Kette `api/cardentity/typ-a/route.ts:68-77` (Typ-A→Typ-B).
- **Mock:** NUR die beiden Routen `api/cardentity/typ-a/route.ts` + `typ-b/route.ts` (FIN-Hash). Werden **ausschließlich** vom Auto-Fire erreicht.
- **Manueller Pfad (bleibt):** `CardentityTypBButton` an dispatch Phase4 (Lead), admin/KB-Fallakte, SV-Fallakte → ruft `requestCardentityTypB` aus `lib/cardentity/typ-b.ts` → nutzt **echten** Client `client.ts` (`getVehicleReport`). Der echte Pfad existiert also schon — schreibt aber noch nach `faelle`.

## 1 · Änderungen

### A — Alle 11 Auto-Fire-Sites entfernen + Mocks löschen
**Vorschaden Typ-A (3):** `api/ocr-fahrzeugschein/route.ts:137-147`, `gutachter/fall/[id]/actions.ts:469-478`, `lib/actions/konvertiere-anfrage-zu-fall.ts:387-401` + interne Typ-A→Typ-B-Kette in `api/cardentity/typ-a/route.ts`.
**Enrich (8):** `faelle/[id]/_actions/stammdaten.ts:417-421`, `lib/leads/convert-lead-to-fall.ts:177-184`, `lib/actions/dispatch-fall-actions.ts:309-318`, `app/flow/[token]/actions.ts` (Action prüfen/umbauen), `app/upload/zb1/[token]/actions.ts:202-208`, `app/upload/dokumente/[token]/actions.ts:449-454`, `api/webhooks/twilio/inbound/route.ts:460-462`.
**Löschen:** `api/cardentity/typ-a/route.ts` + `typ-b/route.ts` (Mock, nach Entkopplung tot). `lib/cardentity/typ-b.ts` + `lib/cardentity/enrich-fahrzeug.ts` (durch unified action ersetzt — alle Caller rewired).

### B — Unified Action `lib/cardentity/run-full.ts`
`runCardentityCheck(scope:'fall'|'lead', id)` — EIN Report-Pull, beide Outcomes, claim/vehicle-gebunden:
1. Resolve FIN + claim_id (fall: `faelle.fin_vin`+`claim_id`; lead: `leads.fin`, wenn Fall existiert → delegiere an fall).
2. **Idempotenz:** claim→`claims.vehicle_id`→`vehicles.cardentity_report.typB` (bzw. lead.cardentity_report) → cached zurück, kein €-Re-Call.
3. `getVehicleReport(fin)` — **ein** Call.
4. **Fahrzeugdaten zuerst:** `ensureVehicleFromFin({fin, snapshot:{hersteller=make, modell=model, erstzulassung=firstRegistrationDate, ausstattung=equipment}, db})` → `vehicleId`; `claims.vehicle_id`/`leads.vehicle_id` setzen wenn leer.
5. **Dann Vorschaden:** `vehicles.update({cardentity_report:{...report,fetchedAt,typB:true}, cardentity_letzter_pull})`; `vehicle_vorschaeden` (quelle='cardentity') delete+reinsert (1 Row/Event); `claims.update({hat_vorschaeden, vorschaden_geprueft:true, vorschaden_erkannt})` via claim_id. Lead-ohne-Claim: `leads`-Flags + vehicle.
6. Timeline-Insert (`fall_id`) bleibt (Phase-6-Re-Key).
7. Alle vehicle/claims/lead-Writes **non-fatal** (try/catch+log, [[feedback_dead_code_activation]]).
8. Rückgabe: `{success, alreadyFetched, fetchedAt, vehicleFieldsUpdated[], vorschadenVorhanden, vorschadenAnzahl, letzterVorschadenDatum}`.

Per-Portal-Wrapper (Rollen-Guard, claim-gebunden):
- `faelle/[id]/_actions/dokumente.ts` → `runCardentityForFall` (admin/KB-Guard) — ersetzt `requestCardentityTypBForFall` + `triggerFinCallForFall`.
- `gutachter/fall/[id]/cardentity-actions.ts` → `runCardentityForFallSv` (SV-Guard, claim-gebunden).
- `dispatch/leads/[id]/_actions/cardentity.ts` → `runCardentityForLead` (dispatch/KB/admin-Guard) — ersetzt `requestCardentityTypBForLead` + `enrichLeadCardentity`.

### C — Ein Button `components/cardentity/CardentityButton.tsx`
Ersetzt `CardentityTypBButton`. Label „Fahrzeugdaten & Vorschäden abrufen". Klick → `window.confirm('Kostenpflichtige Abfrage (~15 €): Fahrzeugdaten + Vorschäden jetzt abrufen?')` → `action()`. Ergebnis: Fahrzeug-Felder aktualisiert + Vorschaden-Ampel. Idempotent (cached-Anzeige). Call-Sites: dispatch Phase4, `faelle/Sections.tsx`, gutachter `StammdatenCard.tsx`.

## 2 · Verifikation
- `npx tsc --noEmit` grün.
- Real-API-Probe: `getVehicleReport(TEST_FIN)` gegen `api.cardentity.eu` (Token live verifiziert).
- DB: nach manuellem Trigger auf einem Test-Fall → `claims`-Flags gesetzt + (falls vehicle) `vehicle_vorschaeden`-Rows + `vehicles.cardentity_report`. `faelle.vorschaden_*` wird **nicht** mehr geschrieben.
- Kein `.from('faelle').update` mit vorschaden_* mehr im Code (grep).

## 3 · Env / Deploy (Aaron)
- Lokal `.env.local`: `CARDENTITY_CLIENT_ID` + `CARDENTITY_CLIENT_SECRET` gesetzt (verifiziert).
- **prod+staging (VPS):** dieselben 2 Zeilen in `/etc/claimondo/.env.local` ergänzen + `pm2 reload claimondo-v2 --update-env` (+ `-staging`). VPS macht Aaron (lokaler Claude fasst VPS nicht an).
- Secret rotieren empfohlen (lief durch Chat).

## 4 · Scope-Grenzen
- Vorschaden-Reader/Views (PR3) NICHT hier — separat.
- `vehicle_vorschaeden`-1:N voll nutzbar; Aggregat-Reader (count/max) kommt mit PR3.
- Onboarding-Wizard-Conditional (`vorschaden_check_status`) verliert Auto-Befüllung — gewollt (manuell-only).
