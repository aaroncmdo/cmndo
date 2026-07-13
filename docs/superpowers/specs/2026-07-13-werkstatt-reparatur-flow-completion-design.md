# Werkstatt-Reparatur-Flow-Completion — Design (2026-07-13)

**Lane:** 6f60c510 (aus PROGRAM-6f60c510-flowlink-werkstatt-abrechnungsweg, Fäden #3 Task 12 + #4).
**Herkunft:** Aaron routete Task 12 (HP-Flow-Touch) + AN-38ffe1c4 (Werkstatt-Picker/freie-Wahl) in diese Lane (13.07.).

## Ziel
Drei kleine, unabhängige Ergänzungen, die die Werkstatt-/Reparatur-Strecke abrunden — je **eigener PR**, alle **strikt additiv**, off `staging`.

## Ground Truth (verifiziert 13.07., nicht den 2-Tage-alten Markern geglaubt)
- Der Flow-`'werkstatt'`-Step (`FlowWerkstattStep`, Picker + Wunschtermin) lebt **auf `origin/staging`** (Commit `087b48ec9`), nicht auf einer fremden aar-956-Hotzone. `FlowWizardKfz.tsx` divergiert **0 Commits** von origin/staging. → kein Trample-Risiko.
- **Haftpflicht erreicht den Werkstatt-Step NIE:** `quali-flow-outcome.ts:51-53` gibt für `gegner` (haftpflicht) `reparaturwunsch=null`; der Step-Gate `brauchtWerkstattVermittlung` (`vermittlung-core.ts:26`) verlangt `reparaturwunsch ∈ {reparatur, fiktiv}`. Der Step ist exklusiv **Selbstzahler/Kasko** (beide → `reparaturwunsch='reparatur'`).
- `resolveAbrechnungsweg({schuldfrage, ueberEigeneVersicherung})` (`src/lib/werkstatt/abrechnungsweg.ts`) ist die client-safe SSoT; im Lead-Stage aus Lead-Determinanten ableitbar (kein Claim nötig).
- Kunde-Detail: `WerkstattFinderCard` (Picker) + `WerkstattCard` (Karte) existieren in `GeldZone.tsx:48/50`; `TeamZone.tsx` zeigt aktuell nur SV + KB, **keine** Werkstatt.
- `leads.freie_werkstattwahl` existiert (Mig `20260708185733`); `claims.freie_werkstattwahl` **fehlt**. Trigger `set_reparatur_werkstatt_from_qr` v2 (`20260707154946`) feuert auf `werkstatt_id NOT NULL AND reparaturwunsch IS DISTINCT FROM 'fiktiv' AND reparatur_werkstatt_id IS NULL` + Test-Guard.

## Teil 1 — Task 12: Haftpflicht-Werkstatt-Hinweis (Flow)
**Was:** Da HP nichts zur Werkstatt sieht, eine **read-only Hinweis-Card** ergänzen (kein Picker-Ersatz).
- **Neu:** `src/app/flow/[token]/FlowWerkstattHinweisHaftpflicht.tsx` — read-only Card, Tokens (`rounded-ios-*`, `text-claimondo-navy/ondo`). Copy:
  - QR-/mitgegebene Werkstatt vorhanden → „Deine Werkstatt **{Name}** übernimmt die Reparatur nach dem Gutachten."
  - sonst → „Nach dem Gutachten vermitteln wir dir eine passende Werkstatt — oder du nennst uns deine eigene."
- **Modify:** `src/app/flow/[token]/FlowWizardKfz.tsx` — im **`currentStep.id === 'sa'`-Render** die Card **oberhalb** des SA-Inhalts einblenden, **nur wenn** `resolveAbrechnungsweg(...)==='haftpflicht'`. **KEIN neuer STEPS-Eintrag** (Aaron-Entscheidung „eigene Card vor SA" → als Element im SA-Step, nicht als Step → null Stale-Index-Risiko).
- **Gating-Daten:** `schuldfrage` (schon als `initialSchuldfrage`/`schuldfrageWahl` im Wizard) + `ueber_eigene_versicherung`; `gegner ⇒ haftpflicht` genügt. Werkstatt-Name: nur falls `werkstatt_id` gesetzt (Server-Prop, optional — sonst generische Copy).
- **Kein Write-Pfad.** Skip = nichts.

## Teil 2 — #4a: `claims.freie_werkstattwahl` (DDL)
- **DDL (Supabase-Plugin, Regel 2):** `ALTER TABLE claims ADD COLUMN freie_werkstattwahl boolean` (null=unbekannt, true=freie Wahl, false=Versicherer-gebunden — analog leads).
- **Trigger:** neue Forward-Migration ersetzt `set_reparatur_werkstatt_from_qr()` → Condition um `AND NEW.freie_werkstattwahl IS NOT TRUE` ergänzen (kein Auto-qr_referral-Reparateur, wenn Kunde frei wählen will). `RAISE WARNING` statt `EXCEPTION` bei etwaigen Guards (Preview-Fragilität, s. halter-repoint).
- **convert-lead-to-claim:** `freie_werkstattwahl` vom Lead auf den Claim-Insert durchreichen (fehlt aktuell).
- **Views:** `freie_werkstattwahl` dort projizieren, wo `reparatur_*`-Felder schon exponiert werden (verifizieren; minimal halten).
- **Koordination:** DDL-Marker; Trigger ist geteilte Fläche → vor Merge kurz mit werkstatt-Lanes abstimmen.

## Teil 3 — #4b: Vermittelte Werkstatt als Team-Kontakt (TeamZone)
**Was:** Aaron „analog zum Sachverständigen" = die vermittelte Werkstatt **zusätzlich** als Kontakt-Row in `TeamZone.tsx` (Name / „Deine Werkstatt" / Telefon), gespeist aus vorhandenem `vm.werkstatt.data`. Picker+Karte in GeldZone bleiben.
- **Modify:** `src/components/kunde/claim-view/TeamZone.tsx` — Werkstatt-Kontakt-Row analog SV-Row (nutzt das etablierte `FallKontakteCard`/Kontakt-Row-Muster), Gate `{vm.werkstatt.data && …}`.
- **Datenquelle:** `vm.werkstatt.data` (name/adresse/telefon) liegt schon im ViewModel (`kunde-claim-view.ts:384-418`).
- **KO-Owner:** `62dd5486` besitzt die Zonen-Files (GeldZone/TeamZone) und ist aktiv → TeamZone-Touch mit ihnen abstimmen (Marker), strikt additiv.

## Testing
- **Task 12:** Unit für die Gate-Ableitung (haftpflicht→Card sichtbar; selbstzahler/kasko→nicht; gegner ohne werkstatt_id→generische Copy). Prod-Playwright-Smoke eines HP-Flows (Broadcast-Mandat).
- **#4a:** Trigger-Verhalten via `execute_sql`-READ (freie_werkstattwahl=true ⇒ kein Auto-Reparateur; NULL/false ⇒ wie bisher). convert-Passthrough-Unit.
- **#4b:** Prod-Smoke Kunde-Detail (vermittelte Werkstatt erscheint in TeamZone + GeldZone).

## Out of Scope
- Werkstatt-Picker im Kunde-Portal neu bauen (existiert, #4084).
- reparatur_werkstatt-Modell (Vermittler↔Reparateur) ändern (läuft korrekt via Trigger).
- `WerkstattAnfragen.tsx` hergang-Reconcile + `werkstatt_intake_*` (separate, minor — 38ffe1c4-Items 4/5).

## PR-Schnitt
3 PRs → staging: (1) Task 12 + diese Spec · (2) #4a DDL · (3) #4b TeamZone. Jeder mit 7-Punkte-Audit.
