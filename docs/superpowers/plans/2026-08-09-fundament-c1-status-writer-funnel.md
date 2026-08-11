# Fundament C1-Finish: Status-Writer-Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development oder superpowers:executing-plans. Steps nutzen Checkbox-Syntax.

**Goal:** Die 2 verbleibenden Ratchet-Baseline-Direkt-Writer auf `operative_status` auf `transitionFallStatus` heben (Baseline 2→0) — schließt die zwei §9-Bullets „operative_status genau ein Writer" + „Event-Log bei jedem Übergang".

**Architecture:** Kleine Engine-Erweiterung (die 2 Nicht-Matrix-Terminal-Closes als breit-erreichbare Targets + `abgeschlossen_am`-Setzen) → dann die 2 Produktions-Writer funneln → die 2 Smoke-Reset-Helper (Backward-Jumps, nicht funnelbar) isolieren + allowlisten. Kein DDL (beide Terminals sind bereits gültige CHECK-Werte + in `CLOSED_OPERATIVE_STATUS` + `CLAIMS_TERMINAL_STATES`).

**Tech Stack:** `src/lib/faelle/state-machine.ts` (Engine), `fall-status-claim-mapping.ts` (Cursor/Clobber — **unverändert**), `terminal-status.ts` (Closed-Set — **unverändert**), `scripts/check-operative-status-writes.mjs` + Baseline.

## Global Constraints

- AGENTS.md gewinnt bei Konflikt. Regel 1 (PR→staging), Regel 4 (Prod-Smoke), 7-Punkte-Audit im Commit.
- **Kein DDL** — `an_externe_kanzlei_uebergeben` + `termin_durchgefuehrt` sind bereits im `claims_operative_status_check` (die Direkt-Writes schreiben sie heute erfolgreich).
- `state-machine.ts` ist engine-kritisch (viele Consumer) → **J1 + J4 Journey-Smokes sind die DoD** (Regel 4 / D1). Voller Build, nicht nur tsc.
- Keine neuen `operative_status`-Werte, keine neuen Status-Achsen.
- Verhaltens-Erhalt: die Direkt-Writes schreiben den Terminal aus JEDEM aktiven Zustand (keine Source-Guard). Der Funnel muss das erhalten → breit-erreichbar (nicht Source-State-Enumeration, die reale Flows bricht).

## Verifizierte Engine-Fakten (Ist-Erhebung 09.08.)

| Aspekt | Stand | Konsequenz |
|---|---|---|
| CHECK-Wert `an_externe_kanzlei_uebergeben`/`termin_durchgefuehrt` | ✅ gültig | kein DDL |
| in `CLOSED_OPERATIVE_STATUS_VALUES` | ✅ (Z.23, 29) | Aktiv-Filter greifen schon |
| in `CLAIMS_TERMINAL_STATES` (Clobber-Guard) | ✅ (Z.20, 21) | resolveCursor schützt sie → **unverändert** |
| `resolveCursorOperativeStatus(term, cur)` | ✅ Pass-through (nicht klage/abgeschlossen) | **unverändert** |
| in `FALL_STATUS_TRANSITIONS`-Matrix | ❌ FEHLT | **→ Task 1** |
| `abgeschlossen_am`-Setzen in Engine-Update-Block | ❌ nur für 'storniert'/'abgeschlossen'/… | **→ Task 1** |
| `phase_transitions`-Event-Log | ✅ schreibt Engine bei jedem Übergang | Funnel schließt die Lücke |
| Emit für neue Terminals | else→`fall.status_changed` = kunde `[web_push,in_app]`, **kein WA** | kunden-sicher, unverändert |

## File Structure

- **Modify** `src/lib/faelle/state-machine.ts`: `BROADLY_REACHABLE_TERMINALS`-Set + Validierungs-Zweig + `abgeschlossen_am`/`endzustand_*`-Setzen für die 2 Terminals.
- **Modify** `src/lib/termine/close-nur-gutachter-termin.ts`: Claim-Close-Write → `transitionFallStatus`.
- **Modify** `src/lib/kanzlei-wunsch/actions.ts`: die 2 echten Terminal-Writes → `transitionFallStatus`; Smoke-Helper raus.
- **Create** `src/lib/kanzlei-wunsch/smoke-reset-actions.ts`: die 2 Smoke-Helper (verschoben) + der geteilte `assertSmokeAdminOrKb`.
- **Modify** `scripts/check-operative-status-writes.mjs`: `smoke-reset-actions.ts` in die Allowlist (Begründung: Backward-Test-Resets, admin/kb-only, keine Produktions-Übergänge).
- **Modify** `scripts/operative-status-writes-baseline.json`: 2 → 0.
- **Test** `src/lib/faelle/__tests__/state-machine.test.ts`: neue Terminal-Übergänge (valide aus aktivem Zustand, abgelehnt aus geschlossenem, `abgeschlossen_am` gesetzt).

---

### Task 1: Engine — Terminal-Reachability + `abgeschlossen_am`

**Files:** Modify `src/lib/faelle/state-machine.ts`; Test `src/lib/faelle/__tests__/state-machine.test.ts`

**Interfaces:**
- Produces: `transitionFallStatus(fallId, 'an_externe_kanzlei_uebergeben'|'termin_durchgefuehrt', {user_id?, grund?})` wird ab jetzt akzeptiert (aus jedem nicht-geschlossenen Zustand), setzt `operative_status` + `abgeschlossen_am` + (für termin_durchgefuehrt) `endzustand_*`, schreibt `phase_transitions` + emittet `fall.status_changed`.

- [ ] **Step 1: Failing Test** — in `state-machine.test.ts` (pure, via die exportierte `istGueltigerFallUebergang` reicht NICHT — die liest nur die Matrix; besser einen exportierten Reachability-Helper testen). Exportiere aus state-machine.ts eine pure Funktion `istTerminalUebergangErlaubt(current: string|null): boolean` (true wenn current gesetzt + nicht in CLOSED_OPERATIVE_STATUS). Test:
```ts
import { istTerminalUebergangErlaubt } from '@/lib/faelle/state-machine'
it('Terminal-Close aus aktivem Zustand erlaubt, aus geschlossenem nicht', () => {
  expect(istTerminalUebergangErlaubt('regulierung')).toBe(true)
  expect(istTerminalUebergangErlaubt('sv-termin')).toBe(true)
  expect(istTerminalUebergangErlaubt('abgeschlossen')).toBe(false)
  expect(istTerminalUebergangErlaubt('storniert')).toBe(false)
  expect(istTerminalUebergangErlaubt(null)).toBe(false)
})
```
- [ ] **Step 2: Run → FAIL** (`istTerminalUebergangErlaubt is not a function`).
- [ ] **Step 3: Implement** in `state-machine.ts`:
```ts
import { CLOSED_OPERATIVE_STATUS } from '@/lib/claims/terminal-status'
// Terminal-Closes, die (wie storniert) aus JEDEM aktiven Zustand erreichbar sind —
// funneln die frueheren Direkt-Writes (kanzlei-wunsch / close-nur-gutachter-termin), die
// keine Source-Guard hatten. Verhaltens-erhaltend: kein aktiver Claim wird abgelehnt.
export const BROADLY_REACHABLE_TERMINALS: ReadonlySet<string> = new Set([
  'an_externe_kanzlei_uebergeben',
  'termin_durchgefuehrt',
])
export function istTerminalUebergangErlaubt(current: string | null): boolean {
  return !!current && !CLOSED_OPERATIVE_STATUS.has(current)
}
```
Dann in `transitionFallStatus`, den Validierungs-Block (aktuell ~Z.139-145) erweitern:
```ts
const allowed = FALL_STATUS_TRANSITIONS[currentStatus]
const istBreitTerminal =
  BROADLY_REACHABLE_TERMINALS.has(newStatus) && istTerminalUebergangErlaubt(currentStatus)
if (!istBreitTerminal && (!allowed || !allowed.includes(newStatus))) {
  throw new Error(`Ungueltiger Status-Uebergang: ${currentStatus} → ${newStatus}. Erlaubt: ${allowed?.join(', ') ?? 'keine'}`)
}
```
- [ ] **Step 4: abgeschlossen_am + endzustand-Felder** — im Update-Block (nach dem `'abgeschlossen'`-if, ~Z.170) ergänzen:
```ts
if (newStatus === 'an_externe_kanzlei_uebergeben' || newStatus === 'termin_durchgefuehrt') {
  update.abgeschlossen_am = now
  // termin_durchgefuehrt trug den nur_gutachter-Endzustand-Audit (byUserId/grund) — erhalten.
  if (metadata?.user_id !== undefined) update.endzustand_gesetzt_durch_user_id = metadata.user_id ?? null
  update.endzustand_gesetzt_am = now
  if (metadata?.grund) update.endzustand_grund = metadata.grund
}
```
⚠ **Verify**: `abgeschlossen_am`/`endzustand_*` sind claims-Spalten → `splitOrKeepFaelleUpdate` routet sie (wie bei 'abgeschlossen') auf claims. `endzustand_*` sind KEINE kanzlei_faelle/auftraege-Peel-Spalten (grep `peelKanzleiFaelleColumns`/`peelAuftraegeColumns` → nicht enthalten). Falls doch: nach dem Peel prüfen dass sie im claimsUpdate landen.
- [ ] **Step 5: Test grün** (`istTerminalUebergangErlaubt`) + ergänze einen Übergangs-Test (Mock-DB oder die bestehende state-machine.test.ts-Infra) der einen aktiven Claim → 'termin_durchgefuehrt' transitioniert und `abgeschlossen_am` gesetzt + `phase_transitions`-Insert versucht sieht.
- [ ] **Step 6: Commit** (`feat(fundament-C1): Engine akzeptiert die 2 breit-erreichbaren Terminal-Closes`).

### Task 2: Funnel `close-nur-gutachter-termin.ts` (Baseline 2→1)

**Files:** Modify `src/lib/termine/close-nur-gutachter-termin.ts`

**Interfaces:**
- Consumes: `transitionFallStatus` (Task 1), `faelle_claim_bridge` (claimId→fallId).

- [ ] **Step 1:** Der Termin-Update (Schritt 1, `durchgefuehrt_am` — Billing-Anker) bleibt **unverändert** (kein Status). Nur der **Claim-Close** (Z.80-93, das `.from('claims').update({operative_status:'termin_durchgefuehrt',…})`) wird ersetzt.
- [ ] **Step 2:** fallId auflösen (transitionFallStatus braucht fallId, die Funktion hat claimId):
```ts
const { data: br } = await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', claimId).maybeSingle()
const fallId = br?.fall_id as string | undefined
```
- [ ] **Step 3:** Claim-Close via Engine (non-fatal, wie zuvor — der durchgefuehrt_am-Anker steht schon):
```ts
if (fallId) {
  try {
    const { transitionFallStatus } = await import('@/lib/faelle/state-machine')
    await transitionFallStatus(fallId, 'termin_durchgefuehrt', { user_id: byUserId ?? undefined, grund })
  } catch (err) {
    console.error('[AAR-939] termin_durchgefuehrt via Engine fehlgeschlagen (non-fatal):', err instanceof Error ? err.message : err)
  }
}
```
Der bisherige Guard (`.or(operative_status.is.null,not.in.CLOSED)`) wird durch `istTerminalUebergangErlaubt` in der Engine ersetzt (bereits-geschlossen → Engine wirft → caught, kein Doppel-Close). ✅ Idempotenz erhalten.
- [ ] **Step 4:** `grep -n "operative_status" src/lib/termine/close-nur-gutachter-termin.ts` → 0 Writes. Import `CLOSED_OPERATIVE_STATUS_PG` entfernen falls verwaist.
- [ ] **Step 5:** Baseline aktualisieren: `scripts/operative-status-writes-baseline.json` → nur noch `kanzlei-wunsch/actions.ts`. Lokal `npm run check:operative-status-writes` (warn) → close-nur-gutachter nicht mehr gelistet.
- [ ] **Step 6: Commit.**

### Task 3: Funnel `kanzlei-wunsch/actions.ts` echte Writes

**Files:** Modify `src/lib/kanzlei-wunsch/actions.ts`

- [ ] **Step 1:** In `versendeKanzleiPaketAnEigeneKanzlei` (Z.339-349) den `.from('claims').update({kanzlei_uebergeben_am, operative_status:'an_externe_kanzlei_uebergeben', abgeschlossen_am})` teilen: `kanzlei_uebergeben_am` bleibt Direkt-Write (Nicht-Status-Marker), Status+abgeschlossen_am via Engine:
```ts
const { error: uErr } = await admin.from('claims').update({ kanzlei_uebergeben_am: now }).eq('id', claimId)
if (uErr) return { ok: false, error: uErr.message }
try {
  const { transitionFallStatus } = await import('@/lib/faelle/state-machine')
  await transitionFallStatus(fall.id, 'an_externe_kanzlei_uebergeben', { user_id: auth.userId })
} catch (err) {
  console.error('[kanzlei-wunsch] an_externe_kanzlei_uebergeben via Engine (non-fatal):', err instanceof Error ? err.message : err)
}
```
(`fall.id` ist in scope; `auth.userId` aus `requireKundeOfClaim`.)
- [ ] **Step 2:** Identisch in `bestaetigeSelbstEinreichungOhneKanzlei` (Z.410-419).
- [ ] **Step 3:** `abgeschlossen_am` NICHT mehr im Direkt-Update (Engine setzt es). Verify Timeline-Insert bleibt (redundant zum Engine-Timeline, aber harmlos/aussagekräftiger — belassen, Notiz im Commit).
- [ ] **Step 4: Commit** (Datei noch auf Baseline wegen Smoke-Helper → Task 4).

### Task 4: Smoke-Helper isolieren + allowlisten (Baseline 1→0)

**Files:** Create `src/lib/kanzlei-wunsch/smoke-reset-actions.ts`; Modify `src/lib/kanzlei-wunsch/actions.ts`, `scripts/check-operative-status-writes.mjs`, `scripts/operative-status-writes-baseline.json`

**Warum Allowlist statt Funnel:** `smokeResetAufKanzleiWunsch`→'regulierung' + `smokeResetAufLexDriveVollmachtSigniert`→'in_kommunikation_vs' sind **Backward-Test-Resets** (setzen einen Claim ZURÜCK für Walkthrough-Tests) — keine Vorwärts-Übergänge, nicht funnelbar. admin/kb-only, mutieren nur Test-Fixtures. = legitime Allowlist-Ausnahme (analog `endzustand-actions`/`lexdrive`).

- [ ] **Step 1:** `smokeResetAufKanzleiWunsch`, `smokeResetAufLexDriveVollmachtSigniert`, `smokeResetAufLexDriveVollmachtOffen`, `smokePflichtdokumenteAnlegen` + `assertSmokeAdminOrKb` nach `smoke-reset-actions.ts` verschieben (`'use server'`, gleiche Imports). In `actions.ts` löschen.
- [ ] **Step 2:** Consumer der Smoke-Actions umbiegen: `grep -rn "smokeResetAuf\|smokePflichtdokumente" src/` → Imports auf `@/lib/kanzlei-wunsch/smoke-reset-actions` repointen.
- [ ] **Step 3:** `check-operative-status-writes.mjs`-Allowlist um `src/lib/kanzlei-wunsch/smoke-reset-actions.ts` ergänzen (Begründung-Kommentar: Backward-Test-Resets).
- [ ] **Step 4:** `grep -n "operative_status" src/lib/kanzlei-wunsch/actions.ts` → 0. `operative-status-writes-baseline.json` → `{count:0, files:[]}`.
- [ ] **Step 5:** `npm run check:operative-status-writes -- --ratchet` (lokal ohne Flag = warn) → 0 Verletzer außerhalb Allowlist. **Voller Build** (`npm run build`).
- [ ] **Step 6: Commit.**

### Task 5: Ratchet scharf + Prod-Smoke (DoD)

- [ ] **Step 1:** CI grün (build + vitest + `check:operative-status-writes --ratchet` = Baseline 0).
- [ ] **Step 2: Prod-Smoke (Regel 4, nach Deploy)** — J1/J4 + der spezifische Funnel-Nachweis:
  - **nur_gutachter-Close**: über die UI einen Test-nur_gutachter-Termin als durchgeführt markieren → SQL: `SELECT operative_status, abgeschlossen_am FROM claims WHERE id=<testclaim>` = `termin_durchgefuehrt` + `abgeschlossen_am` gesetzt; `SELECT * FROM phase_transitions WHERE claim_id=<testclaim> ORDER BY created_at DESC LIMIT 1` = `to_phase='termin_durchgefuehrt'` (**Event-Log-Lücke geschlossen**).
  - **kanzlei-eigene**: Test-Kunde „selbst einreichen / eigene Kanzlei" → `operative_status='an_externe_kanzlei_uebergeben'` + `phase_transitions`-Row. Test-Konten `telefon=NULL` (kein Kunden-WA; der `fall.status_changed`-Emit ist web_push+in_app).
  - **Dedup/Idempotenz**: 2× Close → 1 Terminal, 2. Engine-Call wirft (bereits geschlossen) + caught.
- [ ] **Step 3:** Marker + FUNDAMENT §2-C1-Zelle + §9-Bullets (ein-Writer + Event-Log) auf done.

## DoD (Gesamt, aus FUNDAMENT §C1 + §9)
- `grep -rn "\.from('claims')\.update" src/ | grep operative_status` → nur Engine + Allowlist (state-machine, endzustand-actions, lexdrive, smoke-reset-actions).
- `operative-status-writes-baseline.json` = 0; Ratchet in CI aktiv.
- Event-Log (`phase_transitions`) wird bei den 2 vormaligen Direkt-Terminals geschrieben (Prod-SQL-Stichprobe).
- J1 + J4 Journey-Smokes grün.

## Nicht-Ziele
- Keine neuen operative_status-Werte, keine DDL, keine Timeline-UI-Umbauten.
- Keine Migration der 3 Allowlist-Writer (state-machine/endzustand/lexdrive bleiben sanktioniert).
- Kein FG-Flag-Umbau (Verfassung §3 = FG-Programm; dieser Funnel berührt keine Interaktions-Flags).

## Self-Review
- **Spec-Coverage:** beide §9-C1-Bullets (ein-Writer via Baseline 0; Event-Log via Funnel→phase_transitions). ✓
- **Placeholder-Scan:** Engine-Code + Funnel-Code konkret gezeigt. ✓
- **Typ-Konsistenz:** `istTerminalUebergangErlaubt`/`BROADLY_REACHABLE_TERMINALS` in Task 1 definiert, in Task 1-Validierung genutzt. `transitionFallStatus`-Signatur `(fallId, newStatus, {user_id?, grund?})` überall gleich. ✓
- **Regression-Anker:** breit-erreichbar (kein Source-Guard-Verlust); Clobber-Guard/Closed-Set schon vorbereitet; Emit kein WA; Idempotenz via Engine-throw+catch. J1/J4-Smokes fangen den Rest.
