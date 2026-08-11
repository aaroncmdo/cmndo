# Termin-Status → Claim-Workstate + Silent-Fail-Bugs Implementation Plan

> # ✅ ABGESCHLOSSEN / UEBERHOLT (verifiziert 2026-08-11) — NICHT MEHR AUSFUEHREN
>
> Alle drei Phasen sind erledigt, Phase 2 auf einem **besseren** Weg als hier geplant:
>
> * **Phase 0 (Bug A + Bug B)** — gefixt im „Status-Enum-Audit 05.07.". `git grep "status: 'geplant'"`
>   in `src/lib/onboarding/slots.ts` = 0 Treffer; `kunde_storniert` existiert nur noch als
>   erklaerender FIX-Kommentar in `src/lib/termine/kb-booking.ts:272`.
> * **Phase 1 (Resolver)** — `abgesagt`/`abgelehnt` sind im `aktTermin`-Filter; separat nochmals
>   per TDD abgesichert (Session 3c886b70, PR #5149).
> * **Phase 2 (Backstop) — UEBERHOLT durch `check:flag-drift`.** Task 2.1/2.2 wollten einen
>   *tabellen-spezifischen* `check:gutachter-termine-status` bauen. Gebaut wurde stattdessen der
>   **allgemeine** Guard (`scripts/lib/flag-drift-scan.mjs` + `scripts/check-flag-drift.mjs`), der
>   seit 22.07. **ALLE** public ANY-ARRAY-enum-CHECKs abdeckt — Ground-Truth ist der automatisch
>   per Cron regenerierte DB-Snapshot `scripts/lib/status-check-constraints.json`
>   (262 Spalten, inkl. aller 9 `gutachter_termine`-CHECK-Spalten). Er laeuft in CI mit
>   `--ratchet` (`.github/workflows/ci.yml:181`) und ist in AGENTS.md §Flag-Drift-Gate dokumentiert.
>
>   **Wirksamkeit gegen genau diesen Plan verifiziert** (11.08., `scanContent` gegen den echten
>   Snapshot): `geplant` → 1 Hit · `kunde_storniert` → 1 Hit · gueltiges `bestaetigt` → 0 Hits ·
>   `.from('termine')` mit `geplant` (dort gueltig) → 0 Hits. Der Snapshot-Wertesatz ist
>   deckungsgleich mit dem prod-`gutachter_termine_status_check` (12 Werte, per MCP geprueft).
>
>   ⚠ **Einen eigenen `check:gutachter-termine-status` zu bauen waere Duplikation** eines
>   allgemeineren, bereits CI-verdrahteten Guards (Audit-Punkt 3). Task 2.3 (typ-schmaler
>   Wrapper `updateGutachterTerminStatus`) ist damit ebenfalls hinfaellig — der Ratchet
>   erzwingt die Gueltigkeit bereits, ohne Call-Site-Migration.
>
> Konsequenz fuer Handoff-Punkt **A4**: „zwei nie gebaute Ratchet-Guards" ist fuer FG2 **stale**.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax.
> **Isolation:** implement in a dedicated worktree. ⚠ COORDINATION: this edits the termine reservation engine (slots.ts / kb-booking.ts / gutachter_termine) — the SAME area another session is debugging (melde-schaden hard-reservierung `reserviert:false`). This work MUST be owned by that same termine session or explicitly serialized after it. Do NOT run as a parallel session editing termine files.

**Goal:** Fix two CHECK-invalid silent-fail termin-status writes, then close the gap where a cancelled/rejected `gutachter_termine` leaves the claim's derived phase showing a stale active termin — plus a static backstop so future CHECK-invalid status literals fail before shipping.

**Architecture:** `gutachter_termine.status` is constrained by `gutachter_termine_status_check` (12 valid values). Two write-sites (`slots.ts:bestaetigeSlot`, `kb-booking.ts:cancelKbTermin`) write non-member literals (`geplant`, `kunde_storniert`) → the UPDATE is rejected by Postgres → the error is swallowed by fire-and-forget / mislabelled callers. Separately, the claim's derived phase is computed by two engines: the **primary** `v_claim_phase` ⟷ `getClaimLifecycle` (reads termin-progress only via `auftraege.status`, moved forward-only by trigger `tg_termin_sync_auftrag_status`) and the **fine-grained** `resolveSubphase` (reads `gutachter_termine` directly with a filter that excludes only `storniert/verlegt/verschoben`). A cancelled/rejected termin therefore keeps `resolveSubphase` selecting the dead termin (showing a stale SV-unterwegs / Termin-Erinnerung subphase). The fix is read-side in the resolver, consistent with the spec's derive-at-read philosophy; the primary engine intentionally stays in `begutachtung` (the auftrag genuinely still needs a new termin) — documented below, no DDL.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, vitest.

## Global Constraints
- Nie direkt auf `main` pushen — Feature-Branch `kitta/aar-<nr>-<slug>`, PR gegen `staging` (AGENTS.md Regel 1).
- DDL nur via `mcp__plugin_supabase_supabase__apply_migration` → `list_migrations` → committe `supabase/migrations/<V>_<name>.sql` (Dateiname == getrackte Version) → verifiziere per `execute_sql` READ (AGENTS.md Regel 2). **Dieser Plan braucht kein DDL** (siehe Phase-1-Entscheidung).
- Kein unbegleiteter Stash am Session-Ende (AGENTS.md Regel 3).
- Server-Actions liefern `{ ok: boolean; error?: string }` (nicht `throw` mischen); non-kritische Sub-Sends in try/catch; `revalidatePath` bei jedem Write nachziehen.
- 7-Punkte-Post-Task-Audit + Audit-Block in jeder Commit-Message + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Frontend-Umlaute Pflicht (echte `ä/ö/ü/ß`); Backend/Comments/Tests ASCII erlaubt. Diese Änderungen betreffen fast nur Backend-Logik — keine neuen UI-Strings.
- Spaltennamen/Enum-Werte nie raten — gegen Baseline/Migrationen verifizieren. `gutachter_termine.status` gültig (CHECK, baseline:6606 + `20260612011809`): `reserviert, bestaetigt, abgelehnt, abgesagt, storniert, abgeschlossen, sv_gesucht, gegenvorschlag, verschoben, verlegt, verlegung_pending, dispatch_pending`.
- Alle file:line = Stand 2026-07-11 — **vor jedem Task re-verifizieren** (Zeilen driften).
- TDD: erst ein **fehlschlagender** vitest mit echtem Code, laufen lassen + Fehlschlag beobachten, dann minimale echte Impl, laufen lassen + grün, dann committen.

---

## File Structure

**Edited (Impl):**
- `src/lib/onboarding/slots.ts` — Bug A: `bestaetigeSlot` (`~:190`) `status:'geplant'` → `'bestaetigt'`.
- `src/lib/termine/kb-booking.ts` — Bug B: `cancelKbTermin` (`~:268`) `status:'kunde_storniert'` → `'abgesagt'`.
- `src/lib/fall/subphase-resolver.ts` — Phase 1: `aktTermin`-Filter (`~:208-210`) um `abgesagt`/`abgelehnt` erweitern.

**New (Tests):**
- `src/lib/onboarding/slots.test.ts` — Bug A unit test (thenable-recorder-Stub).
- `src/lib/termine/kb-booking.test.ts` — Bug B unit test.
- (Phase 1 nutzt die **bestehende** `src/lib/fall/subphase-resolver.test.ts` — neue `describe`-Blöcke.)

**New (Phase 2 backstop):**
- `scripts/lib/gutachter-termine-status-scan.mjs` — pure scanner (`scanContent` / `diffBaseline`), Vorbild `scripts/lib/termin-engine-contract-scan.mjs`.
- `scripts/lib/gutachter-termine-status-scan.test.mjs` — vitest für den Scanner.
- `scripts/check-gutachter-termine-status.mjs` — CLI-Wrapper (warn / --ratchet / --update-baseline), Vorbild `scripts/check-termin-engine-contract.mjs`.
- `scripts/gutachter-termine-status-baseline.json` — generiert (Boy-Scout-Baseline).
- `src/lib/termine/update-gutachter-termin-status.ts` — dünner typ-schmaler Wrapper `updateGutachterTerminStatus(db, id, status)` mit `GutachterTerminStatus`-Union.
- `src/lib/termine/update-gutachter-termin-status.test.ts` — vitest.
- `package.json` — Script-Eintrag `check:gutachter-termine-status`.

**Read-only Referenzen (nicht ändern):**
- `src/lib/claims/lifecycle.ts` (`getClaimLifecycle`) + `supabase/migrations/20260602083708_cmm74_v_claim_phase_operative_subphases.sql` (`v_claim_phase`) — primäre Engine, liest Termine NUR via `auftraege.status`.
- `supabase/migrations/00000000000000_baseline_public_schema.sql:3170-3212` (`tg_termin_sync_auftrag_status`) + `:17757` (Trigger auf `sv_angekommen_am, durchgefuehrt_am, auftrag_id`).
- `src/lib/termine/engine/state-transitions.ts` (`AbsageStatus = 'abgesagt' | 'storniert' | 'abgelehnt'`, `bestaetige()` setzt `status:'bestaetigt'`).
- `src/lib/fall/subphase-resolver-input.ts` (Loader; `TERMIN_SELECT` liest bereits `status`).
- `src/app/mitarbeiter/performance/page.tsx:83-90` (gutachter_termine-Reader — liest nur `bestaetigt`).

---

## Architektur-Befund & Entscheidungen (VOR dem Bau lesen)

### Bug A — intended status = `bestaetigt` (Beweis)
`slots.ts:bestaetigeSlot` (`~:182-207`) ist ein Alt-/GFA-Wizard-Bestätigungspfad. Es schreibt `.update({ status:'geplant' }).eq('id',terminId).eq('status','reserviert')`. `geplant` ist **nicht** im CHECK → 0 Rows getroffen bzw. Constraint-Reject → `terminErr` bleibt oft null (kein Match ≠ Fehler) → `{ ok:true }` **obwohl der Termin `reserviert` bleibt**.
Der **kanonische** Bestätigungspfad `src/lib/termine/engine/bestaetige.ts:36` setzt `status:'bestaetigt'` (+ `final_verbindlich_ab`, + erstgutachten-Auftrag). Der gutachter_termine-Reader in `mitarbeiter/performance/page.tsx:89` liest ausschließlich `['bestaetigt']`. `geplant` ist zudem der Legacy-`termine`-Tabellen-Default (baseline:11182) — Verwechslung mit der falschen Tabelle. → **`geplant` → `bestaetigt`.** (Fehlende Seiteneffekte `final_verbindlich_ab`/Auftrag-Anlage werden **notiert**, aber Phase 0 bleibt der minimale Literal-Fix, damit die UPDATE überhaupt greift; Engine-Adoption ist ein separater koordinierter Sweep, s. Consumer-Kommentar `slots.ts:154`.)

### Bug B — intended status = `abgesagt` (Beweis)
`kb-booking.ts:cancelKbTermin` (`~:264-271`) schreibt `.update({ status:'kunde_storniert', cancelled_at }).eq('id',terminId)` und meldet bei Fehler „Stornierung fehlgeschlagen: …". `kunde_storniert` ist **nicht** im CHECK → Reject → der Kunde-KB-Beratungstermin-Storno ist **komplett kaputt** (User sieht „Stornierung fehlgeschlagen").
Kanonische Cancel-Werte definiert die Engine: `state-transitions.ts:12` `AbsageStatus = 'abgesagt' | 'storniert' | 'abgelehnt'`, Default `sageAb`= `'abgesagt'`. Der Reader `getAvailableKbSlots` (`kb-slots.ts:63-71`) belegt einen Slot nur bei `status IN ('bestaetigt','reserviert') AND cancelled_at IS NULL`; die Konflikt-/Duplikat-Prüfungen in `bookKbTermin` (`kb-booking.ts:65,78`) filtern identisch. Ein Kunde-Storno ist ein Kunde-`abgesagt` (semantisch = Kunde sagt ab, exakt wie `api/kunde/termin/absagen/route.ts:89`), **nicht** ein `storniert` (System/Admin-Void). → **`kunde_storniert` → `abgesagt`.** Der zusätzliche `cancelled_at`-Write bleibt (Reader gaten ohnehin auf `cancelled_at IS NULL`, doppelte Sicherheit — Termin wird sowohl statuslich als auch per Timestamp inaktiv).

### Phase 1 — READ-SIDE (Resolver), KEIN DDL (Entscheidung + Begründung)
Zwei abgeleitete Phasen-Engines lesen Termine **unterschiedlich**:

1. **Primäre Engine** `v_claim_phase` ⟷ `getClaimLifecycle` (Parity-Gate). Liest Termin-Fortschritt **ausschließlich** über den erstgutachten-`auftraege.status` (`v_claim_phase` LATERAL `eg`, migration `…083708:40-43,54-59`; TS `lifecycle.ts:233-245`). `auftraege.status` wird vom Trigger `tg_termin_sync_auftrag_status` **nur vorwärts** bewegt (termin→besichtigung→gutachten, baseline:3193-3208) und der Trigger feuert **nur** auf `sv_angekommen_am/durchgefuehrt_am/auftrag_id` (baseline:17757) — **nicht** auf `status`. Nach `abgesagt`/`abgelehnt` bleibt `auftraege.status='termin'` → die primäre Engine hält den Claim in `begutachtung`/`termin`.
   - **Bewertung: das ist KORREKT.** Wenn ein Termin platzt, braucht der Fall einen **neuen** Termin (sv-ablehnung `ablehnTermin` triggert Auto-Dispatch `sv-ablehnung.ts:120`; die Kunde-Absage `absagen/route.ts:115` erzeugt einen Dispatcher/KB-Task). Der erstgutachten-Auftrag existiert legitim weiter → „Begutachtung, wartet auf (neuen) Termin" ist die richtige Hauptphase. Ein Retract auf `erfassung` wäre falsch (die Erfassung ist längst durch). **→ Kein View-/Trigger-Change.**
2. **Fine-grained Engine** `resolveSubphase` (`subphase-resolver.ts`, 30+ Subphasen; Consumer u.a. `src/app/faelle/[id]/page.tsx`). Liest `gutachter_termine` **direkt**. `aktTermin` (`~:208-210`) filtert nur `['storniert','verlegt','verschoben']` heraus und wählt dann den „aktivsten" Termin per Sortier auf `durchgefuehrt_am/sv_angekommen_am/sv_unterwegs_seit`. **`abgesagt`/`abgelehnt` sind NICHT ausgeschlossen** → ein platzender Termin wird weiter als aktiver Termin gewählt und rendert eine Phantom-Subphase: mit `start_zeit` in <24h die 2.6 „Termin-Erinnerung", oder bei stale Tracking-TS die 3.1 „SV unterwegs" / 4.1 „Gutachten in Bearbeitung".
   - **Fix (read-side, spec-konform):** `abgesagt` und `abgelehnt` in den Ausschluss-Filter aufnehmen — exakt die Logik, die AAR-864 für `verlegt/verschoben/storniert` etablierte (Kommentar `:204-207`: „gehören NICHT in den aktiven Termin — sonst zeigt der Resolver ‚SV unterwegs' anhand alter Tracking-Felder obwohl der Termin nicht mehr stattfindet."). Danach fällt der Resolver bei fehlendem lebenden Termin sauber auf die nächst-niedrigere Signal-Phase zurück (Doku-Reminder / Vollmacht / Erfassung), während die **Hauptphase** über die primäre Engine korrekt `begutachtung` bleibt.

**Warum read-side und nicht DDL:** Der Spec (§Ziel-Muster K2, §Philosophie) bevorzugt derive-at-read; die primäre Engine ist bereits korrekt; ein Trigger/View-Change wäre riskant (Parity-Gate `v_claim_phase` ⟷ `getClaimLifecycle`, 76 Live-Claims Checksum) und würde ein an sich richtiges Verhalten „reparieren". Der einzige echte Read-Drift sitzt in `resolveSubphase`, und der ist rein code-seitig lösbar. Kein DDL.

---

## Tasks

### PHASE 0 — CHECK-invalid Silent-Fail-Bugs (ship first, tiny)

#### Task 0.1 — Bug A: `bestaetigeSlot` schreibt gültigen Status (`geplant` → `bestaetigt`)
**RE-VERIFY:** `src/lib/onboarding/slots.ts` — Zeile mit `.update({ status: 'geplant' })` in `bestaetigeSlot` (Stand `:190`).

- [ ] **Test schreiben (fail first).** Neue Datei `src/lib/onboarding/slots.test.ts`. `bestaetigeSlot` importieren. Supabase-Admin-Client mocken via `vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => stub }))` mit dem thenable-Recorder-Stub-Muster aus `src/lib/termine/engine/state-transitions.test.ts` (from/select/update/eq/single/then, capture der `update`-Payload). `next/cache` `revalidatePath` als no-op mocken (`vi.mock('next/cache', () => ({ revalidatePath: () => {} }))`).
  - Test 1: `bestaetigeSlot('gfa-1','t-1')` ruft `.update(...)` mit `status` **∈ gültigem CHECK-Set** (assert `updatePayload.status === 'bestaetigt'`, und explizit `expect(['reserviert','bestaetigt','abgelehnt','abgesagt','storniert','abgeschlossen','sv_gesucht','gegenvorschlag','verschoben','verlegt','verlegung_pending','dispatch_pending']).toContain(updatePayload.status)`).
  - Test 2 (Regressions-Guard, hält den Bug tot): `expect(updatePayload.status).not.toBe('geplant')`.
- [ ] `npm run test -- src/lib/onboarding/slots.test.ts` → **muss fehlschlagen** (aktuell `'geplant'`). Fehlschlag beobachten/notieren.
- [ ] **Minimale Impl.** In `slots.ts:bestaetigeSlot` `status: 'geplant'` → `status: 'bestaetigt'`. Comment ergänzen: `// CHECK-Fix (FG2): 'geplant' ist NICHT im gutachter_termine_status_check (Legacy-'termine'-Default) → UPDATE wurde still verworfen. Kanonischer Confirm-Status = 'bestaetigt' (engine/bestaetige.ts). NOTE: dieser Alt-Pfad setzt (anders als engine.bestaetige) weder final_verbindlich_ab noch legt er den erstgutachten-Auftrag an — Engine-Adoption = koordinierter Sweep (s. :154).`
- [ ] `npm run test -- src/lib/onboarding/slots.test.ts` → **grün**.
- [ ] `npx tsc --noEmit` grün.
- [ ] **Commit** `fix(FG2): bestaetigeSlot schreibt gueltigen gutachter_termine-Status (geplant->bestaetigt)` mit 7-Punkte-Audit-Block (UI: n/a kein UI-Change; Regression: einziger Reader mitarbeiter/performance liest bereits nur 'bestaetigt' → jetzt konsistent) + Co-Authored-By.

#### Task 0.2 — Bug B: `cancelKbTermin` schreibt gültigen Status (`kunde_storniert` → `abgesagt`)
**RE-VERIFY:** `src/lib/termine/kb-booking.ts` — Zeile `.update({ status: 'kunde_storniert', cancelled_at: now })` in `cancelKbTermin` (Stand `:268`).

- [ ] **Test schreiben (fail first).** Neue Datei `src/lib/termine/kb-booking.test.ts`. Nur `cancelKbTermin` testen. Mocken: `@/lib/supabase/server` (`createClient` → `{ auth: { getUser: async () => ({ data: { user: { id:'u1', email:'k@x.de' } } }) } }`), `@/lib/supabase/admin` (thenable-Recorder-Stub: lädt Termin `{ id:'t1', fall_id:'f1', start_zeit: <+2h ISO>, status:'bestaetigt', cancelled_at:null }`, dann `resolveClaimId`-Chain → `claim { geschaedigter_user_id:'u1' }`, dann capture des Status-Updates, dann timeline-insert no-op), `@/lib/claims/get-claim-for-role` (`resolveClaimId: async () => 'c1'`). `start_zeit` bewusst > 1h Zukunft, damit der Storno-Zeitfenster-Guard (`:260`) passiert.
  - Test 1: `cancelKbTermin('t1')` → `res.ok === true` **und** capturedUpdate.status **∈ CHECK-Set** (assert `=== 'abgesagt'`, plus `toContain`-Assertion gegen das 12er-Array wie Task 0.1).
  - Test 2 (Regressions-Guard): `expect(capturedUpdate.status).not.toBe('kunde_storniert')`.
  - Test 3: `capturedUpdate.cancelled_at` ist gesetzt (String) — Timestamp-Gate bleibt erhalten.
- [ ] `npm run test -- src/lib/termine/kb-booking.test.ts` → **muss fehlschlagen** (aktuell `'kunde_storniert'`). Beobachten.
- [ ] **Minimale Impl.** `status: 'kunde_storniert'` → `status: 'abgesagt'`. Comment: `// CHECK-Fix (FG2): 'kunde_storniert' ist NICHT im gutachter_termine_status_check → UPDATE reject → KB-Beratungstermin-Storno war komplett kaputt ("Stornierung fehlgeschlagen"). Kunde-Absage = 'abgesagt' (kanonisch, wie api/kunde/termin/absagen). cancelled_at bleibt (Reader gaten zusaetzlich auf cancelled_at IS NULL).`
- [ ] `npm run test -- src/lib/termine/kb-booking.test.ts` → **grün**.
- [ ] `npx tsc --noEmit` grün.
- [ ] **Commit** `fix(FG2): cancelKbTermin schreibt gueltigen Status (kunde_storniert->abgesagt) — KB-Storno repariert` mit Audit-Block (Spec: repariert kaputten Kunde-Pfad; Regression: kb-slots + bookKbTermin gaten auf status IN (bestaetigt,reserviert) + cancelled_at IS NULL → abgesagter Termin gibt Slot korrekt frei) + Co-Authored-By.

---

### PHASE 1 — Termin→Workstate: Resolver behandelt `abgesagt`/`abgelehnt` als „kein aktiver Termin"

#### Task 1.1 — `resolveSubphase` schließt `abgesagt`/`abgelehnt` aus dem aktiven Termin aus
**RE-VERIFY:** `src/lib/fall/subphase-resolver.ts` — der `aktTermin`-Filter `.filter((t) => !['storniert', 'verlegt', 'verschoben'].includes(t.status ?? ''))` (Stand `:208-210`). Außerdem den AAR-864-Kommentar `:204-207` mitlesen (dort wird die Filterliste begründet — erweitern).

- [ ] **Test schreiben (fail first).** In der **bestehenden** `src/lib/fall/subphase-resolver.test.ts` neuen `describe('resolveSubphase — FG2: abgesagte/abgelehnte Termine sind kein aktiver Termin')` ergänzen. Factories (`termin`, `claim`, `lead`) sind bereits im File.
  - Test A („SV unterwegs" darf NICHT auf einem abgesagten Termin erscheinen): Input `{ gutachter_termine: [ termin({ status:'abgesagt', sv_unterwegs_seit:'2026-04-19T09:00:00Z' }) ], claim: claim(), now: NOW }`. Assert `r.phase !== 3` (nicht „SV unterwegs"/„SV vor Ort") und `r.subphase !== '3.1'`. (Landet auf Fallback Phase 1 / niedrigeres Signal.)
  - Test B (analog für `abgelehnt`): `termin({ status:'abgelehnt', sv_angekommen_am:'2026-04-19T09:00:00Z' })` → `r.subphase !== '3.2'`.
  - Test C (Phantom-„Termin-Erinnerung" verschwindet): `termin({ status:'abgesagt', start_zeit: <NOW+3h ISO> })` → `r.subphase !== '2.6'`.
  - Test D (Guard gegen Overreach — lebende Termine bleiben aktiv): `termin({ status:'bestaetigt', sv_unterwegs_seit:'2026-04-19T09:00:00Z' })` → `r.subphase === '3.1'` (unverändertes Verhalten; darf durch den Fix nicht brechen).
  - Test E (mehrere Termine, nur der lebende zählt): `gutachter_termine: [ termin({ status:'abgesagt', durchgefuehrt_am:'2026-04-19T11:00:00Z' }), termin({ status:'bestaetigt', start_zeit:<NOW+3h ISO> }) ]` → der abgesagte (mit spätestem Tracking-TS) darf NICHT gewinnen; erwartet 2.6 „Termin-Erinnerung" vom lebenden Termin (assert `r.subphase === '2.6'`).
- [ ] `npm run test -- src/lib/fall/subphase-resolver.test.ts` → **Tests A/B/C/E müssen fehlschlagen** (aktuell wählt der Filter den toten Termin), **D grün** (Baseline). Beobachten.
- [ ] **Minimale Impl.** Filterliste erweitern: `!['storniert', 'verlegt', 'verschoben', 'abgesagt', 'abgelehnt'].includes(t.status ?? '')`. Kommentar `:204-207` erweitern: `// AAR-864 + FG2: 'storniert'/'verlegt'/'verschoben' PLUS 'abgesagt' (Kunde sagt ab, api/kunde/termin/absagen) und 'abgelehnt' (SV lehnt ab, sv-ablehnung) gehoeren NICHT in den aktiven Termin — sonst zeigt der Resolver eine Phantom-Subphase (SV unterwegs / Termin-Erinnerung) auf einem geplatzten Termin. Hauptphase bleibt korrekt begutachtung ueber v_claim_phase (auftraege.status), hier nur die Subphasen-Verfeinerung.`
- [ ] `npm run test -- src/lib/fall/subphase-resolver.test.ts` → **alle grün** (A–E).
- [ ] `npx tsc --noEmit` grün.
- [ ] **Commit** `fix(FG2): resolveSubphase schliesst abgesagte/abgelehnte Termine aus dem aktiven Termin aus` mit Audit-Block. **Im Body dokumentieren:** primäre Engine `v_claim_phase`/`getClaimLifecycle` bewusst NICHT geändert (liest via `auftraege.status`, Hauptphase `begutachtung` ist korrekt bis neuer Termin steht; Retract auf erfassung wäre falsch) → kein DDL. Co-Authored-By.

---

### PHASE 2 — Backstop gegen künftige CHECK-invalide Status-Literale

> Zwei komplementäre Guards: (2a) ein **statischer Ratchet** (fängt jedes rohe `.update({ status: '<nicht-im-CHECK>' })` auf `gutachter_termine` — genau die Klasse, die `geplant`/`kunde_storniert` produzierte; Vorbild = existierendes `check:termin-engine-contract`), und (2b) ein **typ-schmaler Wrapper** `updateGutachterTerminStatus`, der neuen Code zu compile-time-geprüften Status-Werten lenkt. Der Spec (§8.5) nennt genau diesen „Status-Literale nicht im CHECK"-Ratchet als höchsten Sofort-Wert. `check:flag-drift` (§8) existiert noch nicht — dieser Guard ist der erste, engst-gefasste Baustein davon.

#### Task 2.1 — Pure Scanner + vitest (TDD)
**RE-VERIFY:** `scripts/lib/termin-engine-contract-scan.mjs` (Signatur `scanContent(content) -> [{line,rule,hint}]`, `diffBaseline(current, baseline) -> {added,removed}`) als Vorbild.

- [ ] **Test schreiben (fail first).** `scripts/lib/gutachter-termine-status-scan.test.mjs`. Importiert `{ scanContent, diffBaseline, VALID_STATUSES }` aus `./gutachter-termine-status-scan.mjs`.
  - `VALID_STATUSES` enthält exakt die 12 CHECK-Werte.
  - `scanContent` findet einen Hit für `.update({ status: 'geplant' })` im Kontext eines `gutachter_termine`-Chains (String-Fixture mit `.from('gutachter_termine')` … `.update({ status: 'geplant' })`) und liefert `{line, rule:'invalid-status-literal', hint}`.
  - `scanContent` findet `kunde_storniert` analog.
  - `scanContent` liefert **keinen** Hit für gültige Literale (`.update({ status: 'bestaetigt' })`), für die **Legacy-`termine`-Tabelle** (`.from('termine')…status:'geplant'` → ignoriert, nur `gutachter_termine` scoped), und für dynamische Werte (`.update({ status })` ohne Literal).
  - `diffBaseline(['a.ts'], [])` → `{ added:['a.ts'], removed:[] }`.
- [ ] `npm run test -- scripts/lib/gutachter-termine-status-scan.test.mjs` → **fehlschlagen** (Modul fehlt). Beobachten.
- [ ] **Impl.** `scripts/lib/gutachter-termine-status-scan.mjs`: `VALID_STATUSES`-Array (12), `scanContent` — regex/Zeilen-Scan, der nur innerhalb eines `gutachter_termine`-Zusammenhangs (z.B. Datei enthält `gutachter_termine` UND die Update-Zeile matcht `\.update\(\s*\{[^}]*status:\s*['"]([a-z_]+)['"]`) ein String-Literal `status: '<x>'` prüft und flaggt, wenn `<x>` nicht in `VALID_STATUSES`. `.from('termine')`-only-Dateien nicht flaggen (Scope-Heuristik: Treffer nur zählen, wenn im selben File `gutachter_termine` vorkommt — pragmatisch, false-positive-arm; Doku im Header). `diffBaseline` 1:1 aus dem Vorbild übernehmen.
- [ ] `npm run test -- scripts/lib/gutachter-termine-status-scan.test.mjs` → **grün**.
- [ ] **Commit** `feat(FG2): scanner fuer CHECK-invalide gutachter_termine-Status-Literale` + Audit-Block + Co-Authored-By.

#### Task 2.2 — CLI-Wrapper + Baseline + package.json-Script
- [ ] **Impl** `scripts/check-gutachter-termine-status.mjs` — Kopie der Struktur von `scripts/check-termin-engine-contract.mjs` (modes `warn`/`--ratchet`/`--update-baseline`, `git ls-files "src/**/*.ts" "src/**/*.tsx"`, Excludes `.test.ts`/`__tests__`), aber gegen den neuen Scanner + `scripts/gutachter-termine-status-baseline.json`.
- [ ] **Baseline generieren:** `node scripts/check-gutachter-termine-status.mjs --update-baseline`. Erwartung nach Phase 0: **0 Verletzer** (beide Bugs sind gefixt) → Baseline `count:0`, `files:[]`. Falls >0: die Verletzer sind echte Restbugs — im Report benennen (nicht in die Baseline verstecken ohne Begründung).
- [ ] `package.json` `scripts` ergänzen: `"check:gutachter-termine-status": "node scripts/check-gutachter-termine-status.mjs"`.
- [ ] **Verify:** `node scripts/check-gutachter-termine-status.mjs --ratchet` → exit 0 (`OK — 0 bekannte Verletzer, 0 neue`). Gegenprobe: temporär in einer Scratch-Datei ein `.from('gutachter_termine')…update({ status:'quatsch' })` einfügen, `--ratchet` → exit 1, Datei wieder entfernen.
- [ ] **Commit** `feat(FG2): check:gutachter-termine-status Ratchet (Baseline 0, Boy-Scout)` + Audit-Block + Co-Authored-By.

#### Task 2.3 — Typ-schmaler Wrapper `updateGutachterTerminStatus` (compile-time-Guard, TDD)
> Kein Massen-Refactor aller Call-Sites (das ist der Engine-Adoption-Sweep, out of scope). Der Wrapper existiert als **kanonischer, typsicherer** Weg für neuen Code + als Referenz im Ratchet-Hint. Name bewusst `updateGutachterTerminStatus` — **nicht** `updateTerminStatus` (kollidiert mit dem bestehenden Legacy-`termine`-Updater in `src/app/faelle/[id]/_actions/termine.ts:247`).

- [ ] **Test (fail first).** `src/lib/termine/update-gutachter-termin-status.test.ts` (thenable-Recorder-Stub):
  - `updateGutachterTerminStatus(db, 't1', 'bestaetigt')` → `.from('gutachter_termine').update({ status:'bestaetigt' })`, Rückgabe `{ ok:true }`.
  - DB-Error → `{ ok:false, error }`.
  - (Typ-Test kann als `// @ts-expect-error` im Testfile stehen: `updateGutachterTerminStatus(db, 't1', 'geplant')` muss ein TS-Fehler sein.)
- [ ] `npm run test -- src/lib/termine/update-gutachter-termin-status.test.ts` → **fehlschlagen** (Modul fehlt).
- [ ] **Impl** `src/lib/termine/update-gutachter-termin-status.ts` (KEIN `'use server'` — reiner Helper, damit die Union exportierbar bleibt; AGENTS.md §use-server-Konstanten): `export type GutachterTerminStatus = 'reserviert'|'bestaetigt'|'abgelehnt'|'abgesagt'|'storniert'|'abgeschlossen'|'sv_gesucht'|'gegenvorschlag'|'verschoben'|'verlegt'|'verlegung_pending'|'dispatch_pending'` + `async function updateGutachterTerminStatus(db: SupabaseClient, id: string, status: GutachterTerminStatus, extra?: Record<string,unknown>): Promise<{ ok:boolean; error?:string }>`. JSDoc verweist auf den CHECK + `check:gutachter-termine-status`.
- [ ] `npm run test -- src/lib/termine/update-gutachter-termin-status.test.ts` → **grün**; `npx tsc --noEmit` grün.
- [ ] **Commit** `feat(FG2): updateGutachterTerminStatus (TS-narrowed) als kanonischer Status-Writer` + Audit-Block + Co-Authored-By.

---

## Final Verification (vor PR)
- [ ] `npm run test` (voll) grün.
- [ ] `npm run build` grün (Änderungen betreffen Server-Actions/Route → voller Build, nicht nur tsc).
- [ ] `npm run check:knip -- --ratchet`, `npm run check:server-actions`, `npm run check:token-audit` — 0 neue.
- [ ] `node scripts/check-gutachter-termine-status.mjs --ratchet` → exit 0.
- [ ] `git status` clean, `git stash list` leer, alle Commits gepusht (AGENTS.md Session-Checkliste). PR gegen `staging`.

## Self-Review

**Spec-Treue (§7 FG2):** Beide Silent-Fail-Bugs (§3.2) + Termin→Workstate-Gap (§5 Drift-Trap 2) + CHECK-Backstop (§8.5) adressiert. Kern-Files aus der FG2-Zeile getroffen (`slots.ts`, `kb-booking.ts`, `absagen`-Kontext, `subphase-resolver.ts`, Trigger analysiert).

**Bewusste Abweichungen (mit Begründung im jeweiligen Commit):**
- **Kein DDL.** Der Spec listet für FG2 „…+ Trigger" — die Analyse zeigt aber, dass die primäre Engine (`v_claim_phase`/`getClaimLifecycle`) den Claim nach einer Termin-Absage **korrekt** in `begutachtung` hält (auftrag wartet auf neuen Termin), und der einzige echte Read-Drift in `resolveSubphase` sitzt (rein code-seitig). Ein Trigger/View-Change würde ein richtiges Verhalten „reparieren" und das Parity-Gate riskieren. Read-side-Fix ist spec-philosophie-konform (derive-at-read).
- **`absagen/route.ts` NICHT geändert:** Es schreibt bereits den **gültigen** `abgesagt` (`:89`) — kein Bug dort. Es erscheint in der FG2-Zeile nur als Kontext/Beweis, dass `abgesagt` ein legitimer, aber vom Resolver ignorierter Status war. Der Fix dafür ist Task 1.1 (Resolver), nicht die Route.
- **Kein Call-Site-Massen-Refactor auf `updateGutachterTerminStatus`:** Das ist der separate Engine-Adoption-Sweep (Consumer-Kommentare `slots.ts:154`, `bestaetigung.ts`); hier nur der kanonische Writer + Ratchet als Drift-Bremse.

**Redundanz/Reuse:** Scanner + CLI spiegeln das etablierte `check:termin-engine-contract`-Muster (Baseline + Boy-Scout + warn/ratchet/update); Tests reusen den `makeDb`-thenable-Recorder-Stub aus `state-transitions.test.ts`; Phase-1-Test erweitert die bestehende `subphase-resolver.test.ts` statt neuer Datei.

**Regression:** Bug-A-Reader (`mitarbeiter/performance` gutachter_termine) liest ohnehin nur `bestaetigt` → wird durch den Fix erstmals korrekt versorgt. Bug-B-Reader (`kb-slots`, `bookKbTermin`-Konflikt/Duplikat) gaten auf `status IN (bestaetigt,reserviert) AND cancelled_at IS NULL` → `abgesagt`+`cancelled_at` gibt den Slot korrekt frei. Phase-1 Test D/E sichern, dass **lebende** Termine unverändert die aktive Subphase treiben (kein Overreach).

**Risiko/Offene Punkte:**
- `slots.ts:bestaetigeSlot` bleibt nach dem Fix funktional unvollständig ggü. `engine.bestaetige` (kein `final_verbindlich_ab`, keine Auftrag-Anlage → für GFA-Wizard-bestätigte Termine derivt `v_claim_phase` erst, wenn später ein Auftrag entsteht). Als Beobachtung im Commit-Body vermerkt; volle Engine-Adoption ist ein Folge-Ticket, kein FG2-Scope.
- Scanner-Scope-Heuristik (File enthält `gutachter_termine`) ist bewusst pragmatisch/false-positive-arm; ein File, das sowohl `termine` als auch `gutachter_termine` anfasst und einen legitimen Legacy-`termine`-`geplant`-Write hat, könnte theoretisch flaggen — dann Skip-Kommentar/Baseline mit Begründung (wie beim token-audit). Aktuell (Baseline 0) kein solcher Fall.

**Coordination:** Diese Änderungen fassen `slots.ts`/`kb-booking.ts`/`gutachter_termine` an — dieselbe Zone wie die offene melde-schaden Hard-Reservierungs-Debug-Session (`reserviert:false`). **Serialisieren:** entweder dieselbe Termine-Session ownt beide, oder FG2 startet erst nach deren Merge. `subphase-resolver.ts` ist Nachbar von Lane 6c630247 (Termin-Lifecycle) — Marker unter `…/memory/` setzen (additiver Read-Filter, keine Signaturänderung). Die primäre-Engine-Nichtberührung hält FG1 (claims-Writer, Lane 470d55c9) sauber getrennt.
