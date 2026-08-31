# P2d-4: v2-Dispatcher-Sidebar + Vollständigkeit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den config-getriebenen v2-Dispatcher-Form (`?v2`) auf Feature-Vollständigkeit bringen — sticky 2-Spalten-Layout mit der de-phase-context-ten Call-Sidebar + 4 fehlende Funktionen (Personen-Editor, BKAT, ExitSkript-Fold, Cardentity) — damit der spätere P3b-Cutover keine Dispatcher-Funktion verliert.

**Architecture:** Additiv hinter `?v2`. Bestehende prop-basierte Komponenten (Phase1PersonenForm, BkatAnalysePanel, CardentityButton, GespraechsleitfadenTimer, KundenMatchCard, RueckrufTerminPanel, TerminListeClient) werden direkt wiederverwendet — sie nutzen den Phasen-Kontext NICHT. Neu: 2 de-phase-context-Komponenten (Gesprächshilfe/Einwände, zeigen alles statt `[currentPhase]`), 1 Sidebar-Composer, 1 Daten-Modul (`_lib/gespraech-content.ts`, Single-Source). Die `dispatch-section-panels`-Mechanik (Mechanismus B) wird um `schaden`/`fahrzeug` erweitert.

**Tech Stack:** Next.js (App Router, RSC + client components), React, TypeScript, Tailwind (Claimondo-Tokens), vitest. Worktree-Gates: `npx tsc --noEmit`, `npx vitest run`, `npm run check:token-audit`, `npm run check:component-set -- --ratchet`, `npm run check:knip -- --ratchet`. **Vor Gates `npm dedupe`** (false @types/react). **`package-lock.json` NICHT committen.** Branch `kitta/dispatch-config-unify-p2d4-sidebar` (Worktree `.claude/worktrees/dispatch-sa-banner`, off staging mit #2304).

---

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `src/app/dispatch/leads/[id]/_lib/gespraech-content.ts` | Single-Source der Call-Skripte: `GESPRAECHS_SEKTIONEN[]`, `EINWAENDE[]`, `DISQUALIFIKATIONS_HILFE` (phasen-frei, pure) | Create |
| `.../_lib/gespraech-content.test.ts` | Shape-/Vollständigkeits-Test | Create |
| `.../_v2/DispatchGespraechshilfe.tsx` | Zeigt ALLE Script-Sektionen (Akkordeon) + flag-getriebene Closing-Sätze + Disqualifikations-Sektion | Create |
| `.../_v2/DispatchEinwandKarten.tsx` | Zeigt ALLE Einwand-Karten (kein Phasen-Filter) | Create |
| `.../_v2/DispatchSidebar.tsx` | Komponiert die sticky Sidebar (Timer + Gesprächshilfe + Einwände + KundenMatch + Rückruf + Termine) | Create |
| `.../_v2/dispatch-section-panel-keys.ts` | `schaden` + `fahrzeug` als Panel-Sektionen ergänzen | Modify |
| `.../_v2/dispatch-section-panels.tsx` | Renderer: `schaden`→[Personen(cond) + BKAT], `fahrzeug`→[Cardentity] | Modify |
| `.../DispatchLeadForm.tsx` | 2-Spalten-Layout + Sidebar rendern (live `values` + `lead` durchreichen) | Modify |
| `.../_sidebar/SidebarStubs.tsx` | Legacy: Daten aus `_lib/gespraech-content.ts` konsumieren (Inline-Dup raus, Single-Source) | Modify |

Wiederverwendet ohne Änderung: `_phases/Phase1PersonenForm`, `_phases/BkatAnalysePanel`, `@/components/cardentity/CardentityButton`, `GespraechsleitfadenTimer`, `_sidebar/KundenMatchCard`, `RueckrufTerminPanel`, `@/components/termine/TerminListeClient`.

---

## Task 0: Reachability-Audit (Legacy → v2 Parity-Matrix)

**Files:** Create `docs/03.06.2026/p2d4-parity-matrix.md` (Doku, kein Code).

- [ ] **Step 1: Jede Legacy-Dispatcher-Funktion auflisten + v2-Heimat zuordnen.** Quellen lesen: `PhaseContent.tsx`, `_phases/Phase1Qualifizierung/Phase2TerminServiceTyp/Phase4Stammdaten/Phase5Zusammenfassung/Phase6StatusTracking`, `_sidebar/SidebarStubs.tsx`. Für JEDE interaktive Funktion eine Zeile: `Funktion | Legacy-Ort | v2-Heimat (Feld/Override/Section-Panel/Sidebar) | Status (✓ vorhanden / ➕ dieser Plan / bewusst weggelassen)`.

- [ ] **Step 2: Verifizieren dass die in diesem Plan gebauten Tasks ALLE „➕" abdecken.** Bekannte Einträge: Personen-Editor (Task 4), BKAT (Task 5), ExitSkript-Fold (Task 2), Cardentity (Task 6), Sidebar-Widgets (Task 7). Bekannte „bewusst weggelassen": Disqualifizieren-Modal (→ GatesPanel-Flag), Phasen-Stepper (→ flacher Form), initialPhase/ExitSkript-als-Overlay.

- [ ] **Step 3: Falls eine NEUE Lücke auftaucht** (keine v2-Heimat + nicht bewusst weggelassen) → STOPP, an Aaron melden bevor weitergebaut wird (Spec evtl. erweitern).

- [ ] **Step 4: Commit** `git add docs/03.06.2026/p2d4-parity-matrix.md && git commit -m "docs(p2d4): Legacy->v2 Reachability-Parity-Matrix"`

---

## Task 1: Shared Call-Content-Modul (`_lib/gespraech-content.ts`)

Extrahiert die Skript-/Einwand-Daten aus `SidebarStubs.tsx` in ein phasen-freies, pures Modul (Single-Source). Kein `'use server'` (exportierbar).

**Files:**
- Create: `src/app/dispatch/leads/[id]/_lib/gespraech-content.ts`
- Create: `src/app/dispatch/leads/[id]/_lib/gespraech-content.test.ts`
- Read (Quelle für verbatim-Move): `_sidebar/SidebarStubs.tsx:215-403`, `ExitSkript.tsx`

- [ ] **Step 1: Test schreiben** (`gespraech-content.test.ts`)

```typescript
import { describe, it, expect } from 'vitest'
import { GESPRAECHS_SEKTIONEN, EINWAENDE, DISQUALIFIKATIONS_HILFE } from './gespraech-content'

describe('gespraech-content', () => {
  it('hat alle 6 Gespraechs-Sektionen mit Opener + Folge-Punkten', () => {
    expect(GESPRAECHS_SEKTIONEN).toHaveLength(6)
    for (const s of GESPRAECHS_SEKTIONEN) {
      expect(s.titel.length).toBeGreaterThan(0)
      expect(s.opener.length).toBeGreaterThan(0)
      expect(s.folge.length).toBeGreaterThan(0)
    }
  })

  it('hat Einwand-Karten mit Einwand + Antwort', () => {
    expect(EINWAENDE.length).toBeGreaterThanOrEqual(7)
    for (const e of EINWAENDE) {
      expect(e.einwand.length).toBeGreaterThan(0)
      expect(e.antwort.length).toBeGreaterThan(0)
    }
  })

  it('hat eine Disqualifikations-Hilfe mit mind. einem Grund-Skript', () => {
    expect(DISQUALIFIKATIONS_HILFE.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run → FAIL** `cd <worktree> && npx vitest run gespraech-content` → erwartet FAIL (Modul fehlt).

- [ ] **Step 3: Modul schreiben.** Struktur unten; die deutschen Inhalte **1:1 aus den Quellen übernehmen**:
  - `GESPRAECHS_SEKTIONEN` = die 6 Werte aus `SidebarStubs.GESPRAECHSHILFEN` (Zeile 215-276), als **geordnetes Array** (Reihenfolge 1→6), Phase-Key entfällt.
  - `EINWAENDE` = `SidebarStubs.EINWAENDE` (Zeile 360-403) verbatim, **ohne** das `phasen`-Feld (oder behalten als optionales `tags`).
  - `DISQUALIFIKATIONS_HILFE` = die Disqualifikations-Gesprächspunkte aus `ExitSkript.tsx` (Inhalt dort lesen + als `{ grund, skript }[]` übernehmen; mind. eigenverantwortung/kein_schaden/kein_haftpflicht).

```typescript
// Single-Source der Dispatcher-Call-Skripte (phasen-frei). Konsumiert von der
// v2-Sidebar (DispatchGespraechshilfe / DispatchEinwandKarten, zeigen ALLES) und
// — bis zum P3b-Cutover — von der Legacy-SidebarStubs (indexiert nach Phase).
export type GespraechsSektion = { titel: string; opener: string; folge: string[] }
export type Einwand = { einwand: string; antwort: string }
export type DisqualifikationsHilfe = { grund: string; skript: string }

export const GESPRAECHS_SEKTIONEN: GespraechsSektion[] = [
  // [1..6] aus SidebarStubs.GESPRAECHSHILFEN verbatim — Reihenfolge Einstieg→Nachverfolgung
]
export const EINWAENDE: Einwand[] = [
  // aus SidebarStubs.EINWAENDE verbatim (phasen-Feld weglassen)
]
export const DISQUALIFIKATIONS_HILFE: DisqualifikationsHilfe[] = [
  // aus ExitSkript.tsx: pro Disqualifikations-Grund ein kurzes Abschluss-Skript
]
```

- [ ] **Step 4: Run → PASS** `npx vitest run gespraech-content` → PASS.

- [ ] **Step 5: Commit** `git add src/app/dispatch/leads/\[id\]/_lib/gespraech-content.ts src/app/dispatch/leads/\[id\]/_lib/gespraech-content.test.ts && git commit -m "feat(p2d4): shared call-content (gespraech-content, phasen-frei)"`

---

## Task 2: `DispatchGespraechshilfe` (de-phase-context)

Zeigt ALLE Sektionen als Akkordeon + die flag-getriebenen Closing-Sätze (aus live `values`) + die Disqualifikations-Sektion.

**Files:**
- Create: `src/app/dispatch/leads/[id]/_v2/DispatchGespraechshilfe.tsx`
- Read: `_sidebar/SidebarStubs.tsx:278-348` (GespraechshilfePanel — Render + closingSaetze-Logik verbatim übernehmen, nur `currentPhase`-Gate raus)

- [ ] **Step 1: Komponente schreiben.** Props `{ values: Record<string, unknown> }` (live Form-Werte für die flag-Closings). Render: `GESPRAECHS_SEKTIONEN.map(...)` als `<details>`-Akkordeon (erste offen). Closing-Sätze: die Logik aus `SidebarStubs:289-310` übernehmen, aber `currentPhase === 5`-Gate ENTFERNEN — Sätze werden immer ausgewertet, Flags aus `values` lesen (`values.schaden_sichtbar === 'true'`, `values.zeugen === 'true'`, etc. — segmented liegt als 'true'/'false'-String im v2-`values`). Disqualifikations-Sektion: `DISQUALIFIKATIONS_HILFE.map(...)` als eigener collapsed `<details>`. Tokens: `bg-white`/`border-claimondo-border`/`text-claimondo-*` wie das Original (kein neuer Card-Verstoß; es ist ein `<details>`-Panel, kein handrolled Card).

```typescript
'use client'
import { BookOpenIcon, ChevronDownIcon } from 'lucide-react'
import { GESPRAECHS_SEKTIONEN, DISQUALIFIKATIONS_HILFE } from '../_lib/gespraech-content'

const isTrue = (v: unknown) => v === 'true' || v === true

export function DispatchGespraechshilfe({ values }: { values: Record<string, unknown> }) {
  const closing: string[] = []
  // Logik aus SidebarStubs:289-310 verbatim, ohne currentPhase-Gate, Flags aus values:
  closing.push('„Ich schicke Ihnen jetzt den Link — SA unterschreiben dauert 3 Minuten, dann sind Sie startklar."')
  closing.push('„Außerdem schicke ich Ihnen einen zweiten Link für Ihren Fahrzeugschein — einfach abfotografieren und absenden."')
  if (isTrue(values.schaden_sichtbar)) closing.push('„Bitte fotografieren Sie noch heute Ihr Auto von allen Seiten …"')
  if (isTrue(values.zeugen)) closing.push('„Können Sie mir kurz Name und Telefonnummer des Zeugen geben? …"')
  if (isTrue(values.mietwagen_flag)) closing.push('„Die Mietwagenrechnung schicken Sie uns bitte sobald …"')
  if (isTrue(values.personenschaden_flag)) closing.push('„Lassen Sie sich bitte von einem Arzt untersuchen …"')
  if (isTrue(values.polizei_vor_ort)) closing.push('„Sie können den Polizeibericht später nachreichen …"')
  closing.push('„Bei Fragen erreichen Sie uns jederzeit per WhatsApp …"')
  // (vollständige Satz-Texte verbatim aus SidebarStubs:292-309 übernehmen)

  return (
    <div className="space-y-2">
      {GESPRAECHS_SEKTIONEN.map((s, i) => (
        <details key={i} className="bg-white rounded-ios-xl border border-claimondo-border p-3 group" open={i === 0}>
          <summary className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 cursor-pointer list-none">
            <BookOpenIcon className="w-4 h-4 text-claimondo-ondo" />
            <span>{s.titel}</span>
            <ChevronDownIcon className="w-3.5 h-3.5 ml-auto text-claimondo-ondo/70 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-claimondo-navy italic leading-relaxed">{s.opener}</p>
            <ul className="space-y-1 pt-1 border-t border-claimondo-border">
              {s.folge.map((f, j) => (
                <li key={j} className="text-[10px] text-claimondo-ondo flex gap-1.5"><span className="text-claimondo-ondo/70 shrink-0">•</span><span>{f}</span></li>
              ))}
            </ul>
          </div>
        </details>
      ))}
      {/* Closing-Sätze (flag-getrieben) */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3">
        <summary className="text-xs font-semibold text-claimondo-navy cursor-pointer list-none">Closing — am Gesprächsende</summary>
        <ul className="mt-2 space-y-1.5">
          {closing.map((s, i) => (<li key={i} className="text-[11px] text-claimondo-navy italic flex gap-1.5"><span className="text-claimondo-ondo shrink-0">→</span><span>{s}</span></li>))}
        </ul>
      </details>
      {/* Disqualifikations-Skripte (ExitSkript-Fold ★3) */}
      <details className="bg-white rounded-ios-xl border border-claimondo-border p-3">
        <summary className="text-xs font-semibold text-claimondo-navy cursor-pointer list-none">Disqualifikation — Gesprächsabschluss</summary>
        <ul className="mt-2 space-y-1.5">
          {DISQUALIFIKATIONS_HILFE.map((d, i) => (<li key={i} className="text-[11px]"><span className="font-medium text-claimondo-navy">{d.grund}: </span><span className="text-claimondo-ondo italic">{d.skript}</span></li>))}
        </ul>
      </details>
    </div>
  )
}
```

- [ ] **Step 2: tsc** `npx tsc --noEmit` → 0 Fehler.
- [ ] **Step 3: Commit** `git commit -am "feat(p2d4): DispatchGespraechshilfe (de-phase-context + Disq-Fold)"`

---

## Task 3: `DispatchEinwandKarten` (de-phase-context)

**Files:** Create `src/app/dispatch/leads/[id]/_v2/DispatchEinwandKarten.tsx`

- [ ] **Step 1: Komponente schreiben.** Zeigt `EINWAENDE` (alle) als `<details>`-Akkordeon. Kein Phasen-Filter, kein `currentPhase`. Markup analog `SidebarStubs.EinwandKarten:413-439` (ohne den Phasen-Badge + Phasen-Filter).

```typescript
'use client'
import { MessageSquareWarningIcon, ChevronDownIcon } from 'lucide-react'
import { EINWAENDE } from '../_lib/gespraech-content'

export function DispatchEinwandKarten() {
  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold text-claimondo-navy mb-1">
        <MessageSquareWarningIcon className="w-4 h-4 text-amber-500" />
        <span>Einwand-Karten</span>
      </div>
      <div className="space-y-1">
        {EINWAENDE.map((e, i) => (
          <details key={i} className="group rounded-ios-lg border border-claimondo-border p-2 hover:border-amber-200">
            <summary className="text-[11px] font-medium text-claimondo-navy cursor-pointer list-none flex items-start gap-1">
              <ChevronDownIcon className="w-3 h-3 mt-0.5 text-claimondo-ondo/70 group-open:rotate-180 transition-transform shrink-0" />
              <span className="flex-1">{e.einwand}</span>
            </summary>
            <p className="text-[10px] text-claimondo-ondo mt-1.5 pl-4 italic leading-relaxed">{e.antwort}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: tsc** → 0. **Step 3: Commit** `git commit -am "feat(p2d4): DispatchEinwandKarten (de-phase-context)"`

---

## Task 4: Personen-Editor als Schaden-Section-Panel (★1)

Reuse `Phase1PersonenForm` (schon prop-basiert: `{ leadId }`, nutzt KEINEN Phasen-Kontext) — gerendert wenn `values.personenschaden_flag === 'true'`. Verdrahtung über die Section-Panel-Mechanik (Task baut auf `dispatch-section-panels`).

**Files:**
- Modify: `_v2/dispatch-section-panel-keys.ts`
- Modify: `_v2/dispatch-section-panels.tsx`
- Test: `_v2/dispatch-section-panels.test.ts`

- [ ] **Step 1: Test erweitern** (`dispatch-section-panels.test.ts`)

```typescript
it('hat Panels fuer die schaden-Sektion', () => {
  expect(hasDispatchSectionPanels('schaden')).toBe(true)
})
```

- [ ] **Step 2: Run → FAIL** `npx vitest run dispatch-section-panels` → FAIL (schaden noch nicht registriert).

- [ ] **Step 3: `schaden` in `dispatch-section-panel-keys.ts` ergänzen.** Das Set/die Liste der Panel-Sektionen um `'schaden'` erweitern (Muster wie `'unfall'`/`'termin_sv'`).

- [ ] **Step 4: Renderer in `dispatch-section-panels.tsx`.** Für `schaden`: wenn `values.personenschaden_flag === 'true'` → `<Phase1PersonenForm leadId={ctx.leadId} />` (Import `from '../_phases/Phase1PersonenForm'`). (BKAT kommt in Task 5 in denselben schaden-Block.)

```tsx
import Phase1PersonenForm from '../_phases/Phase1PersonenForm'
// in der SEKTION_PANELS-Map:
schaden: (ctx) => {
  const nodes: ReactNode[] = []
  if (ctx.values.personenschaden_flag === 'true') {
    nodes.push(<Phase1PersonenForm key="personen" leadId={ctx.leadId} />)
  }
  return nodes
},
```

- [ ] **Step 5: Run → PASS** `npx vitest run dispatch-section-panels` → PASS. **tsc** → 0.
- [ ] **Step 6: Commit** `git commit -am "feat(p2d4): Personenschaden-Editor als schaden-Section-Panel (reuse Phase1PersonenForm)"`

---

## Task 5: BKAT-Analyse als Schaden-Section-Panel (★2)

Reuse `BkatAnalysePanel` (prop-basiert: `{ leadId, polizeiVorOrt, initialUnfallart?, onSchadentypGesetzt? }`, kein Phasen-Kontext).

**Files:** Modify `_v2/dispatch-section-panels.tsx`

- [ ] **Step 1: BKAT in den `schaden`-Renderer aufnehmen** (nach dem Personen-Panel):

```tsx
import BkatAnalysePanel from '../_phases/BkatAnalysePanel'
// im schaden-Renderer, ans nodes-Array anhaengen:
nodes.push(
  <BkatAnalysePanel
    key="bkat"
    leadId={ctx.leadId}
    polizeiVorOrt={ctx.values.polizei_vor_ort === 'true' ? true : ctx.values.polizei_vor_ort === 'false' ? false : null}
    initialUnfallart={(ctx.lead.bkat_unfallart as string | null) ?? null}
  />,
)
```

- [ ] **Step 2: tsc** → 0. (Falls `analyzeBkatForLead` einen LLM/OCR-Call macht: nur per Button getriggert — keine Auto-Fire, Komponente macht das bereits.)
- [ ] **Step 3: Commit** `git commit -am "feat(p2d4): BKAT-Analyse als schaden-Section-Panel (reuse BkatAnalysePanel)"`

---

## Task 6: Cardentity als Fahrzeug-Section-Panel (★4)

Reuse `CardentityButton` (`@/components/cardentity/CardentityButton`) + `requestCardentityTypBForLead`.

**Files:**
- Modify: `_v2/dispatch-section-panel-keys.ts` (`'fahrzeug'` ergänzen)
- Modify: `_v2/dispatch-section-panels.tsx`
- Test: `_v2/dispatch-section-panels.test.ts`

- [ ] **Step 1: Test** `expect(hasDispatchSectionPanels('fahrzeug')).toBe(true)` → Run → FAIL.
- [ ] **Step 2: `'fahrzeug'` in `dispatch-section-panel-keys.ts` ergänzen.**
- [ ] **Step 3: Renderer für `fahrzeug`** (Muster aus `Phase4Stammdaten.tsx:1003-1013` übernehmen):

```tsx
import { CardentityButton } from '@/components/cardentity/CardentityButton'
import { requestCardentityTypBForLead } from '../_actions/cardentity'
// SEKTION_PANELS:
fahrzeug: (ctx) => [
  <div key="cardentity" className="bg-white rounded-ios-xl border border-claimondo-border p-3">
    <p className="text-xs font-semibold text-claimondo-navy mb-2">Fahrzeugdaten &amp; Vorschäden (Cardentity)</p>
    <CardentityButton
      action={() => requestCardentityTypBForLead(ctx.leadId)}
      status={{ fetchedAt: (ctx.lead.cardentity_enriched_at as string | null) ?? null }}
    />
  </div>,
],
```
(Exakte `CardentityButton`-Props-Signatur aus `Phase4Stammdaten.tsx:1009-1014` + der Komponente verifizieren und 1:1 übernehmen.)

- [ ] **Step 4: Run → PASS, tsc → 0.** **Step 5: Commit** `git commit -am "feat(p2d4): Cardentity-Abruf als fahrzeug-Section-Panel (reuse CardentityButton)"`

---

## Task 7: `DispatchSidebar` (Composer)

**Files:** Create `src/app/dispatch/leads/[id]/_v2/DispatchSidebar.tsx`

- [ ] **Step 1: Komponente schreiben.** Props `{ lead, leadId, values }`. Rendert (in Reihenfolge): Timer (kompakt), `DispatchGespraechshilfe`, collapsed `<details>` für Einwände/KundenMatch/Rückruf/Termine. Reuse der prop-basierten Komponenten mit den Prop-Mappings aus `SidebarStubs` (Timer: `gespraech_*`-Felder aus lead; Rückruf: `anruf_versuche/letzter_anruf_*`; KundenMatch: `kunde_id`).

```tsx
'use client'
import GespraechsleitfadenTimer from '../GespraechsleitfadenTimer'
import KundenMatchCard from '../_sidebar/KundenMatchCard'
import RueckrufTerminPanel from '../RueckrufTerminPanel'
import TerminListeClient from '@/components/termine/TerminListeClient'
import { DispatchGespraechshilfe } from './DispatchGespraechshilfe'
import { DispatchEinwandKarten } from './DispatchEinwandKarten'

type LeadRow = Record<string, unknown> & { id: string }

export function DispatchSidebar({ lead, leadId, values }: { lead: LeadRow; leadId: string; values: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <GespraechsleitfadenTimer
        leadId={leadId}
        gestartetAm={(lead.gespraech_gestartet_am as string | null) ?? null}
        beendetAm={(lead.gespraech_beendet_am as string | null) ?? null}
        dauerSekunden={(lead.gespraech_dauer_sekunden as number | null) ?? null}
      />
      <DispatchGespraechshilfe values={values} />
      <DispatchEinwandKarten />
      <KundenMatchCard leadId={leadId} initialMatchedKundeId={(lead.kunde_id as string | null) ?? null} />
      <div className="bg-white rounded-2xl border border-claimondo-border p-4">
        <RueckrufTerminPanel
          leadId={leadId}
          initial={{
            anrufVersuche: (lead.anruf_versuche as number | null) ?? 0,
            letzterAnrufAm: (lead.letzter_anruf_am as string | null) ?? null,
            letzterAnrufStatus: (lead.letzter_anruf_status as string | null) ?? null,
          }}
        />
      </div>
      <TerminListeClient leadId={leadId} variant="compact" title="Termine zum Lead" dispatchLinks limit={8} />
    </div>
  )
}
```
(Timer-Hinweistext „Phase 5 öffnen" in `GespraechsleitfadenTimer.tsx:128` auf phasen-freie Formulierung anpassen — z.B. „Nächster Schritt: Zusammenfassung prüfen → FlowLink senden". Kleiner Boy-Scout-Edit, kein Phasen-Begriff mehr.)

- [ ] **Step 2: tsc → 0.** **Step 3: Commit** `git commit -am "feat(p2d4): DispatchSidebar composer (Timer/Hilfe/Einwaende/KundenMatch/Rueckruf/Termine)"`

---

## Task 8: 2-Spalten-Layout in `DispatchLeadForm`

**Files:** Modify `src/app/dispatch/leads/[id]/DispatchLeadForm.tsx`

- [ ] **Step 1: Import + Render.** `import { DispatchSidebar } from './_v2/DispatchSidebar'`. Den `<main>`-Inhalt in einen 2-Spalten-Wrapper packen: Form-Content bleibt in `<main className="flex-1 max-w-3xl …">`, daneben `<aside className="w-full lg:w-[340px] shrink-0 bg-claimondo-bg border-t lg:border-t-0 lg:border-l border-claimondo-border lg:sticky lg:top-0 lg:h-[calc(100vh-…)] overflow-y-auto p-4">`. Auf `<lg` einspaltig: die Sidebar als collapsed `<details>` ganz oben (Wrapper-Variante) ODER per Order. Konkret:

```tsx
return (
  <div className="flex flex-col lg:flex-row lg:items-start gap-0 lg:gap-4">
    <main className="flex-1 min-w-0 max-w-3xl overflow-y-auto px-4 sm:px-6 py-6">
      {/* bestehender Inhalt: Titel, SA-Banner, GatesPanel, Sektionen, Checkliste, DokAnfordern, Flowlink, Status */}
    </main>
    <aside className="w-full lg:w-[340px] shrink-0 bg-claimondo-bg lg:border-l border-claimondo-border lg:sticky lg:top-0 lg:max-h-screen overflow-y-auto p-4">
      <DispatchSidebar lead={lead} leadId={leadId} values={values} />
    </aside>
  </div>
)
```
(Den exakten sticky-`top`/`max-h`-Wert an die Dispatch-Layout-Headerhöhe anpassen — im Smoke verifizieren; Legacy nutzte `h-[calc(100vh-64px)]`.)

- [ ] **Step 2: Mobile-Reihenfolge (Entscheidung, leicht abweichend vom Spec-„oben"):** DOM-Reihenfolge `main` zuerst, `aside` danach → auf Mobile stapelt die Sidebar **unter** dem Form, auf Desktop steht sie via `lg:flex-row` rechts (kein `order`-Hack nötig). Begründung: robust + Form bleibt mobil primär. Der Spec-Wunsch „collapsed Block oben" (Script ohne Scrollen erreichbar) ist ein **optionales Polish** — falls nach dem Smoke gewünscht: `aside order-first lg:order-2` + `main order-2 lg:order-1` und Sidebar-Inhalt mobil in einem collapsed `<details>`. Im Smoke (Task 11) mit Aaron entscheiden.

- [ ] **Step 3: tsc → 0.** **Step 4: Commit** `git commit -am "feat(p2d4): 2-Spalten-Layout + sticky Sidebar im v2-Form"`

---

## Task 9: Legacy-SidebarStubs auf Single-Source umbiegen

**Files:** Modify `_sidebar/SidebarStubs.tsx`

- [ ] **Step 1:** Inline-`GESPRAECHSHILFEN` (215-276) + `EINWAENDE` (360-403) löschen; stattdessen aus `_lib/gespraech-content.ts` importieren. `GespraechshilfePanel` indexiert `GESPRAECHS_SEKTIONEN[currentPhase - 1]` (Array statt Phase-Record); `EinwandKarten` filtert weiterhin nach Phase über ein lokales Phase-Mapping ODER zeigt alle (Legacy darf hier vereinfachen — es wird eh gecutovert). Minimal: Array-Index + alle Einwände zeigen.
- [ ] **Step 2: tsc → 0** (Legacy rendert weiter korrekt). **vitest** (falls Sidebar-Tests). **Step 3: Commit** `git commit -am "refactor(p2d4): SidebarStubs konsumiert gespraech-content (Single-Source, kein Inline-Dup)"`

---

## Task 10: Integration verifizieren — Termin (aktuelle Engine) + Flowlink

**Files:** keine Code-Änderung erwartet (Verify). Falls Drift → Fix + Commit.

- [ ] **Step 1: Termin.** `grep -rn "reserveSvTerminForLead\|cancelSvTerminForLead\|acceptGegenvorschlag" src/app/dispatch/leads/\[id\]/_actions/sv-termin.ts` + prüfen ob diese Actions die **aktuelle** Termin-Engine nutzen (Sessions `kitta/termin-engine-p2-3c`/`p3b-bestaetige`). Mit jenen Sessions koordinieren (Memory-Marker prüfen). Erwartung: v2-`SvDispatchPanel` nutzt dieselben shared Actions → erbt die Engine. Falls die Engine die Action-Signaturen geändert hat → `SvDispatchPanel` anpassen.
- [ ] **Step 2: Flowlink.** `DispatchFlowlinkPanel` + `page.tsx`-flowLinks-Load lesen: lädt jüngste `flow_links` (DB), sendet via `sendFlowLinkMultiChannel`, zeigt Status. Clean-Check: kein toter Pfad, Status korrekt. Erwartung: ✓ (P2g).
- [ ] **Step 3:** Befund in `docs/03.06.2026/p2d4-parity-matrix.md` dokumentieren. Falls Code-Fix nötig → committen.

---

## Task 11: Gates + Voll-Smoke + PR

- [ ] **Step 1: `npm dedupe`** (false @types/react), dann Gates: `npx tsc --noEmit` (0) · `npx vitest run` (relevante Pattern grün, vorbestehende unrelated Fails ignorieren) · `npm run check:token-audit` (0) · `npm run check:component-set -- --ratchet` (0 neue) · `npm run check:knip -- --ratchet` (0 neue).
- [ ] **Step 2: Voll-Smoke** (`scripts/smoke-dispatch-v2-*.mjs`-Muster, Login `test-dispatch@claimondo.de` / `<PASSWORT — siehe GitHub-Secret TEST_*_PASSWORD>`, Test-Lead `c1964512-23af-4973-bf37-ff62d80599d5`, `?v2`, staging nach Deploy): Sidebar sichtbar + sticky beim Scrollen; alle Gesprächshilfe-Sektionen + Einwände aufklappbar; Timer; KundenMatch/Rückruf/Termine; **Personen-Panel erscheint bei `personenschaden_flag=ja` + speichert** (`personenschaden_personen`); **BKAT-Analyse läuft** (Button) + Vorschlag; **Cardentity-Button** sichtbar (NICHT real abrufen — kostenpflichtig); **Unfallskizze generieren/anzeigen** funktioniert; responsive (Mobile = Sidebar unter Form / collapsed). Screenshot + Auswertung im selben Turn.
- [ ] **Step 3:** `package-lock.json` NICHT committen (`git checkout -- package-lock.json` falls von dedupe verändert). PR `--base staging`, Titel `feat(dispatch-config-unify): P2d-4 — v2-Dispatcher-Sidebar + Vollständigkeit`, 7-Punkt-Audit im Body. **Nicht selbst mergen.**

---

## Task 5b: `parkplatz_kamera`-Toggle im Schaden-Section-Panel (Task-0-Gate — Aaron 03.06. Option 1)

Nach dem Task-0-Audit als neue Lücke gefunden (Legacy `SchadentypPicker.tsx:249-262` -> `_actions/schadentyp.ts`, speist `qualification-engine.ts:108` + `convert-lead-to-claim`). Spalte `parkplatz_kamera` existiert auf `leads` -> kein Migration. Läuft NACH Task 5 (gleicher `schaden`-Renderer).

**Files:** Modify `_v2/dispatch-section-panels.tsx` (schaden-Renderer).
- [ ] Im `schaden`-Renderer (nach Personen + BKAT): bedingter Kamera-Check-Toggle — nur wenn `ctx.values.schadentyp` dem Parkplatzschaden-Wert entspricht (exakten Wert aus dem schadentyp-Seed / `SchadentypPicker.tsx` verifizieren). Ja/Nein setzt `parkplatz_kamera` über die bestehende schadentyp-Action (`_actions/schadentyp.ts` — Signatur 1:1 übernehmen, KEIN neuer Writer). Initialwert aus `ctx.lead.parkplatz_kamera`. Umlaute korrekt.
- [ ] tsc -> 0. Commit `feat(p2d4): parkplatz_kamera-Toggle im schaden-Panel (Task-0-Gate)`.

---

## Task 6b: Eigentümer-Typ-Panel im Fahrzeug-Section-Panel (Task-0-Gate — Aaron 03.06. Option 1, inkl. VAT)

Neue Lücke aus Task-0 (Legacy `Phase4Stammdaten.tsx:753-865`). 3-Wege-Selector Privat/Leasing/Gewerblich -> setzt `finanzierung_leasing` + `vorsteuerabzugsberechtigt` (steuert Netto/Brutto-Regulierung + Leasinggeber-Vollmacht; load-bearing in convert-lead-to-claim / push-mandat). **Aaron-Entscheid: volles Panel inkl. VAT** — der 3-Wege-Selector koppelt beide Booleans, beide früh (vor FlowLink-Konversion) gebraucht. Spalten existieren auf `leads`, in `_actions/stammdaten.ts`-Allowlist (Z. 26) -> kein Migration. Läuft NACH Task 6 (gleicher `fahrzeug`-Renderer).

**Files:** Modify `_v2/dispatch-section-panels.tsx` (fahrzeug-Renderer; `fahrzeug`-Key kommt aus Task 6).
- [ ] Im `fahrzeug`-Renderer (neben Cardentity): Eigentümer-Typ-Panel, 3 Buttons — Privat (`finanzierung_leasing:'keine'`, `vorsteuerabzugsberechtigt:false`) / Leasing (`'leasing'`, `false`) / Gewerblich (`'keine'`, `true`). Aktiver Zustand aus `ctx.lead.finanzierung_leasing`/`vorsteuerabzugsberechtigt`, Save via `saveStammdaten`. Markup + Kontext-Hilfeboxen (Leasing/Finanzierung/Gewerblich) aus `Phase4Stammdaten.tsx:753-865` 1:1 übernehmen. Umlaute korrekt (Eigentümer, Gewerblich, …).
- [ ] tsc -> 0. Commit `feat(p2d4): Eigentümer-Typ-Panel im fahrzeug-Panel (Task-0-Gate, inkl. VAT)`.

---

## Task-0-Gate: 4 Minor-Lücken bewusst nach P3b verschoben
Grüne-Karte-Reminder (`setGrueneKarteAngefragt` — Reminder/Notification, kein Form-Feld), `lackfarbe_code` + imagin-Render-Preview (imagin gated bis Freischaltung; `fahrzeug_farbe`-Freitext reicht), `checkEmailIsSv`-Warnung (Edge/Polish), Kundenadresse-Geocoding `kunde_lat/lng` (Edge/Polish, SV-Match-Fallback). Dokumentiert in `docs/03.06.2026/p2d4-parity-matrix.md` als „vor P3b-Cutover schließen-oder-bewusst-droppen".

---

## Cutover-Notiz (Folge-Ticket P3b, NICHT dieser Plan)

Nach P2d-4 ist die Reader-Sweep-Delete-Liste (#2287) anzupassen: **KEEP** jetzt zusätzlich `_phases/Phase1PersonenForm`, `_phases/BkatAnalysePanel`, `_lib/gespraech-content.ts`, alle neuen `_v2/Dispatch{Sidebar,Gespraechshilfe,EinwandKarten}` + die reused Panels. **DELETE** weiterhin `DispatchShell`/`PhaseContent`/`PhaseHeader`/`_phases/Phase1-6`(außer PersonenForm/BkatAnalysePanel)/`phase-context`/`SidebarStubs` (dessen Inhalt ist nach Task 9 in `gespraech-content.ts`). ExitSkript → gelöscht (Inhalt in `gespraech-content.DISQUALIFIKATIONS_HILFE`).
