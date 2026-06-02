# AAR-956 §3a — Data-driven `/flow` incomplete-lead path (Implementation Plan)

> Spec: AAR-956 comment `dc2edabb` (the §3a VOLL-Spec) + `42068954` (datengetrieben) + `6ee2a137` (guardrail). Owner: cdd8f4f3.
> **Goal:** `/flow/[token]` handles **termin-less** self-service leads (from Phase A `/start`): Quali → Slot-Picker → reserve, THEN the existing gutachter→SA→account path. Dispatcher leads (termin already reserved) stay UNCHANGED. Gated OFF behind Aaron's `CANONICAL_FLOWLINK_ENABLED` flip (this PR has no prod impact until then).

**Tech:** Next.js 15 (token-only anon route), Supabase service_role, React client wizard.

---

## Key findings (drive the architecture)

1. **Token mismatch:** `/anfrage` components + actions (`SelbstQualiClient`/`TerminBuchungClient`, `speichereQuali`/`ladeMatching`/`bucheTermin`) are keyed on `gutachter_finder_anfragen.self_service_token` (`ladeAnfrageByToken`). `/flow` has a `flow_links` token + lead. → cannot reuse the **actions** verbatim; need **lead-keyed flow actions**.
2. **SA/account boundary:** `TerminBuchungClient` bundles slot **+ SA + account + fertig** (`unterschreibeUndErstelleFall`). §3a wants ONLY slot→reserve, then `/flow`'s OWN gutachter→SA→account (acceptance #4). → reuse only the **slot-picker presentational part**, not the SA/account.
3. **Incomplete detection already half-there:** `page.tsx:169` loads `terminMitSv` (active reserviert/bestaetigt termin for lead). `terminMitSv == null` ⇒ incomplete. Picked-SV via gfa back-ref (`gfa.konvertiert_zu_lead_id = lead.id` → `zugeordneter_sv_id`).
4. **`FlowWizardKfz` carries a stale DEPRECATED header** (2026-05-12, "no new features", deletion ≥26.05 never happened). It is still the LIVE wizard for token-only magic-link users = exactly the self-service `/flow` case, and the spec names it explicitly. → extend it (note the tension in the commit); do NOT build a parallel wizard.
5. **Guardrail:** reserve via the `bucheTermin`-style insert (no `typ` field → NULL, CHECK-tolerated). NEVER `reserviereSlot` (`typ:'vor_ort'` → CHECK violation `sv_begutachtung|kb_beratung|konfrontation`).

---

## Architecture

- **Reuse, don't duplicate** (spec mandate): extract two pure presentational pieces, shared by `/anfrage` and `/flow`:
  - `QualiOptionen` (the 3 Schuldfrage buttons) — from `SelbstQualiClient`.
  - `SvSlotAuswahl` (the SV cards + slot buttons) — from `TerminBuchungClient`.
- **Lead-keyed flow actions** (new, in `flow/[token]/self-service-actions.ts`) reuse the shared libs (`matchAndSlots`, `bewerteSchuldfrage`) directly — no `/anfrage`-action coupling. (Minor logic overlap with `/anfrage` actions is acceptable: Phase C deprecates `/anfrage`.)
- **Wizard:** dynamic `STEPS` — when `needsBooking` (server-detected), insert `quali` (only if `lead.schuldfrage` empty) + `termin` BEFORE `gutachter`. The slot step reserves + lifts the chosen `{sv, slot}` to wizard state, then advances to `gutachter` (renders from the lifted selection; no page refresh). SA uses `signSAandCreateFall(lead.id, …)` (finds termin by lead_id) — unchanged.

---

## File Structure

- **Create** `src/components/self-service/QualiOptionen.tsx` — pure presentational (3 buttons + vorname + disabled + onWaehle). Web-only client.
- **Create** `src/components/self-service/SvSlotAuswahl.tsx` — pure presentational (SV cards + slots + fehler + onSlot). Web-only client.
- **Modify** `src/app/anfrage/[token]/SelbstQualiClient.tsx` — consume `QualiOptionen` (no behavior change).
- **Modify** `src/app/anfrage/[token]/TerminBuchungClient.tsx` — consume `SvSlotAuswahl` for the `auswahl` step (no behavior change).
- **Create** `src/app/flow/[token]/self-service-actions.ts` — `speichereQualiFlow` / `ladeMatchingFlow` / `bucheTerminFlow` (lead-keyed via flow_links token).
- **Modify** `src/app/flow/[token]/page.tsx` — compute `needsBooking` + picked-SV + coords/quali-state; pass to wizard.
- **Modify** `src/app/flow/[token]/FlowWizardKfz.tsx` — dynamic STEPS + quali/termin step rendering + lift selection + continue.
- **Create** tests: `src/app/flow/[token]/__tests__/self-service-actions.test.ts` (quali gate + matching shape + buche conflict) — pure-logic where feasible (mock db).

---

## Tasks

### Task 1: Extract `QualiOptionen` presentational
- [ ] Create `src/components/self-service/QualiOptionen.tsx`: props `{ vorname: string | null; disabled: boolean; onWaehle: (value: string) => void }`. Move the OPTIONEN array + the button block (SelbstQualiClient:12-16, 69-96).
- [ ] Refactor `SelbstQualiClient` to render `<QualiOptionen .../>` in the `frage` phase. Keep its `speichereQuali`/`TerminBuchungClient` wiring otherwise identical.
- [ ] `npx tsc --noEmit` green; /anfrage quali behavior unchanged (data-testids preserved: `quali-schuldfrage-<value>`).

### Task 2: Extract `SvSlotAuswahl` presentational
- [ ] Create `src/components/self-service/SvSlotAuswahl.tsx`: props `{ svs: OeffentlichesSvProfil[]; fehler: string | null; onSlot: (sv, slot) => void }`. Move the `auswahl`-step JSX (TerminBuchungClient:161-227) incl. data-testids (`buchung-sv-<i>`, `buchung-slot-<svId>-<start>`) + `fmtSlot` + `GoogleBewertungBadge`.
- [ ] Refactor `TerminBuchungClient` `auswahl` step to render `<SvSlotAuswahl .../>`. No behavior change.
- [ ] tsc green.

### Task 3: Lead-keyed flow actions
- [ ] Create `src/app/flow/[token]/self-service-actions.ts` (`'use server'`).
- [ ] `resolveFlowLead(token)`: `flow_links` by token (service_role) → `{ admin, leadId, gfa }` where gfa = `gutachter_finder_anfragen` with `konvertiert_zu_lead_id = leadId` (maybeSingle, for picked-SV). Result-object on miss.
- [ ] `speichereQualiFlow(token, schuldfrage)`: resolve → `bewerteSchuldfrage` → update lead (disqualifiziert path mirrors `speichereQuali`) → `{ ok, ergebnis }`. revalidatePath `/dispatch/leads`.
- [ ] `ladeMatchingFlow(token)`: resolve → load lead `besichtigungsort_lat/lng, fahrzeug_standort_lat/lng, wunschtermin, disqualifiziert` → coords (besichtigungsort ?? fahrzeug_standort) → `matchAndSlots({ lat, lng, wunschterminIso, fixerSvId: gfa?.zugeordneter_sv_id ?? null })` → `{ ok, svs }`. Same "no coords" soft message as `ladeMatching`.
- [ ] `bucheTerminFlow(token, svId, start, end)`: resolve → conflict-check (mirror `bucheTermin`) → cancel prior reserved for lead → insert `{ lead_id, sv_id, start_zeit, end_zeit, status:'reserviert' }` (NO typ) → `{ ok, terminId }`. revalidatePath `/dispatch/leads`.
- [ ] tsc green.

### Task 4: Tests for flow actions (pure-logic + db-mock)
- [ ] `__tests__/self-service-actions.test.ts`: quali gate (eigenverantwortung→abbruch, gegner→weiter via `bewerteSchuldfrage` — already tested lib, assert mapping wired), matching input assembly (coords fallback, fixerSvId passthrough) with a stubbed admin client, buche conflict→error. vitest green.

### Task 5: Wizard incomplete-path integration
- [ ] `FlowWizardKfz` props += `needsBooking?: boolean`, `pickedSvId?: string | null` (only used to label; matching reads it server-side via action), and internal state for the lifted `{ sv, slot }`.
- [ ] Dynamic STEPS: `const steps = needsBooking ? [zusammenfassung, ...(qualiPending ? [quali] : []), termin, gutachter, sa, account] : [zusammenfassung, gutachter, sa, account]`. `qualiPending = needsBooking && !lead.schuldfrage`.
- [ ] `quali` step renders `<QualiOptionen onWaehle={...speichereQualiFlow}>`; eigenverantwortung→abbruch view (Kasko, no termin, no crash). On `weiter` → advance to `termin`.
- [ ] `termin` step: load via `ladeMatchingFlow(token)`; render `<SvSlotAuswahl>`; on slot → `bucheTerminFlow` → on ok, set lifted selection + advance to `gutachter`. Reuse the `kein_match` soft state.
- [ ] `gutachter` step: render from server `gutachter` prop OR (incomplete) the lifted selection (vorname/avatar/slot.start). SA step continues unchanged (`signSAandCreateFall(lead.id, ...)`).
- [ ] Back-button safe for new steps.

### Task 6: page.tsx server detection
- [ ] After `terminMitSv` load: `const needsBooking = !terminMitSv`. When needsBooking, read picked-SV: `gutachter_finder_anfragen` where `konvertiert_zu_lead_id = leadId` → `zugeordneter_sv_id` (back-ref). Pass `needsBooking` + `pickedSvId` to `FlowWizardKfz`.
- [ ] Dispatcher path (terminMitSv present) → needsBooking=false → wizard identical to today (acceptance #5, no regression).

### Task 7: Build gate + audit + PR
- [ ] `npm run build` green (route/server-action change → full build, not just tsc).
- [ ] 7-point audit in commit body.
- [ ] PR `--base staging`, branch `kitta/aar-956-flow-incomplete-path`. **Flag stays OFF** — note in PR that Aaron flips `CANONICAL_FLOWLINK_ENABLED` after the staging smoke.
- [ ] Ping Aaron (AAR-956) → he smokes Marketing-Wizard → /start → /flow → Quali → Slot → SA → Login (Test-SV + cleanup) + flips the flag.

---

## Acceptance mapping (spec dc2edabb)
- Self-Service lead → Quali → Slot ≥1 SV real slots → reserve → **Tasks 3,5,6**
- Picked-SV first/default + alternatives → **Task 3 (fixerSvId) + matchAndSlots already ranks; SvSlotAuswahl shows „Empfohlen" on i===0**
- Eigenverschulden → Kasko end-view, no crash → **Task 5 (quali abbruch view)**
- After slot → SA → account → Login → **Task 5 (hand back to existing SA/account)**
- Dispatcher lead unchanged → **Task 6 (needsBooking=false)**
- Test-SV smoke + cleanup → Aaron's smoke (Phase B owner) post-merge
- Build green → **Task 7**
