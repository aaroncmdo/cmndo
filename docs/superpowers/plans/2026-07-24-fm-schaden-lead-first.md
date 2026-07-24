# FM-Schaden lead-first Umbau — Implementation Plan

> **For agentic workers:** executing-plans task-by-task. Steps use `- [ ]`.

**Goal:** FM-initiierter „Schaden melden" erzeugt nur noch einen **Lead + FlowLink** (kein Upfront-Claim, kein schuldfrage-Vorsetzen). Die Haftpflicht/Kasko-Weiche fällt db-driven im /flow; am /flow-Ende entsteht Claim (Haftpflicht→SV) bzw. Werkstatt-Auftrag (Kasko/Selbstzahler).

**Architecture:** Zwei getrennte Einstiege auf der Achse *erzeugen vs. fortsetzen* (Spec §0): „Schaden melden" (Fahrzeug-Header) = IMMER neuer Lead; „Schaden vervollständigen" (Claim-Detail) = Resume dieses Claims via `/flow` seines Leads. Kasko-End dockt an die bestehende Reduced-Repair-Strecke (b0e963b6) an — **§4-Docking verifiziert:** `abrechnungsweg` wird db-driven vom quali-Step gesetzt, `erzeugeSelbstzahlerClaim` + `istWerkstattReparaturWeg` greifen lead-source-agnostisch. Kein Flag, keine FM-UI-Weiche nötig.

**Spec:** `memory/HANDOFF-fm-schaden-lead-first-umbau-spec.md` (Aaron 23.07., DB-verifiziert).

## Global Constraints
- Branch `kitta/fm-schaden-lead-first` (off origin/staging). PR→staging. Nie main.
- **NICHT anfassen:** `convert-lead-to-claim.ts`, `flow/[token]/self-service-actions.ts`, `flow_szenarien`/-steps (b0e963b6/aar-956 Hot-Files). Gegner-Tap bleibt claim-first.
- Kein DB-/Migrations-Change (bar-Lead = Write; #4746 Types-Regen NICHT nötig).
- UI-Strings deutsch mit Umlauten. Server-Actions: Result-Object `{ok,error?}`, kein throw. Co-Authored-By: Claude Opus 4.8.

---

## Task 1: Core — `erstelleFlottenSchadenLead` + Dedup (§2a, §0)

**Files:** Modify `src/lib/flotte/schaden-fortsetzung.ts`; Modify `src/lib/flotte/schaden-fortsetzung.test.ts`

**Produces:** `erstelleFlottenSchadenLead({vehicleId, userId}) → {ok:true;token} | {ok:false;error}`; `flowLinkFuerClaimFortsetzung(claimId, userId) → {ok:true;token} | {ok:false;error}` (für Task 4).

- [ ] Ersetze `erstelleFlottenSchadenClaim` durch `erstelleFlottenSchadenLead`: `createLead(admin, {source_channel:'flotte-manuell', status:'neu'}, {vehicle_id, firma_name, gewerbe_flag:true})` **BAR (kein schuldfrage)**; **Dedup** (§0): vorher `findRecentFlottenLead(admin, vehicleId)` (leads: vehicle_id + source_channel='flotte-manuell' + created_at > now-10min) → reuse; dann `ensureCanonicalFlowLinkForLead(leadId, {serviceTyp:'komplett', admin})` → `{ok, token}`. **`convertLeadToClaim`-Import + -Aufruf ENTFERNEN.**
- [ ] Neue `flowLinkFuerClaimFortsetzung(claimId, userId)`: liest `claims.lead_id, vehicle_id`; FM-Ownership (`flotten_fahrzeuge.firma_id` → `firmen_flotten_konten` user+aktiv); `ensureCanonicalFlowLinkForLead(lead_id, {serviceTyp:'komplett', admin})` → `{ok, token}`. (Ersetzt die picker-`resolveSchadenFortsetzung`-Nutzung für den Resume — self-contained, damit §3 `resolveSchadenFortsetzung` löschen kann.)
- [ ] Test: `erstelleFlottenSchadenClaim`-describe (Z.258-293) → `erstelleFlottenSchadenLead` umschreiben: erwartet `{ok:true, token:'flow-token-1'}`, `createLeadCalls[0].extra` **ohne** schuldfrage, + Dedup-Test (recent lead → kein createLead). `vi.mock('@/lib/leads/convert-lead-to-claim')` bleibt (andere Blöcke bis §3).
- [ ] `npx vitest run src/lib/flotte/schaden-fortsetzung.test.ts` grün.
- [ ] Commit.

## Task 2: Action-Layer (§2b)

**Files:** Modify `src/app/flotte/(shell)/fahrzeug/[id]/actions.ts`

**Consumes:** `erstelleFlottenSchadenLead`, `flowLinkFuerClaimFortsetzung`. **Produces:** `meldeNeuenFlottenSchaden(vehicleId) → {ok:true;token}|{ok:false;error}`; `meldeSchadenVervollstaendigen(claimId) → {ok:true;token}|{ok:false;error}`.

- [ ] `meldeNeuenFlottenSchaden(vehicleId)` (haftungstyp-Param raus): `requirePortalAccess(['flottenmanager'])` → `erstelleFlottenSchadenLead({vehicleId, userId})` → revalidatePath → `{ok, token}`.
- [ ] Neue `meldeSchadenVervollstaendigen(claimId)`: `requirePortalAccess(['flottenmanager'])` → `flowLinkFuerClaimFortsetzung(claimId, user.id)` → `{ok, token}`.
- [ ] Import auf `erstelleFlottenSchadenLead, flowLinkFuerClaimFortsetzung`; `Haftungstyp`/`erstelleFlottenSchadenClaim`-Import raus.
- [ ] Commit.

## Task 3: Header-UI — ein Button, kein fortsetzen (§2c)

**Files:** Modify `src/components/flotte/FahrzeugMiniAktionen.tsx`; Modify `src/app/flotte/(shell)/fahrzeug/[id]/page.tsx`

- [ ] `FahrzeugMiniAktionen`: `fortsetzenClaimId`-Prop + -Zweig ENTFERNEN. `onMelden: (vehicleId) => Promise<{ok:true;token}|{ok:false;error}>`. Button-Label **„Schaden melden"** → `onMelden(vehicleId)` → `router.push('/flow/' + token)`. Header-Kommentar aktualisieren.
- [ ] `page.tsx`: `fortsetzenClaimId`-Berechnung (Z.67 `findeErsterfassungClaim`) + Prop (Z.124) entfernen. `findeErsterfassungClaim`-Import nur droppen falls sonst ungenutzt (sonst lassen).
- [ ] Commit.

## Task 4: Claim-Detail Resume-Button (§2d)

**Files:** Create `src/components/flotte/SchadenVervollstaendigenButton.tsx`; Modify `src/components/flotte/FlottenClaimDetailView.tsx`

**Consumes:** `meldeSchadenVervollstaendigen` (Task 2).

- [ ] `SchadenVervollstaendigenButton.tsx` ('use client'): Props `{claimId}`. Importiert `meldeSchadenVervollstaendigen` direkt (kein Prop → Claim-Detail-`page.tsx` unberührt). onClick → Action → `router.push('/flow/' + token)`; Fehler inline. Button „Schaden vervollständigen" (variant ondo).
- [ ] `FlottenClaimDetailView`: den `<Link href={/flotte/schaden/${view.claimId}/gutachter…}>`-Block (Z.62-72) durch `<SchadenVervollstaendigenButton claimId={view.claimId} />` ersetzen (Gate `!view.sv` bleibt). `Link`-Import droppen falls sonst ungenutzt.
- [ ] Commit.

## Task 5: §3 Cleanup — Picker retire (consumer-verifiziert)

**Files:** Delete `src/app/flotte/(shell)/schaden/[claimId]/gutachter/` (page.tsx, GutachterPickerClient.tsx, actions.ts); Modify `src/lib/flotte/schaden-fortsetzung.ts` (+ .test.ts); knip-Baseline.

- [ ] Picker-Route-Ordner löschen (`git rm -r`).
- [ ] `schaden-fortsetzung.ts`: `waehleGutachterUndStarteFlow`, `ladeGutachterKandidaten`, `projiziereKandidat`, `resolveSchadenFortsetzung`, Types `SchadenFortsetzungClaim`/`GutachterKandidat`/`Haftungstyp` + jetzt ungenutzte Imports (`planeTerminMitFallback`, `geocodeMitFallback`, `OeffentlichesSvProfil`, `leadGfaPflichtfelder`) entfernen. **BEHALTEN:** `findeErsterfassungClaim`, `erstelleFlottenSchadenLead`, `flowLinkFuerClaimFortsetzung`.
- [ ] `schaden-fortsetzung.test.ts`: describe-Blöcke `projiziereKandidat`/`ladeGutachterKandidaten`/`resolveSchadenFortsetzung`/`waehleGutachterUndStarteFlow` + obsolete Mocks (`sv-matching-modul`, `geocode`) entfernen. `findeErsterfassungClaim` + `erstelleFlottenSchadenLead` behalten.
- [ ] `grep -rn "schaden/\[claimId\]/gutachter\|waehleGutachterUndStarteFlow\|resolveSchadenFortsetzung" src/` = leer.
- [ ] Commit.

## Task 6: Gates + PR + Marker + Smoke-Handoff

- [ ] `npx tsc --noEmit` (8GB) grün; `npm run build` grün (Server-Actions/Routen geändert → voller Build Pflicht).
- [ ] Ratchets: `check:knip -- --ratchet` (nach Retire ggf. `--update-baseline`), `check:component-set --ratchet`, `check:vitest --ratchet`, `check:token-audit`, `check:flag-drift --ratchet`.
- [ ] PR→staging (Body: §2a-d + §0 + §3, §4-Docking-Antwort, Regel-4-Smoke-Plan). Marker `coordination-an-b0e963b6-fm-kasko-werkstatt-auftrag-docking` + HANDOFF-Spec-Marker aktualisieren (gebaut). File-Claim für 63fe43f9.
- [ ] Regel-4-Smoke an Deploy-Session: Test-FM (telefon=NULL) „Schaden melden"→/flow (Lead, kein Claim), Quali→Haftpflicht(SV-Slot)/Kasko(Werkstatt); Gegentest Gegner-Tap bleibt claim-first.

---

## Danach (Track B — Aaron „wir machen beides"): Repair-Audit R3/R4/R5
Separate Lane (kunde/werkstatt), eigener Design-Gate + Branch/PR je Fund. R3 Vermittlungs-Blind-Window · R4 Selbstzahler-Kosten-Framing · R5 Abschluss-Resilienz. Marker `coordination-werkstatt-kunde-repair-audit`.
