# Fundament C1a — Implementierungsplan (transitionClaim-Beweis-Tranche)

> Phase-C-Code-Plan nach FUNDAMENT §5 (`superpowers:writing-plans`). Setzt `c1-transition-claim-plan.md` (Ist-Erhebung)
> um. **Gating:** ausführbar, sobald **B2-Journey-Step grün** (J1-deep + J4). J1-deep ist bereits grün
> ([[coordination-b2-journey-step-diagnose-j4-reparatur-rot]]); es fehlt nur J4 (3cff8e12). Verifikation = CI
> (build/vitest/Ratchets + der post-merge J1-deep-Smoke) — **lokal nicht baubar (0 node_modules)**.

**Ziel:** Den transitionClaim-Single-Writer-Funnel beweisen: (1) den einzigen engine-funnel-fähigen WILD-Writer
`sv-zuweisung/route.ts:284` durch die Engine funneln, (2) das Event-Log (`phase_transitions`) claim-nativ machen,
(3) die Scanner-Blindstelle gegen Cast-Evasion schließen. Alles in **einem** PR (zusammenhängend, CI-grün).

## Verifizierter Ist (31.07., gegen origin/staging — de-riskt die 3 Blind-Punkte)

1. **Matrix erlaubt den Funnel** (`state-machine.ts:26`): `'ersterfassung': ['sv-gesucht','sv-zugewiesen',…]` — beide
   Ziele valide. Auch die Re-Assign-Pfade (`sv-gesucht→sv-zugewiesen` :33, `sv-zugewiesen→sv-gesucht` :37 bei Lead-Ablehnung).
2. **`claimId` ist in Engine-Scope** (`state-machine.ts:273` nutzt es für `claim_payments`) → `claim_id` im
   `phase_transitions`-Insert (`:324`) trivial ergänzbar.
3. **Scanner MISST die Cast-Form** (`operative-status-write-scan.mjs`): `claimsUpd` wird `:283` als
   `{ sv_zugewiesen_am }` definiert (kein `operative_status` → `traced-object` greift nicht), und `:284` setzt
   `(claimsUpd as Record<…>).operative_status = …` → die `traced-assign`-Regex `${ident}\.operative_status` (`:83`)
   matcht das `(claimsUpd as T).operative_status` **nicht** (das `as T)` steht dazwischen). = A2-#6, verifiziert unsichtbar.

## Task 1 — Event-Log claim-nativ (`phase_transitions.claim_id`)

**File:** `src/lib/faelle/state-machine.ts` (der `phase_transitions`-Insert, ~:324).
- `claim_id: claimId ?? null` in den Insert-Payload ergänzen (neben `fall_id: fallId`). Additiv, kein Behavior-Change.
- Zusätzlich (C1-Gap aus `c1-plan §2`): den fire-and-forget-Insert (`.then(...)` ohne `await`) auf `await` + non-fatal
  `try/catch` heben — Log-Verlust wird geloggt, bricht den Übergang aber **nicht** (`console.error`, kein throw).
**Verifikation:** build + vitest (`fall-status-claim-mapping.test.ts` + evtl. state-machine-Tests bleiben grün); nach
Merge SQL-Stichprobe: `SELECT count(*) FROM phase_transitions WHERE claim_id IS NOT NULL` steigt.
**Risiko:** minimal (additives Log-Feld). `claimId`-Scope verifiziert.

## Task 2 — WILD-Writer `sv-zuweisung` funneln (der Beweis)

**File:** `src/app/api/sv-zuweisung/route.ts` (~:280-287, der Cast-Direkt-Write).
- **Split:** `sv_zugewiesen_am` bleibt Direkt-`.update` (kein Status-Feld). Der `operative_status` wird durch
  `transitionFallStatus(fallId, orgPool ? 'sv-gesucht' : 'sv-zugewiesen', { user_id: <actor>, grund: 'sv_zuweisung' })`
  gesetzt → erbt Event (`fall.status_changed`) + Timeline + `phase_transitions` → **schließt A2-#6** (der leere
  Event-Fan-out an Makler/Flotte/Kanzlei bei SV-Findung wird live).
- **Matrix-Rejection-Edge (die eine Design-Frage):** `transitionFallStatus` **wirft** bei ungültigem Übergang
  (`:120`). Normalfall (Claim auf `ersterfassung`/`sv-gesucht`) ist immer valide. Läuft die Zuweisung (Edge) auf
  einem Claim jenseits davon (z.B. `sv-termin`), wäre der Übergang ungültig. **Entscheidung:** try/catch **non-fatal**
  — `sv_id` + `sv_zugewiesen_am` sind gesetzt (behavior-preserving), der Status bleibt auf seinem (bereits weiter
  fortgeschrittenen) Wert; die Rejection wird geloggt. Das ist strikt **besser** als der heutige Force-Write (der
  einen Claim auf `sv-termin` fälschlich auf `sv-zugewiesen` zurücksetzen könnte). → DECISIONS-Eintrag.
- **Actor:** den auth-User des Requests (bzw. `null` = System) an `transitionFallStatus` durchreichen — beim Bau die
  Request-Auth-Quelle der Route verifizieren (Dispatch-User vs Cron/System).
**Verifikation:** build + vitest; nach Merge der **J1-deep-Smoke** (SV-Zuweisungs-Schritt) + SQL: nach einer
Zuweisung existiert eine `phase_transitions`-Zeile + ein `fall.status_changed`-Event.
**Risiko:** mittel (API-Route + Behavior an der Edge). Durch die non-fatal-Rejection + Split abgesichert.

## Task 3 — Scanner gegen Cast-Evasion härten + Baseline

**File:** `scripts/lib/operative-status-write-scan.mjs` + `scripts/lib/operative-status-write-scan.test.*` + Baseline.
- Die `traced-assign`-Erkennung (`:82-86`) um die **Cast-Form** erweitern: `(IDENT as <T>).operative_status = …`.
  Regex-Skizze: `${ident}\\b(?:\\s+as\\s+[^)]+\\))?\\.operative_status\\s*=(?!=)` (die optionale `\\s+as\\s+…\\)`-Gruppe
  fängt den Cast; für den Plain-Fall unverändert). **FP-Sicherheit:** nur nach dem `.from('claims').update(IDENT)`-Anker
  (schon vorhanden) → Surface = Files, die BEIDES tun → sehr eng. **Unit-Test-Fall** für die Cast-Form ergänzen.
- **Reihenfolge:** Task 2 (Funnel) entfernt den `sv-zuweisung`-Cast-Write, **bevor** die Härtung greift → der gehärtete
  Scanner findet dort **nichts** (kein neuer Baseline-Eintrag nötig). **Danach** den gehärteten Scanner fleet-weit laufen
  (`git grep "as Record.*operative_status"` als Vor-Check) → falls **weitere** Cast-Writer existieren: funneln ODER
  begründet baselinen (nicht die Baseline blind aufblähen).
**Verifikation:** vitest (`operative-status-write-scan.test`) grün inkl. neuem Cast-Fall; `check:operative-status-writes
-- --ratchet` grün (0 neue Verletzer).
**Risiko:** mittel (fleet-weiter Ratchet — ein FP blockt alle PRs). Durch die enge Regex + den `.from('claims').update`-
Anker + den Unit-Test minimiert. **Nur CI-verifizierbar** → nach Merge den ersten Ratchet-Lauf beobachten.

## Sequenz + DoD

1. Task 1 (claim_id) → 2. Task 2 (Funnel) → 3. Task 3 (Scanner) — **ein PR**, damit der gehärtete Scanner den bereits
   gefunnelten sv-zuweisung sieht (CI grün in einem Zug).
2. **DoD (C1a):** Grep-Nachweis kein Cast-`operative_status`-Write mehr außerhalb der Engine; `phase_transitions.claim_id`
   wird geschrieben (SQL-Stichprobe); Scanner fängt die Cast-Form (Unit-Test); **J1-deep-Smoke grün** (nach Merge);
   build/vitest/alle Ratchets grün.
3. **DECISIONS-Eintrag:** die Matrix-Rejection-Edge-Entscheidung (non-fatal) protokollieren.

## Nicht-Ziele
Keine neuen Statuswerte; die 2 Terminal-Baseline-Writer (`kanzlei-wunsch`, `close-nur-gutachter`) bleiben (FG1-Domäne,
`c1-plan §4`); kein Abschluss-Pfad-Umbau (das ist C1c, Aaron-Entscheid B).
