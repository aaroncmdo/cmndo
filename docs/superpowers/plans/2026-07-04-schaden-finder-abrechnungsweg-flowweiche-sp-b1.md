# Werkstatt-Finder SP-B1 (Quali-Router) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline — Subagenten-Wochenlimit bis 07.07.). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Den bestehenden `/flow`-Quali-Gate zu einem 3-Wege-Abrechnungsweg-Router erweitern (haftpflicht/kasko/selbstzahler), inkl. Persistenz + Carry Lead→Claim. Kein Selbstzahler-Claim-Abschluss (= SP-B2).

**Architecture:** Reiner `qualiFlowOutcome`-Helfer (komponiert SP-A `resolveAbrechnungsweg` + bestehendes `bewerteSchuldfrage`) trifft die Entscheidung; die Server-Action `speichereQualiFlow` führt sie nur aus. `FlowQualiStep` bekommt eine Versicherungs-Folgefrage nach `eigenverantwortung` + eine Selbstzahler-Hinweis-Endansicht. `convert-lead-to-claim` trägt `abrechnungsweg` mit.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React (client wizard), vitest, Supabase (admin client).

## Global Constraints

- **Strikt additiv:** `QualiOptionen` (geteilt mit `/anfrage`) + `bewerteSchuldfrage` bleiben **unverändert**. `/anfrage` darf nicht brechen.
- **SP-A reuse:** `resolveAbrechnungsweg` aus `@/lib/werkstatt/abrechnungsweg` (Vokabular `'gegner'`/`'eigenverantwortung'` passt exakt zu `QUALI_VALUES`).
- **Umlaute Pflicht** in allen neuen nutzersichtbaren Strings (`ä/ö/ü/ß`), hardcoded-DE (i18n Follow-up).
- **Type-Lag:** `leads.abrechnungsweg` ist in den generierten Typen (noch) nicht vorhanden → Update-Payloads als `Record<string, unknown>` bauen (AGENTS.md §6).
- **Voller Build** (`npm run build`) Pflicht — Route-Komponenten + Server-Action berührt.
- **Kein** `reparatur_termine`-/RLS-Change. **Kein** Selbstzahler-Claim-Trigger (SP-B2).

## File Structure

- **Create** `src/lib/self-service/quali-flow-outcome.ts` — reine Router-Entscheidung.
- **Create** `src/lib/self-service/__tests__/quali-flow-outcome.test.ts` — Tests.
- **Modify** `src/app/flow/[token]/self-service-actions.ts` — `speichereQualiFlow` konsumiert den Helfer (+ optionaler Param).
- **Modify** `src/app/flow/[token]/FlowQualiStep.tsx` — Versicherungs-Folgefrage + Selbstzahler-Endansicht.
- **Modify** `src/lib/leads/convert-lead-to-claim.ts` — `abrechnungsweg`-Carry (1 Zeile).

---

### Task 1: Reiner `qualiFlowOutcome`-Helfer (TDD)

**Files:**
- Create: `src/lib/self-service/quali-flow-outcome.ts`
- Test: `src/lib/self-service/__tests__/quali-flow-outcome.test.ts`

**Interfaces:**
- Consumes: `resolveAbrechnungsweg` (SP-A), `bewerteSchuldfrage` + `QualiErgebnis` (quali-gate).
- Produces: `qualiFlowOutcome(schuldfrage: string | null, ueberEigeneVersicherung: boolean | null): QualiFlowOutcome` mit `QualiFlowOutcome = { abrechnungsweg: Abrechnungsweg | null; ergebnis: QualiErgebnis; disqualifizieren: boolean; reparaturwunsch: 'reparatur' | null }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { qualiFlowOutcome } from '../quali-flow-outcome'

describe('qualiFlowOutcome', () => {
  it('gegner -> haftpflicht, weiter, nicht disqualifiziert', () => {
    expect(qualiFlowOutcome('gegner', null)).toEqual({
      abrechnungsweg: 'haftpflicht', ergebnis: 'weiter', disqualifizieren: false, reparaturwunsch: null,
    })
  })
  it('eigenverantwortung + eigene Versicherung -> kasko, abbruch, disqualifiziert', () => {
    expect(qualiFlowOutcome('eigenverantwortung', true)).toEqual({
      abrechnungsweg: 'kasko', ergebnis: 'abbruch', disqualifizieren: true, reparaturwunsch: null,
    })
  })
  it('eigenverantwortung ohne Versicherung -> selbstzahler, weiter, reparaturwunsch armiert', () => {
    expect(qualiFlowOutcome('eigenverantwortung', false)).toEqual({
      abrechnungsweg: 'selbstzahler', ergebnis: 'weiter', disqualifizieren: false, reparaturwunsch: 'reparatur',
    })
  })
  it('eigenverantwortung ohne Versicherungsantwort (null) -> altes Abbruch-Verhalten', () => {
    const o = qualiFlowOutcome('eigenverantwortung', null)
    expect(o.abrechnungsweg).toBeNull()
    expect(o.ergebnis).toBe('abbruch')
    expect(o.disqualifizieren).toBe(true)
  })
  it('unklar -> kein Weg, weiter_mit_flag, nicht disqualifiziert', () => {
    expect(qualiFlowOutcome('unklar', null)).toEqual({
      abrechnungsweg: null, ergebnis: 'weiter_mit_flag', disqualifizieren: false, reparaturwunsch: null,
    })
  })
  it('null/leer schuldfrage -> weiter_mit_flag', () => {
    expect(qualiFlowOutcome(null, null).ergebnis).toBe('weiter_mit_flag')
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/self-service/__tests__/quali-flow-outcome.test.ts` → FAIL (`Cannot find module '../quali-flow-outcome'`).

- [ ] **Step 3: Write minimal implementation**

```ts
// SP-B1: Reine Routing-Entscheidung des Flow-Quali-Gates. Komponiert SP-A
// resolveAbrechnungsweg + das bestehende bewerteSchuldfrage zu EINEM Ergebnis,
// das die admin-client-basierte Server-Action speichereQualiFlow nur ausfuehrt.
// Client-safe, keine Server-Imports.
import { resolveAbrechnungsweg, type Abrechnungsweg } from '@/lib/werkstatt/abrechnungsweg'
import { bewerteSchuldfrage, type QualiErgebnis } from '@/lib/self-service/quali-gate'

export type QualiFlowOutcome = {
  abrechnungsweg: Abrechnungsweg | null
  ergebnis: QualiErgebnis
  disqualifizieren: boolean
  reparaturwunsch: 'reparatur' | null
}

export function qualiFlowOutcome(
  schuldfrage: string | null,
  ueberEigeneVersicherung: boolean | null,
): QualiFlowOutcome {
  const abrechnungsweg = resolveAbrechnungsweg({ schuldfrage, ueberEigeneVersicherung })
  if (abrechnungsweg === 'selbstzahler') {
    // NICHT disqualifizieren -> Werkstatt-Strecke; reparaturwunsch armiert das Gate.
    return { abrechnungsweg, ergebnis: 'weiter', disqualifizieren: false, reparaturwunsch: 'reparatur' }
  }
  if (abrechnungsweg === 'kasko') {
    // Heutiges Eigenverantwortung-Verhalten: Abbruch + KaskoEndansicht, Weg protokolliert.
    return { abrechnungsweg, ergebnis: 'abbruch', disqualifizieren: true, reparaturwunsch: null }
  }
  // haftpflicht (gegner) + null (unklar/leer/unbeantwortet): das bestehende Gate entscheidet.
  const ergebnis = bewerteSchuldfrage(schuldfrage)
  return { abrechnungsweg, ergebnis, disqualifizieren: ergebnis === 'abbruch', reparaturwunsch: null }
}
```

- [ ] **Step 4: Run test to verify it passes** — same command → PASS (6 tests).
- [ ] **Step 5: Commit** — `git add src/lib/self-service/quali-flow-outcome.ts src/lib/self-service/__tests__/quali-flow-outcome.test.ts && git commit` (audit-Block).

---

### Task 2: `speichereQualiFlow` konsumiert den Helfer

**Files:** Modify `src/app/flow/[token]/self-service-actions.ts` (die bestehende `speichereQualiFlow`, ~Z.57-93).

**Interfaces:**
- Consumes: `qualiFlowOutcome` (Task 1).
- Produces: `speichereQualiFlow(token, schuldfrage, ueberEigeneVersicherung?: boolean): Promise<{ ok; ergebnis?: 'weiter'|'abbruch'; abrechnungsweg?: string|null; error? }>` (Param additiv, Rückgabe um `abrechnungsweg` erweitert).

- [ ] **Step 1: Import ergänzen** — oben in der Datei: `import { qualiFlowOutcome } from '@/lib/self-service/quali-flow-outcome'`.

- [ ] **Step 2: Funktion ersetzen** (ganze `speichereQualiFlow`) durch:

```ts
export async function speichereQualiFlow(
  token: string,
  schuldfrage: string,
  ueberEigeneVersicherung?: boolean,
): Promise<{ ok: boolean; ergebnis?: 'weiter' | 'abbruch'; abrechnungsweg?: string | null; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const outcome = qualiFlowOutcome(schuldfrage, ueberEigeneVersicherung ?? null)
  const nowIso = new Date().toISOString()

  if (outcome.disqualifizieren) {
    // Kasko/Eigenverantwortung: heutiges Disqualifikations-Verhalten, plus abrechnungsweg-Record.
    // Record-Cast: leads.abrechnungsweg ist type-lagged (SP-A, Types nicht regen).
    const update: Record<string, unknown> = {
      schuldfrage,
      abrechnungsweg: outcome.abrechnungsweg,
      disqualifiziert: true,
      disqualifiziert_am: nowIso,
      disqualifiziert_grund_key: 'eigenverschulden',
      disqualifiziert_grund:
        'Eigenverschulden — Gutachterkosten nicht über die gegnerische Haftpflicht regulierbar (Self-Service-Quali)',
      status: 'disqualifiziert',
    }
    const { error: updErr } = await admin.from('leads').update(update as never).eq('id', leadId)
    if (updErr) return { ok: false, error: updErr.message }
    revalidatePath('/dispatch/leads')
    return { ok: true, ergebnis: 'abbruch', abrechnungsweg: outcome.abrechnungsweg }
  }

  const update: Record<string, unknown> = { schuldfrage }
  if (outcome.abrechnungsweg) update.abrechnungsweg = outcome.abrechnungsweg
  if (outcome.reparaturwunsch) update.reparaturwunsch = outcome.reparaturwunsch
  if (outcome.ergebnis === 'weiter_mit_flag') {
    update.notiz = `[Self-Service] Schuldfrage „${schuldfrage}" — Dispatcher-Review empfohlen.`
  }
  const { error: updErr } = await admin.from('leads').update(update as never).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true, ergebnis: 'weiter', abrechnungsweg: outcome.abrechnungsweg }
}
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 4: Commit** (audit-Block).

---

### Task 3: `FlowQualiStep` — Versicherungs-Folgefrage + Selbstzahler-Endansicht

**Files:** Modify `src/app/flow/[token]/FlowQualiStep.tsx`.

**Interfaces:**
- Consumes: `speichereQualiFlow(token, schuldfrage, ueberEigeneVersicherung?)` (Task 2).

Verhalten: Wahl `gegner`/`unklar` → wie bisher `speichereQualiFlow(token, value)`. Wahl `eigenverantwortung` → **nicht** sofort senden, sondern Versicherungs-Frage rendern (Ja/Nein). Ja → `speichereQualiFlow(token, 'eigenverantwortung', true)` → `abbruch` → `KaskoEndansicht`. Nein → `speichereQualiFlow(token, 'eigenverantwortung', false)` → `weiter` → neue **Selbstzahler-Endansicht** (Hinweis, kein Advance — Werkstatt-Strecke folgt in SP-B2).

- [ ] **Step 1: Komponente ersetzen** durch:

```tsx
'use client'

// AAR-956 §3a + SP-B1: Quali-Step im /flow. gegner/unklar wie bisher. eigenverantwortung
// oeffnet eine Versicherungs-Folgefrage -> kasko (KaskoEndansicht) oder selbstzahler
// (Hinweis; die Werkstatt-Strecke folgt in SP-B2). QualiOptionen bleibt unberuehrt.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { QualiOptionen } from '@/components/self-service/QualiOptionen'
import { KaskoEndansicht } from '@/components/self-service/KaskoEndansicht'
import { speichereQualiFlow } from './self-service-actions'

type Phase = 'frage' | 'versicherung' | 'sende' | 'abbruch' | 'selbstzahler' | 'fehler'

export function FlowQualiStep({
  token,
  vorname,
  onWeiter,
  onSchuldfrage,
}: {
  token: string
  vorname: string | null
  onWeiter: () => void
  onSchuldfrage?: (v: string) => void
}) {
  const t = useTranslations('selfService')
  const [phase, setPhase] = useState<Phase>('frage')
  const [fehler, setFehler] = useState<string | null>(null)

  async function sende(schuldfrage: string, ueberEigeneVersicherung?: boolean) {
    setPhase('sende')
    setFehler(null)
    try {
      const r = await speichereQualiFlow(token, schuldfrage, ueberEigeneVersicherung)
      if (!r.ok) {
        setPhase('fehler')
        setFehler(r.error ?? t('errors.allgemein'))
        return
      }
      if (r.abrechnungsweg === 'selbstzahler') {
        setPhase('selbstzahler')
        return
      }
      if (r.ergebnis === 'abbruch') {
        setPhase('abbruch')
        return
      }
      onSchuldfrage?.(schuldfrage)
      onWeiter()
    } catch {
      setPhase('fehler')
      setFehler(t('errors.unerwartet'))
    }
  }

  function waehle(value: string) {
    if (value === 'eigenverantwortung') {
      setPhase('versicherung')
      return
    }
    void sende(value)
  }

  if (phase === 'abbruch') return <KaskoEndansicht />
  if (phase === 'selbstzahler') {
    return (
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">Alles klar — wir helfen dir bei der Reparatur</h1>
        <p className="text-claimondo-navy/70">
          Du trägst den Schaden selbst. Im nächsten Schritt findest du eine passende Werkstatt in deiner Nähe und stimmst
          direkt einen Termin ab.
        </p>
      </div>
    )
  }
  if (phase === 'fehler') {
    return (
      <div className="max-w-md text-center">
        <p className="text-claimondo-navy/70">{fehler}</p>
      </div>
    )
  }
  if (phase === 'versicherung') {
    return (
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
          Kannst du den Schaden über eine eigene Kaskoversicherung regulieren?
        </h1>
        <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
          Voll- oder Teilkasko, über die du den Schaden abrechnen könntest.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="quali-versicherung-ja"
            onClick={() => void sende('eigenverantwortung', true)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Ja, ich habe eine Kaskoversicherung</span>
            <span className="block text-sm text-claimondo-navy/60">Wir zeigen dir, wie du dort meldest.</span>
          </button>
          <button
            type="button"
            data-testid="quali-versicherung-nein"
            onClick={() => void sende('eigenverantwortung', false)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo"
          >
            <span className="block font-semibold text-claimondo-navy">Nein, ich zahle die Reparatur selbst</span>
            <span className="block text-sm text-claimondo-navy/60">Wir finden dir eine passende Werkstatt.</span>
          </button>
        </div>
      </div>
    )
  }
  return <QualiOptionen vorname={vorname} disabled={phase === 'sende'} onWaehle={waehle} />
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 3: Commit** (audit-Block).

---

### Task 4: `convert-lead-to-claim` — `abrechnungsweg`-Carry

**Files:** Modify `src/lib/leads/convert-lead-to-claim.ts` (nach dem `reparaturwunsch`-Carry, ~Z.468).

- [ ] **Step 1: Zeile ergänzen** direkt nach dem `reparaturwunsch`-Record-Cast:

```ts
  // SP-B1: Abrechnungsweg (haftpflicht/kasko/selbstzahler) Lead -> Claim (SSoT). Record-Cast wg. Type-Lag.
  ;(claimsInsert as Record<string, unknown>).abrechnungsweg =
    (lead.abrechnungsweg as string | null) ?? null
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 3: Commit** (audit-Block).

---

### Task 5: Voller Audit + PR

- [ ] **Step 1: Voller Build** — `$env:NODE_OPTIONS='--max-old-space-size=8192'; npm run build` → grün.
- [ ] **Step 2: Ratchets + i18n** — `npm run check:token-audit`, `check:component-set`, `check:knip`, `check:i18n` → alle 0-neu / exit 0.
- [ ] **Step 3: Voller Vitest** (Regression) — `npx vitest run src/lib/self-service src/lib/werkstatt` → grün.
- [ ] **Step 4: 7-Punkt-Audit** dokumentieren (UI-Erreichbarkeit: neue Frage im bestehenden Quali-Step; Regression: gegner/kasko/unklar unverändert; Redundanz: Helfer statt inline).
- [ ] **Step 5: PR** gegen `staging` (stackt auf SP-A #3624 + SP-B-Spec). Body: Router-Mapping-Tabelle + Abgrenzung SP-B2 + Post-Deploy-Smoke.

## Self-Review

- **Spec coverage:** §3 SP-B1 (FlowQualiStep-Folgefrage, speichereQualiFlow abrechnungsweg/reparaturwunsch, convert-carry) → Tasks 3/2/4. §4 reiner Helfer → Task 1. §8 DoD → Task 5. ✓
- **Placeholder scan:** kein TBD/TODO; Code in jedem Code-Step vollständig. ✓
- **Type consistency:** `qualiFlowOutcome`-Signatur + `QualiFlowOutcome`-Felder in Task 1 == Konsum in Task 2. `speichereQualiFlow`-Rückgabe (`abrechnungsweg`) == Konsum in Task 3 (`r.abrechnungsweg`). ✓
- **Abweichung zur Spec:** Spec §3 sagte „Selbstzahler → Werkstatt-Step"; wegen `initialNeedsWerkstatt`-Mount-Cap liefert SP-B1 stattdessen die **Selbstzahler-Endansicht** (Hinweis); der echte Werkstatt-Step + Claim = SP-B2. Bewusst, nicht-brechend.
