# CMM-44 MP-5 — Rollen-Substate-Labels (DE-2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (fresh subagent per task + two-stage review) or `superpowers:executing-plans` to implement this task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** `buildClaimPhasePipeline` zeigt pro Rolle das richtige Substate-Label (kunde/makler kundenfreundlich, intern technisch); danach toten 52-Matrix-Code droppen.

**Architecture:** Reine Praesentations-Personalisierung auf dem bereits gebauten 4-Phasen-Lifecycle (CMM-44 MP-4b). Neuer `KUNDE_SUBSTATE_LABEL`-Map (13 `ClaimSubPhase` -> kunde-Label) + Helper, eingehaengt an der `void rolle`-Stelle. Sichtbarkeit bleibt rollenneutral (alle Rollen sehen dieselben 4 Hauptphasen / 13 Backbone-Substates). Kein Resolver-Change, keine DB, keine Migration.

**Tech Stack:** TypeScript, Next.js 15, Vitest. Branch off `origin/staging`.

---

## 0 · Status & Resume-Info (fuer eine andere Session)

- **Branch:** `kitta/cmm44-mp5-rollen-labels` (off `origin/staging` @ `122cb4d1`).
- **Worktree:** `.claude/worktrees/cmm44-mp5-rollen-labels`.
- **Unblocked:** MP-4a-e + Hydration-PRs sind auf `staging` gemergt; `buildClaimPhasePipeline` (mit `void rolle`) ist live.
- **Ausfuehrung:** subagent-driven (Aaron 2026-05-27), Modell **opus**.
- **Task 0 (Label-Map) ist von Aaron bestaetigt** (2026-05-27) — Werte unten sind gelockt.
- **Fortschritt:** _(diese Datei pro abgeschlossenem Task abhaken + pushen, damit eine andere Session nahtlos uebernehmen kann)_
  - [ ] Task 1 — Rollen-Labels (TDD: failing tests -> implement -> green)
  - [ ] Task 2 — toten 52-Matrix-Code droppen
  - [ ] Task 3 — Treffermengen-Doku + Smoke (Smoke erst nach staging-Deploy)
  - [ ] Task 4 — Rebase + PR `--base staging`

**Koordination:** `src/components/shared/fall-phases/*` + `src/lib/fall/subphase-visibility.ts` sind die File-Domaene der (idle) mp4b-Session (`kitta/cmm44-claim-phase-mp4b`, zuletzt aktiv 09:13). Vor `git push` jeweils `git fetch origin && git rebase origin/staging`. **Kein** Direct-Push auf `main`/`staging` — PR.

---

## Verifizierter Code-Stand (origin/staging, 27.05.)

`buildClaimPhasePipeline` @ `src/lib/fall/subphase-visibility.ts:694`:

```ts
export function buildClaimPhasePipeline(
  lifecycle: ClaimLifecycle,
  rolle: Rolle,
): PhaseStepData[] {
  void rolle // MP-5: Rollen-Feinsteuerung der Substates; 4 Hauptphasen sind rollenneutral.
  const aktuellIdx = getMainPhaseIndex(lifecycle.mainPhase) // 0..3
  const istTerminal = lifecycle.mainPhase === 'abschluss'

  return CLAIM_MAIN_PHASE_ORDER.map((mp, idx) => {
    let state: PhaseState
    if (idx < aktuellIdx) state = 'done'
    else if (idx === aktuellIdx) state = istTerminal ? 'done' : 'active'
    else state = 'upcoming'

    const subphases: SubphaseData[] | undefined =
      idx === aktuellIdx
        ? [
            {
              id: lifecycle.subPhase,
              label: SUBPHASE_LABEL[lifecycle.subPhase],
              state: istTerminal ? 'done' : 'active',
              visible: true,
            },
          ]
        : undefined

    return { phase: idx + 1, name: MAIN_PHASE_LABEL[mp], state, subphases }
  })
}
```

- **Call-Sites:** `FallPhasenPanel.tsx:88` (echte `rolle`, shared Panel alle Portale) · `FaelleKanban.tsx:172` (`'admin'`, Admin-Hover, korrekt rollenneutral).
- **13 `ClaimSubPhase`** (lifecycle.ts) + Default-Labels (`SUBPHASE_LABEL`): sa_offen, vollmacht_offen, onboarding_offen, termin, besichtigung, gutachten, kanzlei_uebergabe, versicherungskontakt, auszahlung, erfolgreich_reguliert, storniert, klage_rechtsstreit, verjaehrt.

---

## Task 0 — Label-Map (CONFIRMED Aaron 2026-05-27)

DE-2 = "1:1 erhalten, bewusste Korrektur nur falls beim Vergleich gefunden". 6 Substates haben keinen sauberen 1:1-Vorgaenger -> bestaetigte Werte:

| `ClaimSubPhase` | Default (admin/kb/sv) | kunde/makler | Quelle |
|---|---|---|---|
| `sa_offen` | SA-Unterschrift offen | **Schaden wird erfasst** | alt `fallakte_wird_angelegt` |
| `vollmacht_offen` | Vollmacht offen | **Unterlagen werden vorbereitet** | neu (bestaetigt) |
| `onboarding_offen` | Onboarding offen | **Letzte Angaben ausstehend** | neu (bestaetigt) |
| `termin` | Termin | **Termin wird vereinbart** | bestaetigt |
| `besichtigung` | Besichtigung | **Begutachtung laeuft** | alt `sv_vor_ort`/makler |
| `gutachten` | Gutachten | **Gutachten wird erstellt** | alt `gutachten_wird_erstellt` |
| `kanzlei_uebergabe` | Kanzlei-Uebergabe laeuft | **Akte geht an die Kanzlei** | alt `fallakte_wird_uebergeben` |
| `versicherungskontakt` | Versicherungskontakt | **Kanzlei klaert mit der Versicherung** | Bucket-4-8-Collapse (bestaetigt) |
| `auszahlung` | Auszahlung | **Auszahlung wird vorbereitet** | alt `zahlung_wird_verbucht` |
| `erfolgreich_reguliert` | Erfolgreich reguliert | **Erfolgreich abgeschlossen** | neu (bestaetigt) |
| `storniert` | Storniert | **Fall abgeschlossen** | alt `fall_akzeptiert_storniert` |
| `klage_rechtsstreit` | Klage / Rechtsstreit | **An die Klage uebergeben** | alt `klage_eingereicht` |
| `verjaehrt` | Verjaehrt | **Fall abgeschlossen** | neu (bestaetigt) |

**Sichtbarkeit:** alle Rollen sehen alle 13 Substates (`visible: true`). Die alte Rollen-Verbergung galt fein-granularen Ops-States (`technische_stellungnahme_*`, `vs_kontakt_laeuft`, `qc_nicht_bestanden`), die im 4-Phasen-Modell nicht mehr gerendert werden — sie kollabieren in sichtbare Milestones mit neutralem Label.

> **Hinweis zur Achtung beim UI-Text:** Umlaute in der Tabelle oben sind im Doc ASCII-ersetzt (interne Doku), im CODE muessen die Labels echte Umlaute tragen (`Kanzlei-Uebergabe` -> `Kanzlei-Übergabe`, `klaert` -> `klärt`, `laeuft` -> `läuft`, `uebergeben` -> `übergeben`, `verjaehrt`-Label -> default `Verjährt`). Frontend-Strings = echte UTF-8 Umlaute (AGENTS.md).

---

## File Structure

- **Modify** `src/lib/fall/subphase-visibility.ts` — `KUNDE_SUBSTATE_LABEL` + `substateLabelForRolle` ergaenzen, `void rolle` ersetzen; dann (Task 2) `buildPhasePipelineData`/`getSubphaseVisibilityForRolle`/`FallForPipeline` droppen.
- **Modify** `src/lib/fall/subphase-visibility.test.ts` — neue Rollen-Label-Tests; ein bestehender kunde-Test angepasst; (Task 2) 2 tote `describe`-Bloecke + Imports raus.
- **Modify** `src/app/gutachter/fall/[id]/FallDetailClient.tsx:235` — stalen `buildPhasePipelineData`-Kommentar umformulieren.
- **UNBERUEHRT** (Begruendung im Audit): `SUBPHASE_VISIBILITY`, `PHASE_META`, `SubphaseRuleSet`, `onlyInternal`, `kundeGetsCompact` -> noch von `ManualPhaseOverrideModal` (`FallActionBar.tsx:138`, reachable) + `manual-phase-override.constants` konsumiert. Drop erst **MP-7** (ManualPhaseOverride-Redesign).

---

## Task 1: Rollen-Labels (TDD)

**Files:** Modify `src/lib/fall/subphase-visibility.ts`, `src/lib/fall/subphase-visibility.test.ts`

### Step 1 — Failing tests zuerst

`subphase-visibility.test.ts`: Import um `mainPhaseOf` ergaenzen:

```ts
import { mainPhaseOf, type ClaimLifecycle, type ClaimMainPhase, type ClaimSubPhase } from '@/lib/claims/lifecycle'
```

Neuen `describe`-Block ans Dateiende:

```ts
describe('buildClaimPhasePipeline — Rollen-Labels (MP-5 DE-2)', () => {
  const ALLE: ClaimSubPhase[] = ['sa_offen','vollmacht_offen','onboarding_offen','termin','besichtigung','gutachten','kanzlei_uebergabe','versicherungskontakt','auszahlung','erfolgreich_reguliert','storniert','klage_rechtsstreit','verjaehrt']

  it('interne Rollen sehen das technische Default-Label', () => {
    for (const rolle of ['admin','kb','sv'] as Rolle[]) {
      const d = buildClaimPhasePipeline(lc('erfassung','sa_offen'), rolle)
      expect(d[0].subphases?.[0].label).toBe('SA-Unterschrift offen')
    }
  })

  it('kunde + makler sehen das kundenfreundliche Label', () => {
    for (const rolle of ['kunde','makler'] as Rolle[]) {
      const d = buildClaimPhasePipeline(lc('erfassung','sa_offen'), rolle)
      expect(d[0].subphases?.[0].label).toBe('Schaden wird erfasst')
    }
  })

  it('versicherungskontakt: kunde-Label verbirgt interne Ops-Details', () => {
    const d = buildClaimPhasePipeline(lc('regulierung','versicherungskontakt'), 'kunde')
    expect(d[2].subphases?.[0].label).toBe('Kanzlei klärt mit der Versicherung')
  })

  it('jede Rolle sieht den aktiven Substate (visible=true)', () => {
    for (const rolle of ['admin','kb','sv','kunde','makler'] as Rolle[]) {
      const d = buildClaimPhasePipeline(lc('begutachtung','gutachten'), rolle)
      expect(d[1].subphases?.[0].visible).toBe(true)
    }
  })

  it('jeder der 13 Substates liefert ein nicht-leeres kunde-Label (kein Map-Loch)', () => {
    for (const s of ALLE) {
      const d = buildClaimPhasePipeline(lc(mainPhaseOf(s), s), 'kunde')
      const active = d.find((p) => p.subphases && p.subphases.length)!
      expect(active.subphases![0].label.length).toBeGreaterThan(0)
    }
  })
})
```

Bestehenden kunde-Test `'Klage ist abschluss-Substate'` angleichen (kunde bekommt jetzt das freundliche Label):

```ts
// VORHER: expect(data[3].subphases?.[0].label).toBe('Klage / Rechtsstreit')
expect(data[3].subphases?.[0].label).toBe('An die Klage übergeben')
```

Run: `npx vitest run src/lib/fall/subphase-visibility.test.ts` -> **FAIL** (Labels noch rollenneutral).

### Step 2 — Implementieren

`subphase-visibility.ts`: `ClaimSubPhase` zum lifecycle-Import ergaenzen:

```ts
import { SUBPHASE_LABEL, MAIN_PHASE_LABEL, getMainPhaseIndex, type ClaimLifecycle, type ClaimSubPhase } from '@/lib/claims/lifecycle'
```

Map + Helper direkt VOR `buildClaimPhasePipeline` einfuegen (CODE: echte Umlaute!):

```ts
// MP-5 (DE-2): Rollen-spezifische Substate-Labels. Die 13 ClaimSubPhase-Backbone-
// Substates sind rollenneutral SICHTBAR (jede Rolle sieht denselben 4-Phasen-
// Fortschritt). Personalisiert wird nur das LABEL der externen Rollen
// (kunde/makler) — kundenfreundliche Sprache, 1:1 aus der alten kundeGetsCompact-
// Matrix abgeleitet. Intern (admin/kb/sv) = technisches Default (SUBPHASE_LABEL).
const KUNDE_SUBSTATE_LABEL: Partial<Record<ClaimSubPhase, string>> = {
  sa_offen: 'Schaden wird erfasst',
  vollmacht_offen: 'Unterlagen werden vorbereitet',
  onboarding_offen: 'Letzte Angaben ausstehend',
  termin: 'Termin wird vereinbart',
  besichtigung: 'Begutachtung läuft',
  gutachten: 'Gutachten wird erstellt',
  kanzlei_uebergabe: 'Akte geht an die Kanzlei',
  versicherungskontakt: 'Kanzlei klärt mit der Versicherung',
  auszahlung: 'Auszahlung wird vorbereitet',
  erfolgreich_reguliert: 'Erfolgreich abgeschlossen',
  storniert: 'Fall abgeschlossen',
  klage_rechtsstreit: 'An die Klage übergeben',
  verjaehrt: 'Fall abgeschlossen',
}

const EXTERN_ROLLEN: ReadonlySet<Rolle> = new Set<Rolle>(['kunde', 'makler'])

/** MP-5: Label des aktiven Substates je Rolle. Externe (kunde/makler) -> freundlich,
 *  intern (admin/kb/sv) -> technisches Default. */
function substateLabelForRolle(sub: ClaimSubPhase, rolle: Rolle): string {
  if (EXTERN_ROLLEN.has(rolle)) return KUNDE_SUBSTATE_LABEL[sub] ?? SUBPHASE_LABEL[sub]
  return SUBPHASE_LABEL[sub]
}
```

In `buildClaimPhasePipeline`: `void rolle`-Zeile loeschen; Label-Zeile aendern:

```ts
// VORHER: label: SUBPHASE_LABEL[lifecycle.subPhase],
label: substateLabelForRolle(lifecycle.subPhase, rolle),
```

Run: `npx vitest run src/lib/fall/subphase-visibility.test.ts` -> **PASS** (alle, inkl. bestehende 4-Phasen-Tests).

### Step 3 — Commit

```bash
git add src/lib/fall/subphase-visibility.ts src/lib/fall/subphase-visibility.test.ts
git commit -m "feat(CMM-44): MP-5 — rollen-spezifische Substate-Labels in buildClaimPhasePipeline (DE-2)"
```

---

## Task 2: Toten 52-Matrix-Code droppen

**Files:** Modify `subphase-visibility.ts`, `subphase-visibility.test.ts`, `FallDetailClient.tsx`

### Step 1 — 3 tote Symbole entfernen (`subphase-visibility.ts`)
- `getSubphaseVisibilityForRolle` (Funktion)
- `FallForPipeline` (interface)
- `buildPhasePipelineData` (Funktion)
- `SubphaseRolleRule`: `export` entfernen -> modul-intern (nur noch Feld-Typ in `SubphaseRuleSet.rollen`).
- **BEHALTEN:** `SUBPHASE_VISIBILITY`, `PHASE_META`, `SubphaseRuleSet`, `onlyInternal`, `kundeGetsCompact` (ManualPhaseOverride-Consumer -> MP-7).

### Step 2 — Tote Test-Bloecke + Imports raus (`subphase-visibility.test.ts`)
- Import `buildPhasePipelineData`, `getSubphaseVisibilityForRolle` entfernen.
- `describe('getSubphaseVisibilityForRolle', ...)` loeschen.
- `describe('buildPhasePipelineData', ...)` loeschen.
- **BEHALTEN:** `describe('SUBPHASE_VISIBILITY Konstante', ...)` (testet die bleibenden Konstanten — referenziert `SUBPHASE_VISIBILITY` + `PHASE_META`).

### Step 3 — Stalen Kommentar umformulieren (`FallDetailClient.tsx:235`)
```tsx
// AAR-727: Panel-Input — buildClaimPhasePipeline (4-Phasen-Lifecycle) läuft intern.
```

### Step 4 — Voller Build + Tests (Route/Server-Component betroffen)
Run: `npm run build` -> gruen. Run: `npx vitest run src/lib/fall/subphase-visibility.test.ts` -> gruen.

### Step 5 — Re-Grep gegen Leichen
Run: `git grep -n "buildPhasePipelineData\|getSubphaseVisibilityForRolle\|FallForPipeline" -- src/` -> **keine Treffer**.

### Step 6 — Commit
```bash
git commit -am "refactor(CMM-44): MP-5 — toten 52-Matrix-Code droppen (buildPhasePipelineData/getSubphaseVisibilityForRolle/FallForPipeline)"
```

---

## Task 3: Treffermengen-Doku + Smoke

- **Treffermengen-Doku:** Vorher/Nachher-Label pro Rolle (admin/kb/sv = Default, kunde/makler = Map) als 13-Zeilen-Tabelle in `docs/27.05.2026/cmm44-mp5-treffermengen.md`. DE-2-DoD.
- **Smoke (nach staging-Deploy):** `scripts/smoke-cmm44-mp4-staging.mjs` (deckt alle Rollen ab), Screenshot je Portal, im selben Turn auswerten.
- **Gebrandetes Kunde-Portal:** verifizierter SV mit `use_custom_branding` (`resolveKundenTheme`) — Substate-Label im Brand-Theme korrekt.

---

## Task 4: Rebase + PR

- `git fetch origin && git rebase origin/staging` (Koordination mp4b-Domaene).
- PR `--base staging`, 7-Punkte-Audit-Block im Body, **kein** Direct-Push.

---

## Self-Review (gegen Spec)

- **Spec-Coverage:** DE-2 Labels (Task 0/1), Treffermengen-Vergleich (Task 3), gebrandetes Kunde-Portal (Task 3), Dead-Code-Drop (Task 2). ✓
- **Placeholder-Scan:** alle Label-Werte konkret + von Aaron bestaetigt. ✓
- **Type-Konsistenz:** `substateLabelForRolle(sub: ClaimSubPhase, rolle: Rolle)`; `KUNDE_SUBSTATE_LABEL: Partial<Record<ClaimSubPhase,string>>` deckt alle 13 (Test erzwingt non-empty). ✓
- **Abweichungen vom Handoff (dokumentiert):** (1) `SUBPHASE_VISIBILITY`/`PHASE_META` NICHT gedroppt (ManualPhaseOverride-Consumer, grep-verifiziert -> MP-7). (2) Visibility ist no-op (rollenneutral) — die "52-Substate-Visibility" existiert im 4-Phasen-Modell nicht mehr; MP-5 ist Label-Personalisierung.
