# Netzwerk-Ökosystem P4 — SV-Vermittlungs-Flow („Partner-Werkstatt vermitteln") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Gutachter startet in `/gutachter/auftraege` einen eigenen Vorgang: fertiges Gutachten hochladen → **Sofort-Claim** (`operative_status='gutachten-eingegangen'`, un-onboardet) → Kunde onboardet+signiert in den bestehenden Claim → Kunde wählt self-served eine Partner-Werkstatt → Werkstatt terminiert. Invariante: **kein Regulierungs-/Reparatur-Effekt vor Kunden-Bestätigung.**

**Architecture:** Rein **additive Anwendungslogik, KEINE Migration** (`gutachten-eingegangen`, `reparatur_werkstatt_quelle='gutachter'`, `onboarding_complete`, `sa_unterschrieben` existieren alle bereits — verifiziert). Drei Bausteine: (1) `convertLeadToClaim` bekommt einen **datengetriebenen Initial-State-Zweig** (Direkt-INSERT, umgeht die State-Machine → feuert Billing/SLA/QC NICHT verfrüht). (2) Ein **`sa_unterschrieben`-Gate** an allen Mid-Funnel-Readern (Auto-Phase, Billing-Cron, Werkstatt-Zuweisung, Kanzlei-Handoff) — regressions-sicher, weil jeder Nicht-SV-Flow-Claim `sa_unterschrieben=true` geboren wird. (3) Ein **„sign-into-existing"-Pfad**: die SA-Signatur des Kunden UPDATED den bestehenden Claim (statt `convertLeadToClaim` idempotent zu verwerfen) und **löst die aufgeschobenen Funnel-Effekte aus**.

**Tech Stack:** Next.js 15 (App Router, Server Actions), TypeScript, `@supabase/supabase-js` (Admin-Client, service_role), vitest. Komponenten aus `@/components/primitives` + `@/components/shared`. Kein neuer DB-Zugriff auf Views ohne Typ-Probe.

---

## Global Constraints

Jede Task erbt diese Regeln implizit.

- **Sofort-Claim (verbatim Spec 3 §4):** `operative_status = 'gutachten-eingegangen'`, `onboarding_complete = false`, `sa_unterschrieben = false`, `sv_id = <der vermittelnde SV>`. Gesetzt durch **Erweiterung von `convert-lead-to-claim.ts:441`** (Direkt-INSERT).
- **Invariante (Spec 3 §4, LOCKED):** *Der Status spiegelt das Gutachten, die Gates spiegeln den Kunden.* **Kein Versicherer-Anschreiben, keine Werkstatt-Zuweisung, kein Billing vor Kunden-Bestätigung.**
- **Gate-Prädikat = `sa_unterschrieben === true`** (die Kunden-Bestätigung). **Warum nicht `onboarding_complete`:** ein Normalfall-Claim erreicht `gutachten-eingegangen` legitim mit `onboarding_complete=false` (Portal-Wizard aufgeschoben) — ein Gate darauf würde die Regulierung stranden. Jeder Nicht-SV-Flow-Claim wird dagegen `sa_unterschrieben=true` **geboren** (`convert-lead-to-claim.ts:406-412`, Claim entsteht AM SA-Signing), das Gate ist dort also **inert**. Der SV-Flow-Claim ist der einzige, der `sa_unterschrieben=false` geboren wird → nur er wird geblockt. **Der „sign-into-existing"-Pfad setzt BEIDE Flags** (`sa_unterschrieben=true` + `onboarding_complete=true`, K5-treu). → DECISIONS-Eintrag (Task 0, Schritt 4).
- **State via State-Machine — ABER Direkt-INSERT beim Sofort-Claim (K5-Auflösung):** Der Initial-Cursor bei Anlage ist der sanktionierte Direkt-INSERT (Operative-Status-Write-Gate gatet nur `.update`, nicht `.insert` — AGENTS.md). Er umgeht `transitionFallStatus` **bewusst**, sonst feuerten `processCaseBilling`/`completeSla('gutachten_upload')`/`emitEvent('fall.status_changed')` (`state-machine.ts:391-393,439-449,359-363`) **verfrüht**. Billing/SLA/QC werden **auf POST-Onboarding verschoben** (Task 5). **⚠ C-Migration (später, nicht P4):** wenn C1 (`transitionClaim`, `docs/fundament/FUNDAMENT.md` §1.2) + C2 (`createCase`, ein Intake) gebaut sind, wird der Sofort-Claim-Einstieg auf `createCase` + einen expliziten Engine-Übergang mit ausgesetzten Nachwirkungen umgestellt.
- **KEINE Migration in P4.** Alle geschriebenen enum-Werte sind CHECK-gültig (verifiziert 28.07.: `claims.reparatur_werkstatt_quelle ⊇ {gutachter}`, `reparatur_vermittlung_status ⊇ {vermittelt}`; `leads.source_channel` trägt keinen CHECK). Kein `apply_migration`, kein flag-drift-Snapshot-Change. Sollte eine Task doch DDL brauchen → STOP, Plan-Annahme falsch, mit Marker abgleichen.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }`, kein `throw` (AGENTS.md §Error-Handling). Non-critical Sub-Sends (WA/Email/Mitteilung) in lokalem try/catch. `revalidatePath` bei jedem Write.
- **UI-Umlaute Pflicht** (AGENTS.md §Sprache): alle nutzersichtbaren Strings mit echten `ä/ö/ü/ß`. Komponenten aus `primitives/*` + `shared/*` (kein handgerolltes `<button className="…">`).
- **Nie auf `main` pushen.** Branch `kitta/aar-<nr>-netzwerk-p4-sv-vermittlung`, PR gegen `staging`, nicht selbst mergen. 7-Punkte-Audit vor jedem Commit (AGENTS.md).
- **Ratchets 0-neu:** `check:flag-drift`, `check:token-audit`, `check:component-set`, `check:status-registry`, `check:operative-status-writes`, `check:knip`, `check:vitest`. Der Operative-Status-Write-Ratchet ist besonders zu beachten: der Sofort-Claim ist ein `.insert` (erlaubt); es darf **kein** neuer `.from('claims').update({ operative_status })` außerhalb der Engine entstehen.
- **prod-Ref = `paizkjajbuxxksdoycev`** (teilt DB mit staging). Verifikation via Plugin `execute_sql` READ-only. `createAdminClient()` ist **ungetypt** → neue select-Strings gegen prod proben.
- **Pflichtlektüre vor Start:** `docs/superpowers/specs/2026-07-27-{sv-vermittlungs-flow-claim-lifecycle-design, implementierungs-roadmap-phasen, hardening-und-koordination-vor-plaenen, netzwerk-oekosystem-epic-overview-design}.md` + (nach Rebase vorhanden) `docs/fundament/FUNDAMENT.md` §1+§2 und `docs/fundament/journeys/j01-haftpflicht-standardfall.md` + `…/j04-reparatur-weg.md` + Marker `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]`.

---

## Koordinations-Gates (blockieren den MERGE, nicht das Schreiben)

- **`b0e963b6` — FlowLink-Lane** besitzt `/flow/[token]/*`, `signSAandCreateFall`, das Matching. **Task 5 + Task 6** fassen `src/app/flow/[token]/actions.ts` an (Hot-Multi-Lane-File). **Vor Anfassen synchronisieren, NACH deren Merge rebasen** (Hardening §B). `convert-lead-to-claim.ts` (Task 1) ist ebenfalls Hot-Multi-Lane — DDL-frei, aber Merge-Reihenfolge absprechen.
- **`a8fc2a40` — Finder-Engine** besitzt `ladeWerkstattVorschlaege`/`rank-vorschlaege.ts`. **Task 9** dockt die Kunde-Finder-Zuweisung an — **die bestehende Engine-API erweitern, nicht neu bauen**. Die „Dein Netzwerk"-Sektion selbst ist **P2/P3** (Dependency, nicht P4).
- **Abhängigkeit (Roadmap):** P4 → **P0** (Fundament: Bindung/Prädikat) **+ P3** (Bindung-Seed + Netzwerk-Finder-Sektion). Der Netzwerk-Boost/die Sektion sind P2/P3; P4 liefert den **Vermittlungs-Flow + das Gate + die Zuweisungs-Verdrahtung**. Task 9 setzt voraus, dass die Kunde-Finder-Sektion aus P2/P3 gemergt ist; sonst Task 9 **hinter** P3 stellen.
- **FUNDAMENT-Programm:** dieses P4 berührt Status/Intake/Notifications/Akte → `FUNDAMENT.md` §1+§2 lesen (nach Rebase vorhanden). C1/C2 sind noch `offen` → P4 baut auf den heutigen Ankern (`convertLeadToClaim`, `transitionFallStatus`) und vermerkt die C-Migration.

---

## Invariante & Reparatur-Achse — verbindliche Design-Entscheidungen (in Task 0 nach DECISIONS.md)

1. **Gate-Signal = `sa_unterschrieben`** (Begründung s. Global Constraints). Der SV-Flow setzt zusätzlich `onboarding_complete`.
2. **SV-Flow-Claim = Abrechnungsweg `haftpflicht`, `service_typ='komplett'`** (SV-Gutachten ist klassisch Haftpflicht — Spec 3 §9, Memory `[[broadcast-provision-modell-inbound-haftpflicht-only]]`). Damit läuft die **SV-/Regulierungs-Achse** (`gutachten-eingegangen → filmcheck → kanzlei → VS`, Journey J1) — nach Onboarding.
3. **Reparatur = Nebenschauplatz auf der `reparatur_vermittlung_status`/`reparatur_termine`-Neben-Achse, NICHT auf der `operative_status`-`reparatur-*`-Lane.** Verifiziert: `advanceReparaturCursorTo` (`reparatur-cursor.ts:56-60`) ist auf `abrechnungsweg ∈ {selbstzahler, kasko}` gegatet — bei Haftpflicht **No-op**. Die Reparatur-Verdrahtung des SV-Flows nutzt daher `assignReparaturWerkstatt` (setzt `reparatur_werkstatt_id` + `reparatur_vermittlung_status='vermittelt'`) + `reparatur_termine` + `schlageWerkstattTerminVor` (alle abrechnungsweg-agnostisch). Das beantwortet **J4 Offene Frage 3** („Haftpflicht-Reparatur = Nebenschauplatz"). → DECISIONS.md.

---

## Task 0: Worktree, Rebase, Anker-Reverifikation, DECISIONS (kein Merge-Deliverable)

**Files:** keine Code-Änderung; ggf. `docs/fundament/DECISIONS.md` (Append).

- [ ] **Schritt 1: Frischer Worktree off staging.** `node scripts/new-session-worktree.mjs aar-<nr>-netzwerk-p4-sv-vermittlung staging`; Branch hart auf `origin/staging` setzen; `git log -1 origin/staging` == HEAD verifizieren (FUNDAMENT-Falle: das Script zweigt vom stale Checkout-HEAD ab).
- [ ] **Schritt 2: Lane-Stand prüfen.** `b0e963b6` (FlowLink) + `a8fc2a40` (Finder): sind ihre offenen PRs in `staging`? Falls nein → Task 5/6/9 erst nach deren Merge mergen (schreiben ist erlaubt). Marker `[[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]]` lesen.
- [ ] **Schritt 3: Anker frisch verifizieren** (der Code kann seit Spec-Datum gedriftet sein). Alle READ-only:
  - `convert-lead-to-claim.ts:441-442` == `;(claimsInsert as Record<string, unknown>).operative_status = input.svIdFromTermin ? 'sv-termin' : 'ersterfassung'`
  - `state-machine.ts` `transitionFallStatus` feuert bei `gutachten-eingegangen`: `processCaseBilling` (~:439), `completeSla('gutachten_upload')` (~:391), `emitEvent('fall.status_changed')` (~:359)
  - `autophase-decision.ts` `computeNextOperativePhase`: `case 'gutachten-eingegangen': return s.istKomplett ? 'filmcheck' : null`
  - `process-case-billing.ts:44` Gate `if (!claim?.sv_id) return null` + `:48` Idempotenz `lead_preis_netto`
  - `case-billing-batch/route.ts` selektiert `operative_status IN BILLABLE_OPERATIVE_STATUS_VALUES`; `terminal-status.ts` `BILLABLE_OPERATIVE_STATUS_VALUES` enthält `'gutachten-eingegangen'`
  - `vermittlung-server.ts:130` `assignReparaturWerkstatt` (kein sa/onboarding-Gate)
  - `flow/[token]/actions.ts:628` `signSAandCreateFall` ruft `convertLeadToClaim({leadId, svIdFromTermin, signatureUrl})` (~:689); `convertLeadToClaim`-Idempotenz `:98-108`
  - `kunde/onboarding/actions.ts` `completeOnboarding` setzt `claims.onboarding_complete=true` (~:570)
  - CHECK: `SELECT ... FROM information_schema` bzw. Snapshot: `claims.reparatur_werkstatt_quelle` enthält `'gutachter'`; `leads.source_channel` hat KEINEN CHECK. **Wenn eine Abweichung → Plan-Task anpassen, im PR vermerken.**
- [ ] **Schritt 4: DECISIONS.md** (falls `docs/fundament/DECISIONS.md` nach Rebase existiert) zwei Einträge appenden (Format FUNDAMENT §8): (a) *„P4-Gate = `sa_unterschrieben`, nicht `onboarding_complete` — Regressions-Sicherheit, s. Plan Global Constraints."* (b) *„SV-Vermittlungs-Flow (Haftpflicht): Reparatur = Nebenschauplatz auf `reparatur_vermittlung_status`/`reparatur_termine`; `operative_status`-`reparatur-*`-Lane bleibt reduced-repair-only (J4 Offene Frage 3)."* Falls die Datei fehlt (Branch noch nicht gerebased) → als PR-Body-Notiz.

---

## Task 1: `convertLeadToClaim` — datengetriebener Initial-State `gutachten-eingegangen`

**Files:**
- Modify: `src/lib/leads/convert-lead-to-claim.ts` (Input-Typ ~:49-61; Initial-State ~:441-442)
- Test: `src/lib/leads/__tests__/convert-lead-to-claim.test.ts` (queue-basierte Mock-Harness, bestehend)

**Interfaces:**
- Produces: `ConvertLeadToClaimInput.gutachtenBereitsErstellt?: boolean`. Ist `true` → der erzeugte Claim trägt `operative_status='gutachten-eingegangen'` (sonst unverändert `svIdFromTermin ? 'sv-termin' : 'ersterfassung'`). `sv_id` bleibt `input.svIdFromTermin`. `onboarding_complete` bleibt ungesetzt (DB-Default `false`) — der SV-Flow ist Haftpflicht, der Reduced-Repair-Zweig `:571-582` greift NICHT. Konsumiert von Task 7.

- [ ] **Schritt 1: Failing Test** in `convert-lead-to-claim.test.ts` (Harness s. Datei-Kopf, `primeResponses`):
```ts
it('SV-Vermittlung: gutachtenBereitsErstellt -> operative_status=gutachten-eingegangen, sv_id gesetzt, onboarding_complete ungesetzt', async () => {
  primeResponses([
    { data: { id: 'lead-sv', schadens_art: 'haftpflicht', gegner_bekannt: false, vorname: 'Max', nachname: 'Muster', abrechnungsweg: 'haftpflicht' } }, // 1 leads select
    { data: [] },                                                // 2 profiles select (KB Round-Robin)
    { data: { id: 'claim-sv', claim_nummer: 'CLM-SV' } },        // 3 claims insert
    { data: { id: 'person-sv' } },                               // 4 personen insert
    { data: null },                                              // 5 claim_parties insert
    { data: null },                                              // 6 faelle_claim_bridge upsert
    { data: null },                                              // 7 leads update
  ])
  const { convertLeadToClaim } = await import('../convert-lead-to-claim')
  const r = await convertLeadToClaim({ leadId: 'lead-sv', svIdFromTermin: 'sv-1', gutachtenBereitsErstellt: true })
  expect(r.ok).toBe(true)
  const p = operations.find((o) => o.table === 'claims' && o.op === 'insert')!.payload as Record<string, unknown>
  expect(p.operative_status).toBe('gutachten-eingegangen')
  expect(p.sv_id).toBe('sv-1')
  expect(p.onboarding_complete).toBeUndefined() // Haftpflicht -> kein Reduced-Repair-Zweig
})
```
- [ ] **Schritt 2: Test laufen (FAIL)** — `npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts -t "gutachtenBereitsErstellt"` → FAIL (`operative_status` ist `'sv-termin'`).
- [ ] **Schritt 3: Input-Typ erweitern** — in `ConvertLeadToClaimInput` (~:49) ergänzen:
```ts
  /** SV-Vermittlungs-Flow (P4): das Gutachten liegt bereits vor -> Claim entsteht direkt in
   *  'gutachten-eingegangen' (Direkt-INSERT, umgeht die State-Machine -> kein verfruehtes
   *  Billing/SLA/QC; die aufgeschobenen Effekte feuert der Onboarding-Complete-Hook, P4 Task 5). */
  gutachtenBereitsErstellt?: boolean
```
- [ ] **Schritt 4: Initial-State-Zweig erweitern** — `:441-442` ersetzen durch:
```ts
  // P4: Sofort-Claim des SV-Vermittlungs-Flows -> 'gutachten-eingegangen' (Gutachten liegt vor,
  // ueberspringt sv-termin/besichtigung/begutachtung). Direkt-INSERT = sanktionierter Initial-Cursor
  // (Operative-Status-Write-Gate gatet nur .update). Umgeht bewusst die State-Machine, damit
  // processCaseBilling/completeSla/emitEvent NICHT vor dem Kunden-Onboarding feuern (K5).
  ;(claimsInsert as Record<string, unknown>).operative_status =
    input.gutachtenBereitsErstellt
      ? 'gutachten-eingegangen'
      : input.svIdFromTermin
        ? 'sv-termin'
        : 'ersterfassung'
```
- [ ] **Schritt 5: Test laufen (PASS)** — `npx vitest run src/lib/leads/__tests__/convert-lead-to-claim.test.ts` → alle grün (auch die bestehenden Bug-F-Tests, die `onboarding_complete` prüfen).
- [ ] **Schritt 6: Ratchet** — `npm run check:operative-status-writes -- --ratchet` (0-neu; unser Change ist `.insert`, nicht `.update`).
- [ ] **Schritt 7: Commit** — `feat(netzwerk): convertLeadToClaim datengetriebener gutachten-eingegangen-Sofortclaim (P4 T1)` + 7-Punkte-Audit im Body.

---

## Task 2: Gate — Auto-Phase blockt `gutachten-eingegangen → filmcheck` ohne SA

**Files:**
- Create: `src/lib/faelle/onboarding-gate.ts` (pures Prädikat)
- Test: `src/lib/faelle/__tests__/onboarding-gate.test.ts`
- Modify: `src/lib/autophase-decision.ts` (`OperativeSignals` + `case 'gutachten-eingegangen'`)
- Modify: `src/lib/autophase-decision.test.ts` (bestehend)
- Modify: `src/lib/autoPhase.ts` (`checkFallAutoPhase` — Signal laden)

**Interfaces:**
- Produces: `kundeHatBestaetigt(claim: { sa_unterschrieben: boolean | null | undefined }): boolean` (== `claim.sa_unterschrieben === true`). `OperativeSignals.kundeBestaetigt: boolean`. Konsumiert von Task 3/4.

- [ ] **Schritt 1: Failing Test** `onboarding-gate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { kundeHatBestaetigt } from '../onboarding-gate'
describe('kundeHatBestaetigt', () => {
  it('sa_unterschrieben=true -> true', () => expect(kundeHatBestaetigt({ sa_unterschrieben: true })).toBe(true))
  it('sa_unterschrieben=false -> false', () => expect(kundeHatBestaetigt({ sa_unterschrieben: false })).toBe(false))
  it('null/undefined -> false', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: null })).toBe(false)
    expect(kundeHatBestaetigt({ sa_unterschrieben: undefined })).toBe(false)
  })
})
```
- [ ] **Schritt 2: Test laufen (FAIL).**
- [ ] **Schritt 3: Implementieren** `src/lib/faelle/onboarding-gate.ts`:
```ts
// P4 (Netzwerk SV-Vermittlungs-Flow): das Kunden-Bestaetigungs-Gate.
// Signal = sa_unterschrieben (die legale Kunden-Bestaetigung). NICHT onboarding_complete:
// ein Normalfall-Claim erreicht 'gutachten-eingegangen' legitim mit onboarding_complete=false
// (Portal-Wizard aufgeschoben) — ein Gate darauf wuerde die Regulierung stranden. Jeder
// Nicht-SV-Flow-Claim wird sa_unterschrieben=true geboren (Claim entsteht am SA-Signing) ->
// dieses Gate ist dort inert; nur der SV-Sofort-Claim (geboren false) wird geblockt.
export function kundeHatBestaetigt(claim: { sa_unterschrieben?: boolean | null }): boolean {
  return claim.sa_unterschrieben === true
}
```
- [ ] **Schritt 4: Test laufen (PASS).**
- [ ] **Schritt 5: Failing Test** in `autophase-decision.test.ts` (Regel + Regressions-Guard):
```ts
it('P4: gutachten-eingegangen -> filmcheck NUR wenn kundeBestaetigt (komplett)', () => {
  const base = { hasSvId: true, hasTermin: true, gutachtenFertig: true, istKomplett: true, anschlussschreibenVorhanden: false, zahlungEingegangen: false }
  expect(computeNextOperativePhase('gutachten-eingegangen', { ...base, kundeBestaetigt: true })).toBe('filmcheck')
  expect(computeNextOperativePhase('gutachten-eingegangen', { ...base, kundeBestaetigt: false })).toBeNull()
})
```
  (Bestehende Aufrufer der Testdatei um `kundeBestaetigt: true` ergänzen, damit sie das inerte Normalverhalten weiter treffen.)
- [ ] **Schritt 6: Test laufen (FAIL)** — Typfehler `kundeBestaetigt` fehlt / Regel greift nicht.
- [ ] **Schritt 7: `autophase-decision.ts` erweitern** — `OperativeSignals` um `/** claims.sa_unterschrieben === true (P4-Gate) */ kundeBestaetigt: boolean` ergänzen; `case 'gutachten-eingegangen'` ändern:
```ts
    case 'gutachten-eingegangen':
      // P4: komplett-gated UND kunden-bestaetigt (sa_unterschrieben). Ein Sofort-Claim des
      // SV-Vermittlungs-Flows (geboren un-onboardet) bleibt hier stehen, bis der Kunde die SA
      // signiert -> kein verfruehter Kanzlei-/VS-Track (Invariante Spec 3 §4).
      return (s.istKomplett && s.kundeBestaetigt) ? 'filmcheck' : null
```
- [ ] **Schritt 8: `autoPhase.ts` — Signal laden.** Im `claims`-select (~:59-63) `sa_unterschrieben` ergänzen und in `signals` (~:77-84) setzen:
```ts
    .select('operative_status, service_typ, sv_id, kundenbetreuer_id, sa_unterschrieben')
```
```ts
    kundeBestaetigt: kundeHatBestaetigt({ sa_unterschrieben: (claim.sa_unterschrieben as boolean | null) ?? null }),
```
  (Import `import { kundeHatBestaetigt } from '@/lib/faelle/onboarding-gate'` ergänzen.)
- [ ] **Schritt 9: Tests laufen (PASS)** — `npx vitest run src/lib/autophase-decision.test.ts src/lib/faelle/__tests__/onboarding-gate.test.ts`.
- [ ] **Schritt 10: Commit** — `feat(netzwerk): sa-Gate auf autoPhase gutachten-eingegangen->filmcheck (P4 T2)`.

---

## Task 3: Gate — `processCaseBilling` (deckt `case-billing-batch`-Cron) blockt ohne SA

**Files:**
- Modify: `src/lib/abrechnung/process-case-billing.ts` (select + Early-Return ~:39-48)
- Test: `src/lib/abrechnung/__tests__/process-case-billing.sa-gate.test.ts` (neu) — falls die bestehende `process-case-billing.trigger.test.ts` eine nutzbare Harness hat, dort ergänzen.

**Interfaces:**
- Consumes: `kundeHatBestaetigt` (Task 2).
- Produces: `processCaseBilling(fallId)` gibt `null` zurück, solange `claim.sa_unterschrieben !== true` (zusätzlich zu den bestehenden Guards sv_id/schadenhoehe/Idempotenz). Damit ist der Cron `case-billing-batch` (selektiert `gutachten-eingegangen`-Claims) für den un-onboardeten Sofort-Claim inert.

- [ ] **Schritt 1: Failing Test** — mockt `createAdminClient` (Muster aus `convert-lead-to-claim.test.ts`), primed: claim mit `sv_id` gesetzt, `sa_unterschrieben=false`, `schadens_hoehe_netto=5000`, `lead_preis_netto=null`. Assert: `processCaseBilling('fall-x')` → `null` und **kein** `sachverstaendige`-update in `operations`.
- [ ] **Schritt 2: Test laufen (FAIL)** — heute billt es (kein SA-Gate).
- [ ] **Schritt 3: select + Gate ergänzen** — `:40` select um `sa_unterschrieben` erweitern; nach dem `sv_id`-Guard (`:44`) einfügen:
```ts
  // P4 (Invariante Spec 3 §4): kein Billing vor Kunden-Bestaetigung. Der SV-Vermittlungs-
  // Sofort-Claim (geboren sa_unterschrieben=false, sv_id gesetzt) wuerde sonst vom case-billing-
  // batch-Cron gebillt, obwohl der Kunde noch nicht signiert hat. Inert fuer Normalfall-Claims
  // (die sind bei gutachten-eingegangen laengst sa_unterschrieben=true). Nach Onboarding feuert
  // processCaseBilling erneut (idempotent) via completeOnboarding-Hook (Task 5).
  if ((claim as { sa_unterschrieben?: boolean | null }).sa_unterschrieben !== true) return null
```
```ts
    .select('id, sv_id, sa_unterschrieben, schadens_hoehe_netto, lead_preis_netto, gutachten(gesamt_schadensbetrag)')
```
- [ ] **Schritt 4: Test laufen (PASS)** + bestehende `process-case-billing.trigger.test.ts` grün halten (die primed Claims um `sa_unterschrieben: true` ergänzen, sonst brechen sie — Normalfall ist bestätigt).
- [ ] **Schritt 5: Commit** — `feat(netzwerk): sa-Gate auf processCaseBilling/case-billing-batch (P4 T3)`.

---

## Task 4: Gate — Werkstatt-Zuweisung + Kanzlei-Handoff blocken ohne SA

**Files:**
- Modify: `src/lib/werkstatt/vermittlung-server.ts` (`assignReparaturWerkstatt` ~:130)
- Modify: `src/app/faelle/[id]/_actions/filmcheck.ts` (`saveFilmcheck` — vor dem `filmcheck → kanzlei-uebergeben`-Übergang ~:123)
- Test: `src/lib/werkstatt/__tests__/assign-reparatur-werkstatt.sa-gate.test.ts` (neu)

**Interfaces:**
- Consumes: `kundeHatBestaetigt` (Task 2).
- Produces: `assignReparaturWerkstatt(...)` → `{ ok:false, error:'Kunde hat den Auftrag noch nicht bestätigt.' }` solange der Ziel-Claim `sa_unterschrieben !== true`. `saveFilmcheck` bricht den Kanzlei-Handoff mit sauberem Result ab, solange `sa_unterschrieben !== true`.

- [ ] **Schritt 1: Failing Test** `assign-reparatur-werkstatt.sa-gate.test.ts` — mockt admin-client; für `target:'claim'` primed: claim-select liefert `{ sa_unterschrieben: false }`. Assert: `assignReparaturWerkstatt({target:'claim', id:'c1', werkstattId:'w1', quelle:'gutachter', actorUserId:'u1'})` → `{ ok:false }` und **kein** `claims`-update-patch in `operations`.
- [ ] **Schritt 2: Test laufen (FAIL).**
- [ ] **Schritt 3: Gate in `assignReparaturWerkstatt`** — direkt nach `const admin = createAdminClient()` (~:137), VOR dem Patch. Für `target:'claim'` den Claim lesen; für `target:'lead'` den Claim über `lead_id` auflösen (der Sync-Read existiert bereits `:155-162` — hier vorziehen bzw. den Wert wiederverwenden):
```ts
  // P4 (Invariante Spec 3 §4): keine Werkstatt-Zuweisung vor Kunden-Bestaetigung. Gilt fuer
  // JEDE Zuweisung (nicht nur SV-Vermittlung) — ein un-onboardeter Sofort-Claim darf keinen
  // Reparaturauftrag ausloesen. Inert fuer Normalfall-Claims (sa_unterschrieben=true).
  {
    const gateClaimId = input.target === 'claim'
      ? input.id
      : ((await admin.from('claims').select('id, sa_unterschrieben').eq('lead_id', input.id).maybeSingle()).data as { id: string; sa_unterschrieben?: boolean | null } | null)?.id ?? null
    if (input.target === 'claim' || gateClaimId) {
      const { data: gc } = await admin.from('claims').select('sa_unterschrieben').eq('id', gateClaimId ?? input.id).maybeSingle()
      if (!kundeHatBestaetigt({ sa_unterschrieben: (gc as { sa_unterschrieben?: boolean | null } | null)?.sa_unterschrieben ?? null })) {
        return { ok: false, error: 'Kunde hat den Auftrag noch nicht bestätigt.' }
      }
    }
  }
```
  (Import `kundeHatBestaetigt` ergänzen. **Hinweis:** wenn `target:'lead'` und noch KEIN Claim existiert → Gate greift nicht (reiner Lead-Vorgang ohne Sofort-Claim, Alt-Verhalten) — bewusst, weil der SV-Flow immer einen Claim hat.)
- [ ] **Schritt 4: Gate in `saveFilmcheck`** — vor dem Übergang nach `kanzlei-uebergeben` (~:123) den Claim-`sa_unterschrieben` prüfen (der Handoff triggert LexDrive/AS = das explizite „kein Versicherer-Anschreiben"):
```ts
  // P4: Kanzlei-Handoff (loest Anschlussschreiben/VS aus) erst nach Kunden-Bestaetigung.
  if (!kundeHatBestaetigt({ sa_unterschrieben: <claim.sa_unterschrieben aus dem bestehenden Claim-Read> })) {
    return { success: false, error: 'Kunde hat noch nicht bestätigt — Kanzlei-Übergabe blockiert.' }
  }
```
  (Den bestehenden Claim-Read in `saveFilmcheck` um `sa_unterschrieben` erweitern; falls keiner existiert, einen `maybeSingle`-Read auf `claims.sa_unterschrieben` ergänzen. Import `kundeHatBestaetigt`.)
- [ ] **Schritt 5: Tests laufen (PASS)** + `check:operative-status-writes -- --ratchet` (der `saveFilmcheck`-Übergang bleibt via `transitionFallStatus` — kein neuer Direkt-Write).
- [ ] **Schritt 6: Commit** — `feat(netzwerk): sa-Gate auf assignReparaturWerkstatt + Kanzlei-Handoff (P4 T4)`.

---

## Task 5: Onboarding-Complete-Hook — aufgeschobene Funnel-Effekte auslösen

**Files:**
- Create: `src/lib/faelle/resume-funnel-after-onboarding.ts`
- Test: `src/lib/faelle/__tests__/resume-funnel-after-onboarding.test.ts`
- Modify: `src/app/kunde/onboarding/actions.ts` (`completeOnboarding` — nach dem `onboarding_complete=true`-Write ~:572)

**Interfaces:**
- Consumes: `checkFallAutoPhase` (`@/lib/autoPhase`), `processCaseBilling` (`@/lib/abrechnung/process-case-billing`).
- Produces: `resumeFunnelAfterOnboarding(fallId: string): Promise<void>` — non-fatal, idempotent. Feuert `processCaseBilling(fallId)` (jetzt greift der SA-Gate) + `checkFallAutoPhase(fallId)` (advanced den Sofort-Claim `gutachten-eingegangen → filmcheck`). Für Normalfall-Claims No-op (Billing lief bereits @ uploadGutachten → Idempotenz-Guard; AutoPhase findet keinen offenen Vorwärts-Hop). Konsumiert von `completeOnboarding` (hier) **und** dem sign-into-existing-Pfad (Task 6).

- [ ] **Schritt 1: Failing Test** — mockt `@/lib/autoPhase` + `@/lib/abrechnung/process-case-billing` mit `vi.fn()`. Assert: `resumeFunnelAfterOnboarding('fall-1')` ruft **beide** genau einmal mit `'fall-1'`; ein Wurf in einem der beiden wird geschluckt (kein Re-throw).
- [ ] **Schritt 2: Test laufen (FAIL).**
- [ ] **Schritt 3: Implementieren** `resume-funnel-after-onboarding.ts`:
```ts
// P4 (Netzwerk SV-Vermittlungs-Flow): der Sofort-Claim wird un-onboardet in 'gutachten-eingegangen'
// geboren (Direkt-INSERT, umgeht die State-Machine). Billing/SLA/QC sind daher AUFGESCHOBEN. Sobald
// der Kunde bestaetigt hat (SA signiert -> completeOnboarding bzw. sign-into-existing), holt dieser
// Hook sie nach: processCaseBilling (SA-Gate greift jetzt) + checkFallAutoPhase (gutachten-eingegangen
// -> filmcheck, kundeBestaetigt=true). Fuer Normalfall-Claims No-op (Billing idempotent, AutoPhase
// findet keinen Hop). NON-FATAL: darf den Onboarding-Abschluss nie brechen.
import { checkFallAutoPhase } from '@/lib/autoPhase'
import { processCaseBilling } from '@/lib/abrechnung/process-case-billing'

export async function resumeFunnelAfterOnboarding(fallId: string): Promise<void> {
  try {
    await processCaseBilling(fallId) // idempotent (lead_preis_netto-Guard); SA-Gate greift jetzt
  } catch (err) {
    console.error('[resumeFunnelAfterOnboarding] processCaseBilling non-fatal:', err)
  }
  try {
    await checkFallAutoPhase(fallId) // gutachten-eingegangen -> filmcheck (jetzt kundeBestaetigt)
  } catch (err) {
    console.error('[resumeFunnelAfterOnboarding] checkFallAutoPhase non-fatal:', err)
  }
}
```
- [ ] **Schritt 4: Test laufen (PASS).**
- [ ] **Schritt 5: In `completeOnboarding` einhängen** — nach dem erfolgreichen `onboarding_complete`-Write (~:572, innerhalb `if (targetClaimId)`), aber vor dem `profiles`-Update:
```ts
    // P4: der Kunde hat sein Onboarding abgeschlossen -> aufgeschobene Funnel-Effekte des
    // SV-Vermittlungs-Sofort-Claims nachholen (No-op fuer Normalfall-Claims).
    if (targetFallId) {
      const { resumeFunnelAfterOnboarding } = await import('@/lib/faelle/resume-funnel-after-onboarding')
      await resumeFunnelAfterOnboarding(targetFallId)
    }
```
- [ ] **Schritt 6: Commit** — `feat(netzwerk): resumeFunnelAfterOnboarding-Hook @ completeOnboarding (P4 T5)`.

---

## Task 6: „sign-into-existing-claim" — SA-Signatur UPDATED den bestehenden Claim

**Files:**
- Create: `src/lib/faelle/apply-sa-to-existing-claim.ts`
- Test: `src/lib/faelle/__tests__/apply-sa-to-existing-claim.test.ts`
- Modify: `src/app/flow/[token]/actions.ts` (`signSAandCreateFall` — Verzweigung vor/statt `convertLeadToClaim` ~:684-696) **⚠ Koordination b0e963b6**

**Interfaces:**
- Consumes: `resumeFunnelAfterOnboarding` (Task 5).
- Produces: `applySAToExistingClaim(admin, { claimId, fallId, signatureUrl }): Promise<{ ok: boolean; error?: string }>` — UPDATED `claims` (`sa_unterschrieben=true`, `sa_unterschrieben_am`, `abtretung_signiert_am`, `abtretung_pdf=signatureUrl`, `onboarding_complete=true`) und ruft `resumeFunnelAfterOnboarding(fallId)`. **Schreibt KEIN `operative_status`** (bleibt `gutachten-eingegangen`; die Engine/AutoPhase advanced es). `signSAandCreateFall` routet einen bereits konvertierten Lead (`konvertiert_zu_claim_id` gesetzt) hierher statt in den idempotenten No-op.

**Kontext (verifiziert):** `convertLeadToClaim` ist idempotent — bei bereits konvertiertem Lead returnt es `:98-108` **ohne** `signatureUrl` anzuwenden. Der SV-Flow-Claim existiert aber schon (Task 7) → die Kunden-SA würde **still verworfen** (K5). Dieser Pfad schließt die Lücke.

- [ ] **Schritt 1: Failing Test** `apply-sa-to-existing-claim.test.ts` — mockt admin-client + `resumeFunnelAfterOnboarding` (`vi.fn`). Assert: `applySAToExistingClaim(admin, { claimId:'c1', fallId:'f1', signatureUrl:'https://…/sig.png' })` → `{ ok:true }`; das `claims`-update-payload trägt `sa_unterschrieben:true`, `onboarding_complete:true`, `abtretung_pdf:'https://…/sig.png'` und **kein** `operative_status`; `resumeFunnelAfterOnboarding` genau 1× mit `'f1'`.
- [ ] **Schritt 2: Test laufen (FAIL).**
- [ ] **Schritt 3: Implementieren** `apply-sa-to-existing-claim.ts`:
```ts
// P4 (Netzwerk SV-Vermittlungs-Flow): "sign-into-existing-claim". Der SV-Sofort-Claim existiert
// bereits (Task 7) -> die Kunden-SA muss ihn UPDATEN, nicht neu konvertieren (convertLeadToClaim
// ist idempotent + verwuerfe die signatureUrl still, K5). Setzt sa_unterschrieben/abtretung_pdf +
// onboarding_complete=true (spec 3 §4) und loest die aufgeschobenen Funnel-Effekte aus.
// Schreibt bewusst KEIN operative_status (bleibt 'gutachten-eingegangen'; AutoPhase advanced es
// im resume-Hook). NON-FATAL fuer die Sub-Effekte.
import type { createAdminClient } from '@/lib/supabase/admin'

export async function applySAToExistingClaim(
  admin: ReturnType<typeof createAdminClient>,
  input: { claimId: string; fallId: string; signatureUrl: string },
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('claims')
    .update({
      sa_unterschrieben: true,
      sa_unterschrieben_am: now,
      abtretung_signiert_am: now,
      abtretung_pdf: input.signatureUrl,
      onboarding_complete: true,
    })
    .eq('id', input.claimId)
  if (error) return { ok: false, error: error.message }
  try {
    const { resumeFunnelAfterOnboarding } = await import('@/lib/faelle/resume-funnel-after-onboarding')
    await resumeFunnelAfterOnboarding(input.fallId)
  } catch (err) {
    console.error('[applySAToExistingClaim] resume non-fatal:', err)
  }
  return { ok: true }
}
```
- [ ] **Schritt 4: Test laufen (PASS).**
- [ ] **Schritt 5: `signSAandCreateFall` verzweigen** (⚠ mit `b0e963b6` synchronisieren). Nach dem Lead-Load + IDOR-Guard (~:658), VOR `convertLeadToClaim` (~:688): ist der Lead bereits konvertiert, den Signatur-UPDATE fahren:
```ts
  // P4: sign-into-existing-claim. Ist der Lead bereits in einen Claim konvertiert (SV-Vermittlungs-
  // Sofort-Claim, Task 7), UPDATED die SA den bestehenden Claim statt convertLeadToClaim idempotent
  // die Signatur zu verwerfen. Der uebrige Flow (Termin/WA/Account) laeuft unveraendert weiter.
  if (lead.konvertiert_zu_claim_id && lead.konvertiert_zu_fall_id) {
    const { applySAToExistingClaim } = await import('@/lib/faelle/apply-sa-to-existing-claim')
    const applied = await applySAToExistingClaim(admin, {
      claimId: lead.konvertiert_zu_claim_id as string,
      fallId: lead.konvertiert_zu_fall_id as string,
      signatureUrl,
    })
    if (!applied.ok) return { ok: false, error: `SA-Update fehlgeschlagen: ${applied.error}` }
  }
```
  Direkt danach `convertLeadToClaim` wie gehabt aufrufen — bei bereits konvertiertem Lead liefert es idempotent denselben `conv.fallId`/`conv.claimId` (kein Doppel-Claim), die restliche Kette (`fall`, Termin-Upgrade, Account) läuft unverändert. (Alternativ: den `convertLeadToClaim`-Aufruf im schon-konvertiert-Zweig durch ein direktes Nachladen von `konvertiert_zu_*` ersetzen — mit b0e963b6 abstimmen, welche Variante deren Diff verträgt.)
- [ ] **Schritt 6: Build** — `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` + `npm run build` (Server-Action/Route → voller Build, Audit-Punkt 1).
- [ ] **Schritt 7: Commit** — `feat(netzwerk): sign-into-existing-claim SA-Update-Pfad (P4 T6)`.

---

## Task 7: SV-Selbstanlage — CTA-Action „Partner-Werkstatt vermitteln"

**Files:**
- Create: `src/app/gutachter/auftraege/_actions/vermittle-partner-werkstatt.ts` (Server-Action)
- Create: `src/lib/gutachter/attach-gutachten-ohne-transition.ts` (Helper)
- Test: `src/lib/gutachter/__tests__/attach-gutachten-ohne-transition.test.ts`
- Test: `src/app/gutachter/auftraege/_actions/__tests__/vermittle-partner-werkstatt.test.ts`

**Interfaces:**
- Consumes: `createLead` (`@/lib/leads/create-lead`), `convertLeadToClaim` (Task 1, `gutachtenBereitsErstellt:true`), `ensureCanonicalFlowLinkForLead` (`@/lib/start-link/ensure-flowlink-for-lead`), `createPflichtdokumenteFromKatalog` (`@/lib/dokumente/create-pflicht`), `getGutachterForUser`.
- Produces: `vermittlePartnerWerkstatt(formData): Promise<{ ok:true; fallId:string; flowLinkUrl:string } | { ok:false; error:string }>`. Und `attachGutachtenOhneTransition(admin, { claimId, fallId, svId, file, betrag, userId }): Promise<{ ok:boolean; error?:string }>` — Storage + `fall_dokumente` + `gutachten`-Upsert + `paket_faelle_genutzt`-Increment, **OHNE** `transitionFallStatus`/`checkFallAutoPhase`/Filmcheck-Task (der Claim ist bereits in `gutachten-eingegangen`, die QC-Effekte sind auf POST-Onboarding aufgeschoben). Konsumiert von Task 8.

**Warum ein eigener Attach-Helper:** `uploadGutachten` (`gutachter/fall/[id]/actions.ts:94/101`) triggert `transitionFallStatus(→gutachten-eingegangen)` + `checkFallAutoPhase` + einen Filmcheck-KB-Task — genau die verfrühten Effekte, die die Invariante verbietet. Der Helper zieht nur den **Datenteil** (Storage/`gutachten`/Zähler) heraus.

- [ ] **Schritt 1: Failing Test** `attach-gutachten-ohne-transition.test.ts` — mockt admin-client. Assert: `attachGutachtenOhneTransition(...)` setzt einen `gutachten`-Upsert (`fertiggestellt_am`, `gesamt_schadensbetrag=betrag`, `sv_id`, `claim_id`), einen `fall_dokumente`-Insert (`dokument_typ:'gutachten'`) und ein `sachverstaendige`-Update (`paket_faelle_genutzt+1`) — und **keinen** `transitionFallStatus`-Aufruf (kein `faelle_claim_bridge`-Read wie in der Engine).
- [ ] **Schritt 2: Test laufen (FAIL).**
- [ ] **Schritt 3: Helper implementieren** `attach-gutachten-ohne-transition.ts` — Storage-Upload nach `gutachten/${fallId}/${Date.now()}-${name}` (Muster `uploadGutachten:50-60`), `getStorageUrl`, `fall_dokumente`-Insert (`dokument_typ:'gutachten'`, `kategorie:'gutachten'`, `quelle:'gutachter'`, `uploaded_by_sv:true`, `sichtbar_fuer:['admin','kundenbetreuer','sachverstaendiger','kunde','kanzlei']`), `gutachten`-Upsert (`onConflict:'claim_id'`, `sv_id`, `fertiggestellt_am`, `gesamt_schadensbetrag`), `sachverstaendige.paket_faelle_genutzt`-Increment. **Kein** State-Übergang. Result-Object.
- [ ] **Schritt 4: Test laufen (PASS).**
- [ ] **Schritt 5: Failing Test** `vermittle-partner-werkstatt.test.ts` — mockt `createClient`/`getGutachterForUser` (SV), admin-client, `convertLeadToClaim`/`ensureCanonicalFlowLinkForLead`/`attachGutachtenOhneTransition` (`vi.fn`). Assert Happy-Path: `convertLeadToClaim` mit `{ gutachtenBereitsErstellt: true, svIdFromTermin: <sv.id> }` aufgerufen; Result enthält `flowLinkUrl`; Auth-Fehler (Nicht-SV) → `{ ok:false }`.
- [ ] **Schritt 6: Test laufen (FAIL).**
- [ ] **Schritt 7: Action implementieren** `vermittle-partner-werkstatt.ts` (`'use server'`):
  1. `createClient` + `getGutachterForUser(supabase, user.id, 'id')` — kein SV → `{ ok:false, error:'Kein Sachverständigen-Profil gefunden' }`.
  2. FormData validieren: `vorname`, `nachname`, `telefon`/`email` (min. eins), `kennzeichen`, `schadens_plz`/Unfallort, Gutachten-PDF (`datei`, `type==='application/pdf'`, `size>0`), `betrag>0`. Fehlende Pflichtfelder → Result-Fehler (deutsche Meldung mit Umlauten).
  3. `createLead(admin, { source_channel:'gutachter-vermittlung', status:'neu', vorname, nachname, telefon, email }, { abrechnungsweg:'haftpflicht', service_typ:'komplett', kennzeichen, fahrzeug_hersteller, fahrzeug_modell, unfallort_*, schadens_art, schadens_hergang, qualifizierungs_phase:'konvertiert' })`.
  4. `convertLeadToClaim({ leadId, gutachtenBereitsErstellt:true, svIdFromTermin: sv.id, triggerByUserId: user.id })` → bei `!ok` Lead löschen + Result-Fehler.
  5. `attachGutachtenOhneTransition(admin, { claimId: conv.claimId, fallId: conv.fallId, svId: sv.id, file, betrag, userId: user.id })` (non-fatal loggen).
  6. `createPflichtdokumenteFromKatalog(admin, conv.fallId, leadDocs)` (Muster `anlegeFall:128-144`, non-fatal).
  7. `ensureCanonicalFlowLinkForLead(leadId, { serviceTyp:'komplett', admin })` → `flowLinkUrl = ${APP_URL}/flow/${token}`.
  8. **Versand an den Kunden** (non-fatal): WA/Email mit dem Link (das Plain-Link-Muster aus `issue-canonical-flowlink.ts:sendeInitialLink` wiederverwenden — nicht duplizieren; ggf. dort einen exportierten Helper extrahieren). Test-Konten (`telefon=NULL`) senden nichts (Regel 4).
  9. `revalidatePath('/gutachter/auftraege')`; return `{ ok:true, fallId: conv.fallId, flowLinkUrl }`.
- [ ] **Schritt 8: Test laufen (PASS)** + Build (`tsc --noEmit`).
- [ ] **Schritt 9: Commit** — `feat(netzwerk): SV-Selbstanlage vermittlePartnerWerkstatt + attach-ohne-transition (P4 T7)`.

---

## Task 8: CTA + Formular in `/gutachter/auftraege`

**Files:**
- Modify: `src/app/gutachter/auftraege/page.tsx` (CTA-Button neben `TagesvorbereitungButton` ~:168-170 **und** ~:62-63 im Empty-Branch)
- Create: `src/app/gutachter/auftraege/PartnerWerkstattVermittelnButton.tsx` (Client, öffnet Sheet)
- Create: `src/app/gutachter/auftraege/PartnerWerkstattVermittelnSheet.tsx` (Client-Form)

**Interfaces:**
- Consumes: `vermittlePartnerWerkstatt` (Task 7).
- Produces: sichtbarer Einstiegspunkt (Audit-Punkt 2) für den SV-Vermittlungs-Flow.

- [ ] **Schritt 1: Button-Komponente** `PartnerWerkstattVermittelnButton.tsx` (`'use client'`) — `primitives.Button` (`variant`/`onClick`, Label **„Partner-Werkstatt vermitteln"**, echte Umlaute), öffnet das Sheet (`@/components/ui/sheet` — Web-only Rich-UI erlaubt). Kein handgerolltes `<button className>`.
- [ ] **Schritt 2: Sheet-Formular** `PartnerWerkstattVermittelnSheet.tsx` — Felder via `@/components/shared/forms/TextField`/`SelectField`: Kunde (Vorname/Nachname/Telefon/E-Mail), Fahrzeug (Kennzeichen/Hersteller/Modell), Unfallort (PLZ/Adresse), Gutachten-PDF (`<input type="file" accept="application/pdf">`), Schadenshöhe (`betrag`). Submit → `vermittlePartnerWerkstatt(formData)`; bei `ok` Erfolgs-Toast (`sonner`) mit „Vorgang angelegt — Link an den Kunden verschickt." + optional `flowLinkUrl` zum Kopieren; bei `!ok` `toast.error(result.error)`. Kein `throw`.
- [ ] **Schritt 3: In `page.tsx` einhängen** — den Button in beide Header-Zeilen setzen (die mit `TagesvorbereitungButton`, ~:62 Empty + ~:168 Normal), damit er auch bei 0 Aufträgen erreichbar ist:
```tsx
<div className="flex items-center gap-3">
  <PartnerWerkstattVermittelnButton />
  <TagesvorbereitungButton />
</div>
```
- [ ] **Schritt 4: Build** — `npm run build` (Route-Change → voller Next-Build, Audit-Punkt 1) + `npm run check:component-set -- --ratchet` + `check:token-audit`.
- [ ] **Schritt 5: Commit** — `feat(netzwerk): CTA + Sheet Partner-Werkstatt vermitteln in /gutachter/auftraege (P4 T8)`.

---

## Task 9: Kunde self-served → `assignReparaturWerkstatt({quelle:'gutachter'})` + Empfehl-Batch ablösen

**Files:**
- Modify: `src/app/kunde/faelle/[id]/werkstatt-finder-actions.ts` (`quelle` aus dem Claim-Origin ableiten)
- Modify: `src/app/gutachter/fall/[id]/page.tsx` bzw. der Renderer der `WerkstattEmpfehlenCard` — die SV-Vorauswahl-Karte entfernen (Empfehl-Batch abgelöst)
- Test: `src/app/kunde/faelle/[id]/__tests__/werkstatt-finder-quelle.test.ts` (neu)

**Interfaces:**
- Consumes: `assignReparaturWerkstatt` (mit SA-Gate aus Task 4), `claims.netzwerk_owner_id` (P0/P3-Bindung).
- Produces: die Kunde-Finder-Zuweisung feuert `quelle:'gutachter'`, wenn der Claim netzwerk-SV-gebunden ist (sonst unverändert `'kunde'`). Die SV-seitige Empfehl-Vorauswahl (`WerkstattEmpfehlenCard`) ist aus der Fallakte entfernt.

**Abhängigkeit:** Die „Dein Netzwerk"-Sektion im Kunde-Finder ist **P2/P3**. Task 9 verdrahtet nur die **Zuweisung + Quelle** und die **Empfehl-Batch-Ablösung**. Wenn P3 noch nicht gemergt ist → Task 9 hinter P3 stellen (schreiben erlaubt, Merge-Gate).

- [ ] **Schritt 1: Failing Test** — mockt den Claim-Read; für einen Claim mit gesetztem `netzwerk_owner_id` (SV-Bindung, P0-Spalte) erwartet der Test, dass die Finder-Zuweisung `assignReparaturWerkstatt` mit `quelle:'gutachter'` aufruft; ohne Bindung mit `quelle:'kunde'`.
- [ ] **Schritt 2: Test laufen (FAIL).**
- [ ] **Schritt 3: `werkstatt-finder-actions.ts`** — vor dem `assignReparaturWerkstatt`-Call den Claim-Origin lesen. Ist der `netzwerk_owner_id`-Profil-Row ein SV (bzw. der Claim trägt einen `sv_id` als bindenden Owner) → `quelle='gutachter'`, sonst `'kunde'`. (Owner-Auflösung: P0-Helper `ladeFreundKandidatIds`/Bindungsspalte; hier reicht die Prüfung „Claim hat einen SV-Netzwerk-Owner".) Der SA-Gate (Task 4) schützt bereits gegen Zuweisung vor Onboarding.
- [ ] **Schritt 4: Test laufen (PASS).**
- [ ] **Schritt 5: Empfehl-Batch-Karte entfernen** — `WerkstattEmpfehlenCard` aus dem SV-Fallakte-Renderer nehmen (die Vorauswahl ist durch den immer-an-Kunde-Finder abgelöst, Locked Decision Epic §4). **Assignment-Kern bleibt** (`assignReparaturWerkstatt`). **Backward-Compat:** die Route `/werkstatt-empfehlung/[token]` + `empfehleWerkstaettenAlsGutachter`/`zieheWerkstattEmpfehlungZurueck` **stehen lassen** (offene Magic-Links nicht brechen), aber keinen neuen Einstiegspunkt mehr rendern. Toten Import in `page.tsx` entfernen; `npm run check:knip -- --ratchet` prüfen (die Karte darf nicht als neuer toter File auflaufen — falls sie 0-Consumer wird, in die knip-Baseline aufnehmen mit Begründung ODER löschen, wenn keine offenen Batches mehr existieren — im PR entscheiden).
- [ ] **Schritt 6: Build** + `check:knip -- --ratchet` + `check:component-set -- --ratchet`.
- [ ] **Schritt 7: Commit** — `feat(netzwerk): Kunde-Finder quelle=gutachter fuer SV-gebundene Claims + Empfehl-Batch-Vorauswahl abgeloest (P4 T9)`.

---

## Definition of Done (P4)

**Build/Ratchets (Audit-Punkt 1 + 6):**
- [ ] `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` grün; `npm run build` grün.
- [ ] `check:vitest -- --ratchet` grün (alle neuen + bestehenden Unit-Tests); `check:operative-status-writes`, `check:flag-drift`, `check:knip`, `check:component-set`, `check:token-audit`, `check:status-registry` je 0-neu.
- [ ] **KEINE Migration** appliziert (verifiziert: `git status supabase/migrations` leer). Falls doch eine nötig wurde → Plan-Annahme war falsch, im PR begründen.

**Funktionale Akzeptanz (Spec 3 §3 Flow-Schritte + Journeys):**
- [ ] **J1-Bezug (Haftpflicht):** Sofort-Claim entsteht in `gutachten-eingegangen`; nach Kunden-SA+Onboarding läuft der Claim regulär `gutachten-eingegangen → filmcheck → kanzlei → VS` (J1 Schritte 6-10) — **nicht vorher**.
- [ ] **J4-Bezug (Reparatur):** nach Onboarding wählt der Kunde self-served eine Partner-Werkstatt → `assignReparaturWerkstatt({quelle:'gutachter'})` → `reparatur_vermittlung_status='vermittelt'` → Werkstatt terminiert via `schlageWerkstattTerminVor`/`reparatur_termine` (J4 Schritte 1-2 auf der Nebenachse; die `operative_status`-`reparatur-*`-Lane bleibt reduced-repair-only).
- [ ] **Invariante (hart):** ein Claim in `gutachten-eingegangen` mit `sa_unterschrieben=false` löst **kein** `processCaseBilling` (case-billing-batch inert), **keine** `gutachten-eingegangen→filmcheck`-Advance, **kein** Kanzlei-Anschreiben, **keine** Werkstatt-Zuweisung aus. Nach der Kunden-SA (sign-into-existing) feuern die aufgeschobenen Effekte via `resumeFunnelAfterOnboarding`.

**Regel-4 — Prod-Playwright-Smoke (nach Deploy, Pflicht):** Vollständiger End-to-End-Smoke `SV-Upload → Kunde-Onboard → Werkstatt-Termin` gegen `https://app.claimondo.de`:
1. **Wegwerf-SV** seeden (`scripts/smoke/throwaway-account.mjs`, kein prod-Partner-Login) + Test-Kunde (`telefon=NULL` → keine echten SMS/WA).
2. SV-Login → `/gutachter/auftraege` → „Partner-Werkstatt vermitteln" → Kundendaten + Gutachten-PDF + Betrag → absenden. **DB-Verifikation (Admin-JWT-Sim, Claim-Views service-role=0):** Claim existiert, `operative_status='gutachten-eingegangen'`, `sa_unterschrieben=false`, `onboarding_complete=false`, `sv_id=<Wegwerf-SV>`; `gutachten.fertiggestellt_am` gesetzt. **Kein** Filmcheck-Task, **kein** `lead_preis_netto` (Billing nicht gefeuert).
3. FlowLink als Kunde öffnen → SA signieren → Account → `/kunde/onboarding` abschließen. **DB-Verifikation:** `sa_unterschrieben=true`, `onboarding_complete=true`, Claim jetzt `filmcheck` (AutoPhase gelaufen), `lead_preis_netto` gesetzt (Billing nachgeholt).
4. Kunde-Portal Werkstatt-Finder → Partner-Werkstatt wählen. **DB:** `reparatur_werkstatt_id` gesetzt, `reparatur_vermittlung_status='vermittelt'`, `reparatur_werkstatt_quelle='gutachter'`; `reparatur_termine`-Zeile vorhanden. Werkstatt-Portal (`/werkstatt/auftraege`) zeigt den Auftrag → Termin vorschlagen (`schlageWerkstattTerminVor`).
5. **Negativ-Assertion:** Schritt 2→3 (vor Onboarding) keine VS-/Kanzlei-Notification, keine Werkstatt-Zuweisung möglich, kein Billing-Debit. Ergebnis (grün/rot + Screenshots/Assertions) im PR dokumentieren. **Stripe-live (prod+staging):** kein Zahl-Smoke — der Billing-Pfad hier ist `werbebudget`/Lead-Fee (kein Stripe-Charge), trotzdem gegen den comped/Test-Pfad prüfen, nie echte Charge.
6. **Deploy nicht in dieser Session?** Smoke-Pflicht explizit im Marker an die Merge-/Deploy-Session übergeben (Flow-Liste + Test-Konten). Aufgabe bleibt **offen** bis grüner Prod-Smoke.

**Governance:** PR gegen `staging`, mit `b0e963b6` (FlowLink) + `a8fc2a40` (Finder) koordiniert/gerebased; nicht selbst gemergt. DECISIONS-Einträge (Task 0) im PR/Datei. Session-Abschluss-Checkliste (`git status`/`git stash list`/`git log --branches --not --remotes`).

---

## Self-Review (durchgeführt beim Schreiben)

**1. Spec-Coverage (Spec 3 §3 Flow-Tabelle + §4-8 + K4/K5):**
- Schritt 1 CTA `/gutachter/auftraege` → **Task 8** ✓
- Schritt 2 Gutachten-Upload → Sofort-Claim (SV-Selbstanlage + datengetriebener `gutachten-eingegangen`) → **Task 1 + Task 7** ✓
- Schritt 3 An Kunde senden → Onboarden+SA, „sign-into-existing" (SA UPDATE statt konvertieren) → **Task 6 + Task 7 (FlowLink)** ✓
- Schritt 4 Kunde wählt Werkstatt (Netzwerk-Finder) → `assignReparaturWerkstatt({quelle:'gutachter'})`, Empfehl-Batch abgelöst → **Task 9** ✓ (Sektion selbst = P2/P3-Dependency)
- Schritt 5 Werkstatt terminiert (`reparatur_termine`/`schlageWerkstattTerminVor`) → **DoD J4** (Reuse unverändert) ✓
- Schritt 6 Kunde→SV-Bindung (`netzwerk_owner_id`) → P0/P3 (Task 9 nutzt es) ✓
- **K5** „alle Mid-Funnel-Reader gaten": `computeNextOperativePhase`/`checkFallAutoPhase` (Task 2) · `processCaseBilling`/case-billing-batch (Task 3) · `assignReparaturWerkstatt` + Kanzlei-Handoff `saveFilmcheck` (Task 4). KB-Round-Robin (@Creation, keine Regulierungswirkung — bewusst nicht geblockt, Note Task 1), Provisions-Trigger (Creation+release-gated, kein SV-Provision — kein Gate nötig), Reparatur-Notify (in `assignReparaturWerkstatt`, via Task 4 gegatet) — enumeration deckt die Explore-Reader-Map ab. ✓
- **K5** „sign-into-existing = UPDATE, sonst Duplikat/verworfene Signatur" → **Task 6** ✓ · „Billing/SLA auf POST-Onboarding verschieben" → Direkt-INSERT (Task 1) + `resumeFunnelAfterOnboarding` (Task 5) ✓
- **K4** BEIDE Engines/Finder: P4 fasst die Dispatch-Engines NICHT an (das ist P2-Boost); Task 9 dockt an die bestehende Finder-API (a8fc2a40) ✓

**2. Placeholder-Scan:** keine „TBD"/„handle edge cases" — jede Task hat konkrete Signaturen, DDL-freien Code, echte Tests. Die einzige bewusst offene Stelle ist Task 6 Schritt 5 („welche Variante verträgt b0e963b62s Diff") — eine **Koordinations**-Entscheidung, kein Code-Platzhalter (beide Varianten sind beschrieben).

**3. Typ-Konsistenz:** `gutachtenBereitsErstellt?: boolean` (T1), `kundeHatBestaetigt(claim)` + `OperativeSignals.kundeBestaetigt` (T2, überall gleich benannt), `resumeFunnelAfterOnboarding(fallId)` (T5, konsumiert von T6), `applySAToExistingClaim(admin,{claimId,fallId,signatureUrl})` (T6), `attachGutachtenOhneTransition(admin,{claimId,fallId,svId,file,betrag,userId})` + `vermittlePartnerWerkstatt(formData)` (T7). Durchgängig `{ ok, error? }`-Result.

**4. Bewusst NICHT in P4** (Dependencies/Folgephasen): die „Dein Netzwerk"-Finder-Sektion + Boost (P2/P3), Bindung-Seed `netzwerk_owner_id` (P0/P3), Stripe-Freemium-Billing (P5), Netzwerk-Notifications-Outbox (FUNDAMENT C3), die C1/C2-Umstellung (`transitionClaim`/`createCase`). P4 = Vermittlungs-Flow + Invariant-Gate + Zuweisungs-Verdrahtung, **DDL-frei**, auf den heutigen Ankern.
