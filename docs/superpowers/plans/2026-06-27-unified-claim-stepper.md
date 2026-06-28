# Unified Claim Stepper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Der Claim-Stepper (main_phase/sub_phase) wird kanonisch aus `claims.operative_status` abgeleitet (statt aus Milestones), deterministisch je nach DB-Feld-Befüllung — Divergenz konstruktiv tot.

**Architecture:** Additiv. `getClaimLifecycle` bekommt ein optionales `operativeStatus`-Input. Neue Kaskade: (1) `claimStatus` terminal → Abschluss; (2) `claimStatus` regulierung-signal + operative<Regulierung → Regulierung; (3) `operativeStatus` befüllt → main+sub via `OPERATIVE_PHASE`-Map; (4) operativeStatus NULL/unbekannt → **bestehende Milestone-Kaskade unverändert** (Fallback). `v_claim_phase` spiegelt das bit-gleich (Parity-Gate). Output-Taxonomie unverändert → 40+ Konsumenten unangetastet.

**Tech Stack:** TypeScript, vitest, Supabase Postgres (View via apply_migration-Plugin), Next.js.

## Global Constraints

- DDL NUR via `mcp__plugin_supabase_supabase__apply_migration` (AGENTS.md Regel 2); Migration-File exakt nach getrackter Version benennen.
- `v_claim_phase` (SQL) ↔ `getClaimLifecycle` (TS) MÜSSEN bit-gleich bleiben (Parity-Gate `probe-claim-phase-parity.mjs` + `lifecycle.test.ts`).
- **Kollision** mit `kitta/rls-haertung-claim-views` — vor `apply_migration` von `v_claim_phase` aktuelles `pg_get_viewdef` + `reloptions` re-lesen, deren RLS/security preserve-n, nur SELECT-Ableitung ersetzen; Marker `[[coordination-unified-claim-stepper]]` pingen.
- Output-Domäne (main_phase ∈ erfassung/begutachtung/regulierung/abschluss; sub_phase ∈ bestehende `ClaimSubPhase`) NICHT erweitern — kein neuer Sub-Phasen-Wert.
- Branch `kitta/unified-claim-stepper` (off staging). Commit-Format mit 7-Punkte-Audit.

---

### Task 1: `lifecycle.ts` — operative_status als kanonische Phasen-Quelle

**Files:**
- Modify: `src/lib/claims/lifecycle.ts`
- Test: `src/lib/claims/lifecycle.test.ts`

**Interfaces:**
- Produces: `getClaimLifecycle(input)` — `ClaimLifecycleInput` erhält optional `operativeStatus?: string | null`. Rückgabe-Shape (`ClaimLifecycle`) unverändert.
- Consumes (intern): `OPERATIVE_PHASE: Record<string,{main:ClaimMainPhase;sub:ClaimSubPhase}>`, `leadSubphase(lead): ClaimSubPhase`.

- [ ] **Step 1: Failing tests** (an `lifecycle.test.ts` anhängen):

```ts
describe('getClaimLifecycle — operative_status als kanonische Quelle (Unified Stepper)', () => {
  const lead = { sa_unterschrieben: true, vollmacht_signiert_am: TS, onboarding_complete: true }
  it('sv-termin -> begutachtung/termin (auch OHNE erstgutachten-Auftrag — behebt Erfassung-Haenger)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'sv-termin' })
    expect(r.mainPhase).toBe('begutachtung'); expect(r.subPhase).toBe('termin')
  })
  it('gutachten-eingegangen -> begutachtung/gutachten', () => {
    expect(getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'gutachten-eingegangen' }).subPhase).toBe('gutachten')
  })
  it('anschlussschreiben -> regulierung/anschlussschreiben', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'anschlussschreiben' })
    expect(r.mainPhase).toBe('regulierung'); expect(r.subPhase).toBe('anschlussschreiben')
  })
  it('zahlung-eingegangen -> regulierung/auszahlung (kein Auto-Abschluss)', () => {
    expect(getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'zahlung-eingegangen' }).mainPhase).toBe('regulierung')
  })
  it('operative erfassung-Bucket -> Lead-Sub (ersterfassung + Vollmacht signiert -> onboarding_offen)', () => {
    expect(getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'ersterfassung' }).subPhase).toBe('onboarding_offen')
  })
  it('operative=abgeschlossen + claimStatus reguliert_vollstaendig -> abschluss/erfolgreich_reguliert', () => {
    const r = getClaimLifecycle({ lead: null, auftraege: [], kanzleiFall: null, operativeStatus: 'abgeschlossen', claimStatus: 'reguliert_vollstaendig' })
    expect(r.mainPhase).toBe('abschluss'); expect(r.subPhase).toBe('erfolgreich_reguliert')
  })
  it('terminal claimStatus schlaegt operative_status (storniert ueberschreibt sv-termin)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'sv-termin', claimStatus: 'storniert' })
    expect(r.mainPhase).toBe('abschluss'); expect(r.subPhase).toBe('storniert')
  })
  it('reg-signal (in_kommunikation_vs) hebt operative=sv-termin auf Regulierung', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'sv-termin', claimStatus: 'in_kommunikation_vs' })
    expect(r.mainPhase).toBe('regulierung'); expect(r.subPhase).toBe('versicherungskontakt')
  })
  it('reg-signal greift NICHT zurueck wenn operative bereits >= regulierung (auszahlung bleibt)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [], kanzleiFall: null, operativeStatus: 'zahlung-eingegangen', claimStatus: 'abgelehnt' })
    expect(r.subPhase).toBe('auszahlung')
  })
  it('operativeStatus NULL -> bestehende Milestone-Kaskade (Backward-Compat: aktiver Erstgutachten -> begutachtung)', () => {
    const r = getClaimLifecycle({ lead, auftraege: [mkAuftrag({ typ: 'erstgutachten', status: 'termin' })], kanzleiFall: null, operativeStatus: null })
    expect(r.mainPhase).toBe('begutachtung'); expect(r.subPhase).toBe('termin')
  })
})
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run src/lib/claims/lifecycle.test.ts` → FAIL (operativeStatus ignoriert).

- [ ] **Step 3: Implement** in `lifecycle.ts`:

(a) `ClaimLifecycleInput` + optionales Feld:
```ts
  /** CMM-XX Unified Stepper: kanonische Phasen-Quelle (wenn befuellt). */
  operativeStatus?: string | null
```

(b) Map + Lead-Sub-Helper (vor `getClaimLifecycle`):
```ts
const OPERATIVE_PHASE: Record<string, { main: ClaimMainPhase; sub: ClaimSubPhase }> = {
  ersterfassung: { main: 'erfassung', sub: 'sa_offen' },
  onboarding: { main: 'erfassung', sub: 'onboarding_offen' },
  'sv-gesucht': { main: 'erfassung', sub: 'vollmacht_offen' },
  'sv-zugewiesen': { main: 'begutachtung', sub: 'termin' },
  'sv-termin': { main: 'begutachtung', sub: 'termin' },
  besichtigung: { main: 'begutachtung', sub: 'besichtigung' },
  'begutachtung-laeuft': { main: 'begutachtung', sub: 'gutachten' },
  'gutachten-eingegangen': { main: 'begutachtung', sub: 'gutachten' },
  filmcheck: { main: 'begutachtung', sub: 'filmcheck' },
  'qc-pruefung': { main: 'begutachtung', sub: 'qc-pruefung' },
  'kanzlei-uebergeben': { main: 'begutachtung', sub: 'kanzlei_uebergabe' },
  anschlussschreiben: { main: 'regulierung', sub: 'anschlussschreiben' },
  regulierung: { main: 'regulierung', sub: 'versicherungskontakt' },
  'regulierung-laeuft': { main: 'regulierung', sub: 'versicherungskontakt' },
  'vs-kuerzt': { main: 'regulierung', sub: 'vs-kuerzt' },
  'nachbesichtigung-laeuft': { main: 'regulierung', sub: 'nachbesichtigung-laeuft' },
  'vs-abgelehnt': { main: 'regulierung', sub: 'nachforderung' },
  klage: { main: 'regulierung', sub: 'nachforderung' },
  'zahlung-eingegangen': { main: 'regulierung', sub: 'auszahlung' },
  abgeschlossen: { main: 'abschluss', sub: 'erfolgreich_reguliert' },
  storniert: { main: 'abschluss', sub: 'storniert' },
}
function leadSubphase(lead: ClaimLifecycleInput['lead']): ClaimSubPhase {
  if (lead?.vollmacht_signiert_am) return 'onboarding_offen'
  if (lead?.sa_unterschrieben) return 'vollmacht_offen'
  return 'sa_offen'
}
```

(c) In `getClaimLifecycle`, NACH dem terminal-Block (`if (terminal) {...}`), VOR der Nachbesichtigungs-Logik einfuegen:
```ts
  const operativeStatus = input.operativeStatus ?? null
  const sideQuests = auftraege.filter(
    (a) => (a.typ === 'nachbesichtigung' || a.typ === 'stellungnahme') && a.status !== 'abgeschlossen',
  )
  // Regel 2: claims.status regulierung-signal hebt an, falls operative noch < Regulierung.
  const regSub = claimStatus ? REGULIERUNG_STATUS_SUBSTATE[claimStatus] : undefined
  const opMainIdx = operativeStatus && OPERATIVE_PHASE[operativeStatus]
    ? MAIN_PHASE_INDEX[OPERATIVE_PHASE[operativeStatus].main] : -1
  if (regSub && opMainIdx < MAIN_PHASE_INDEX['regulierung']) {
    return { mainPhase: 'regulierung', subPhase: regSub, aktiveSideQuests: sideQuests, aktiverAuftrag: sideQuests[0] ?? null }
  }
  // Regel 3: operative_status ist die kanonische Quelle.
  if (operativeStatus && OPERATIVE_PHASE[operativeStatus]) {
    const { main, sub } = OPERATIVE_PHASE[operativeStatus]
    let resolved: ClaimSubPhase = sub
    if (main === 'erfassung') resolved = leadSubphase(lead)
    else if (main === 'abschluss' && operativeStatus !== 'storniert') {
      resolved = (claimStatus && ABSCHLUSS_SUBSTATE[claimStatus]) ? ABSCHLUSS_SUBSTATE[claimStatus] : 'erfolgreich_reguliert'
    }
    const aktiv = main === 'begutachtung' ? (auftraege.find((a) => a.typ === 'erstgutachten') ?? null) : (sideQuests[0] ?? null)
    return { mainPhase: main, subPhase: resolved, aktiveSideQuests: sideQuests, aktiverAuftrag: aktiv }
  }
  // Regel 4: operativeStatus NULL/unbekannt -> bestehende Milestone-Kaskade (unveraendert) ...
```
(Die bestehende `REGULIERUNG_STATUS_SUBSTATE`-Behandlung weiter unten in der Milestone-Kaskade ENTFERNEN — Regel 2 deckt sie jetzt universell; sonst bleibt sie als toter Zweig.)

- [ ] **Step 4: Run, verify PASS** — `npx vitest run src/lib/claims/lifecycle.test.ts` → alle grün (neue + bestehende; bestehende decken jetzt den operativeStatus=undefined-Fallback ab).

- [ ] **Step 5: Commit** — `feat(claim-stepper): operative_status als kanonische Phasen-Quelle in getClaimLifecycle` + Audit-Block.

---

### Task 2: Loader lädt + reicht `operative_status` durch

**Files:**
- Modify: `src/lib/claims/get-claim-lifecycle-for-claim.ts:53-58, 84`
- Test: `src/lib/claims/get-claim-lifecycle-for-claim.test.ts` (operative_status-Durchreichung mocken)

**Interfaces:** Consumes Task 1 `getClaimLifecycle({...operativeStatus})`.

- [ ] **Step 1: Failing test** — mock claim mit `operative_status: 'sv-termin'`, ohne auftraege → erwartet `lifecycle.mainPhase === 'begutachtung'`.
- [ ] **Step 2: Run FAIL.**
- [ ] **Step 3: Implement** — Select erweitern: `.select('status, lead_id, service_typ, operative_status')`; `const operativeStatus = (claim?.operative_status as string|null) ?? null`; an `getClaimLifecycle({ lead, auftraege, kanzleiFall, claimStatus, operativeStatus })` durchreichen (Z.84).
- [ ] **Step 4: Run PASS** (+ `npx tsc --noEmit` — 0 neue Errors außer pre-existing sharp/@react-pdf-Env-Noise).
- [ ] **Step 5: Commit.**

---

### Task 3: `v_claim_phase` SQL — bit-gleich zur TS-Kaskade (DDL, KOORDINIERT)

**Files:**
- Create: `supabase/migrations/<plugin-version>_v_claim_phase_operative_source.sql`

- [ ] **Step 1:** Vor Apply — `execute_sql`: aktuelles `pg_get_viewdef('v_claim_phase', true)` + `SELECT reloptions FROM pg_class WHERE relname='v_claim_phase'` (security_invoker?) re-lesen. Falls die rls-haertung-Session security/Spalten geändert hat → preserven. **Marker pingen** ([[coordination-unified-claim-stepper]]).
- [ ] **Step 2:** Neue View-SELECT bauen — `main_phase`/`sub_phase` als CASE in der Kaskade: (1) claims.status terminal; (2) reg-signal + operative<regulierung; (3) `c.operative_status` via CASE-Mapping (gleiche Werte wie `OPERATIVE_PHASE`; erfassung-sub aus Lead-LATERAL, abschluss-sub aus claims.status); (4) operative IS NULL → bestehende Milestone-LATERAL-Logik (unverändert übernehmen). `claim_id` + alle bestehenden Output-Spalten erhalten.
- [ ] **Step 3:** `apply_migration({ name: 'v_claim_phase_operative_source', query: '<CREATE OR REPLACE VIEW ...>' })`.
- [ ] **Step 4:** `list_migrations` → getrackte Version <V> ablesen; Migration-File exakt als `<V>_v_claim_phase_operative_source.sql` committen (Twin-Drift vermeiden).
- [ ] **Step 5:** `execute_sql` Verifikation: `SELECT operative_status, main_phase, count(*) FROM claims c JOIN v_claim_phase v ON v.claim_id=c.id GROUP BY 1,2` → die 55 Erfassung-Hänger jetzt korrekt (sv-termin→begutachtung).
- [ ] **Step 6: Commit** Migration-File.

---

### Task 4: Parity + Snapshot + Verifikation

**Files:** Modify `scripts/probe-claim-phase-parity.mjs` (falls Input-Assembly operative_status braucht).

- [ ] **Step 1:** `node scripts/probe-claim-phase-parity.mjs` → SQL `v_claim_phase` == TS `getClaimLifecycle` auf allen 89 Live-Claims (Parity-Gate grün). Falls die Probe den Loader-Input baut → operative_status ergänzen.
- [ ] **Step 2:** Snapshot-Diff dokumentieren: `SELECT claim_id, operative_status, main_phase FROM ...` vor/nach — die bewusst geänderten Fälle (Erfassung-Hänger → korrekte Phase) auflisten; KEINE unerwarteten Sprünge.
- [ ] **Step 3:** `npx vitest run src/lib/claims/` + `npx tsc --noEmit` grün.
- [ ] **Step 4: Konsumenten-Sweep:** `grep -rn "getClaimLifecycle(" src/` → jeder Caller kompiliert (operativeStatus optional → kein Bruch); Loader-Pfad liefert neue Phase. `FallPhasenPanel`/claim-phase-map unverändert (lesen Output).
- [ ] **Step 5: Commit** + PR gegen staging.

## Self-Review

- **Spec coverage:** Kaskade (1-4) ✓ Task 1+3; Loader ✓ Task 2; Parity ✓ Task 4; A-Auto-Fix ✓ Task 1/3-Verifikation; Koordination ✓ Task 3 Step 1.
- **Placeholder:** keine — Code + Befehle vollständig.
- **Type-Konsistenz:** `OPERATIVE_PHASE`/`leadSubphase`/`operativeStatus` durchgängig; `ClaimSubPhase`-Werte alle bestehend (kein neuer Wert).
- **Edge:** operative=abgeschlossen ohne claimStatus → erfolgreich_reguliert (dokumentiert); unbekannter operative_status → Fallback Regel 4.
