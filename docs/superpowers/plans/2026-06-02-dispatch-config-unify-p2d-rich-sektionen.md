# Dispatch Config-Unify P2d — Rich-Sektionen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Platzhalter-Felder im config-getriebenen `DispatchLeadForm` (`?v2`) durch die echten, voll funktionsfähigen Dispatch-Komponenten ersetzen — ohne den geteilten `FieldRenderer` (Kunden-Flow!) mit Dispatcher-Concerns zu verschmutzen.

**Architecture:** Zwei Mechanismen, beide in `DispatchLeadForm` (NICHT in `FieldRenderer`): (1) eine **Dispatcher-Field-Override-Map** `feld_key → (ctx) => ReactNode` — matched ein Feld, rendert die Rich-Komponente statt des Default-`FieldRenderer`-Outputs; sonst Fallback auf `FieldRenderer`. (2) **Sektion-Injektionen** — nach den Feldern einer Sektion bespoke Panels (Unfallskizze, Zeugen-Editor, Wunschtermin-Pills). `FieldRenderer` bleibt rein (gleicher Render-Vertrag für Kunde+Dispatcher).

**Tech Stack:** Next 16 (App Router, Server Components), React 19, TypeScript, Supabase, vitest (Logik), Playwright (UI-Smoke). Gates: `tsc --noEmit` (Build OOMt im Worktree), `vitest`, `check:token-audit`, `check:component-set -- --ratchet`.

---

## Entscheidungen für Aaron (vor/bei Review)

1. **P2d-Scope-Schnitt:** Voll = 4 Sub-PRs (P2d-1 Termin/SvDispatchPanel · P2d-2 Field-Autocompletes · P2d-3 Sektion-Panels · P2d-4 Kontext-Panels). **Empfehlung:** P2d-1 + P2d-3 zuerst (echter Funktions-Gewinn: Termin buchen + Unfallskizze/Zeugen), P2d-2 danach (Input-Qualität), **P2d-4 separat/optional**.
2. **Gesprächsleitfaden + KundenMatch sind heute SIDEBAR-Widgets mit `useDispatchPhase()`-Kontext** (den die flache Form nicht hat). Im flachen `?v2`-Form gibt es keine Phase. Optionen: (a) als statische Top-Panels rendern (Leitfaden ohne Phasen-Logik, KundenMatch unverändert mit leadId), (b) bewusst aus P2d rausnehmen und in einem eigenen „Dispatcher-Sidebar v2"-Ticket behandeln. **Empfehlung: (b)** — sie gehören nicht in die Feld-Config.
3. **Address-Autocomplete (P2d-2):** `unfallort`/`besichtigungsort_adresse`/`kunde_*` sind heute `text`-Felder mit EINER Spalte. `GooglePlaceAutocomplete` schreibt mehrere Spalten (strasse/plz/stadt/lat/lng). Für die flache Form heißt das: das Override schreibt die Parts-Spalten direkt (am `saveDispatchLeadFelder`-Allowlist vorbei). **Empfehlung:** dediziertes Place-Override mit eigenem Save (wie Phase4 heute), nicht über den generischen Feld-Save.

---

## Bestandsaufnahme (verifiziert via Agenten + DB, 02.06.)

### Rich-Komponenten (Pfad · Props · Kontext-Bedarf · aktueller Render-Ort)

| Komponente | Pfad | Props (Kern) | Braucht über value/onChange hinaus | Heute gerendert in |
|---|---|---|---|---|
| **SvDispatchPanel** | `src/app/dispatch/leads/[id]/SvDispatchPanel.tsx` | `leadId, hardGateOk, hardGateDetails?, aktiverTermin, wunschterminIso?, wunschterminWochentage?` | leadId + aktiverTermin + hardGate + wunschtermin; eigene Server-Actions (`sv-termin.ts`) | `_phases/Phase2TerminServiceTyp.tsx:300` |
| **TerminField** (Kunde) | `src/components/onboarding/fields/TerminField.tsx` | `value, onChange, disabled, token` | `token` (sonst „Link ungültig", Z.49) | FieldRenderer (`typ='termin'`), WizardClient |
| **UnfallskizzeCard** | `src/app/dispatch/leads/[id]/_phases/UnfallskizzeCard.tsx` | `leadId, unfallhergang, initialSvg, initialBestaetigt, initialGeneriertAm` | leadId + lead-Spalten `unfallskizze_*`; Actions generate/approve/clear | `_phases/Phase5Zusammenfassung.tsx` |
| **ZeugenKontakteEditor** | inline in `_phases/Phase4Stammdaten.tsx:255-361` | `leadId, initialKontakte: {name,telefon?,email?,notiz?}[]` | leadId + `leads.zeugen_kontakte` (jsonb); save via `saveStammdaten` | Phase4Stammdaten (NICHT extrahiert) |
| **Wunschtermin-Pills** | inline in `_phases/Phase2TerminServiceTyp.tsx:191-237` | `number[]` (ISO 1=Mo..7=So) + toggle/reset | `leads.wunschtermin_wochentage` (int[]); save via `saveStammdaten` | Phase2 (NICHT extrahiert) |
| **GooglePlaceAutocomplete** | `src/components/GooglePlaceAutocomplete.tsx` | `defaultValue?, onSelect(PlaceResult), onBlur?, onChange?` | `onSelect` → strasse/plz/stadt/lat/lng (mehrere Spalten) | Phase4Stammdaten (unfallort, kunde) |
| **KennzeichenPartsField** | inline in `_phases/Phase4Stammdaten.tsx:382-499` | `leadId, lead, patchLead, ...` (kennzeichen_kreis/buchstaben/zahl/suffix) | helpers `@/lib/format/kennzeichen` (parse/build) | Phase4 (NICHT extrahiert) |
| **VersicherungAutocomplete** | `src/components/VersicherungAutocomplete.tsx` | `initialName?, initialId?, onSelect(VersicherungSelection), onFreitextConfirm?, status?` | Action `searchVersicherungen`; schreibt `gegner_versicherung_id` + `gegner_versicherung` | Phase4 (`GegnerVersicherungField`) |
| **KundenMatchCard** | `src/app/dispatch/leads/[id]/_sidebar/KundenMatchCard.tsx` | `leadId, initialMatchedKundeId` | Action `findKundenMatches`/`linkLeadToExistingKunde`/`unlink` | Sidebar (DispatchShell) |
| **Gesprächsleitfaden** | `_sidebar/SidebarStubs.tsx:212-348` (+ `GespraechsleitfadenTimer.tsx`) | — (nutzt `useDispatchPhase()`-Kontext) | **Phasen-Kontext** (existiert in flacher Form NICHT) | Sidebar |

### `termin`-Feld (das zentrale Platzhalter-Problem)
- DB: `lead-erfassung` Sektion „Termin & Besichtigung" (p_ord 70), `feld_key='termin'`, `typ='termin'`, `spalte=termin_id`, `audience='beide'`, f_ord 40.
- Kunde (WizardClient): `FieldRenderer` `case 'termin'` → `<TerminField token=…>` (Self-Service, korrekt).
- Dispatcher (`DispatchLeadForm`): `FieldRenderer` bekommt KEINEN token → `TerminField` zeigt **„Link ungültig"**. → muss `SvDispatchPanel` rendern.

### `?v2`-Page lädt heute zu wenig
`src/app/dispatch/leads/[id]/page.tsx:39-42` (der `?v2`-Branch) lädt NUR `lead` + `ladeFlowPhasen('lead-erfassung','dispatcher')`. Der Legacy-Branch (ab Z.50) lädt zusätzlich: `aktiverSvTermin` (aus `gutachter_termine`, Z.83-120), `computeQualificationStatus(lead, aktiverSvTermin)` → `qual` (Z.123), Hard-Gate q1/q2/q3. **P2d-1 muss diese Daten in den `?v2`-Branch ziehen** und an `DispatchLeadForm` durchreichen.

### FieldRenderer-Vertrag (Z.21-43)
`FieldRenderer({ feld, value, onChange, disabled, svId?, anfrageId?, preSelectedSvLeadId?, fallId?, zb1Token?, token? })`. Wir fügen hier **nichts** hinzu — Dispatcher-Overrides leben in `DispatchLeadForm`.

---

## File Structure (neu/geändert über alle Sub-PRs)

- `src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.tsx` — **NEU**: Override-Map + `getDispatchFieldOverride(feld, ctx)`-Dispatcher (Kern-Architektur).
- `src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.test.ts` — **NEU**: vitest für die Map-Dispatch-Logik.
- `src/app/dispatch/leads/[id]/DispatchLeadForm.tsx` — **GEÄNDERT**: nimmt `dispatchCtx`-Props, ruft Override vor `FieldRenderer`, rendert Sektion-Injektionen.
- `src/app/dispatch/leads/[id]/page.tsx` — **GEÄNDERT**: `?v2`-Branch lädt aktiverTermin + hardGate + wunschtermin.
- `src/components/shared/KennzeichenPartsInput.tsx` — **NEU (P2d-2)**: Extraktion des inline-Phase4-Felds.
- `src/app/dispatch/leads/[id]/_v2/ZeugenKontakteEditor.tsx`, `WunschterminPills.tsx` — **NEU (P2d-3)**: Extraktion aus Phase2/Phase4 als wiederverwendbare Composites.
- Smoke: `scripts/smoke-dispatch-v2-termin.mjs` (P2d-1) etc.

---

## Decomposition (je eigener Branch off frischem staging, eigener PR --base staging, Squash)

| Sub-PR | Inhalt | Komponenten | Risiko |
|---|---|---|---|
| **P2d-1** | Dispatcher-Context + Override-Architektur + **Termin** | SvDispatchPanel statt TerminField | mittel (page.tsx-Datenladen, neue Arch) |
| **P2d-2** | Field-Input-Upgrades | GooglePlaceAutocomplete, KennzeichenPartsInput, VersicherungAutocomplete | mittel (Multi-Spalten-Save) |
| **P2d-3** | Sektion-Panels | UnfallskizzeCard, ZeugenKontakteEditor (wenn zeugen=Ja), Wunschtermin-Pills | niedrig-mittel |
| **P2d-4** (optional/separat) | Kontext-Panels | KundenMatchCard, Gesprächsleitfaden (de-phased) | mittel (Phasen-Kontext-Entkopplung) |

---

## Task-Detail: **P2d-1 — Dispatcher-Context + Override-Map + Termin**

**Branch:** `kitta/dispatch-config-unify-p2d-1-termin` off frischem `origin/staging`.

### Task 1: Override-Map-Dispatcher (TDD-Kern)

**Files:**
- Create: `src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.tsx`
- Test: `src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.test.ts`

- [ ] **Step 1: Failing test** — `dispatch-field-overrides.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { hasDispatchFieldOverride } from './dispatch-field-overrides'

describe('dispatch field overrides', () => {
  it('termin-Feld hat ein Dispatcher-Override', () => {
    expect(hasDispatchFieldOverride('termin')).toBe(true)
  })
  it('normales Textfeld hat KEIN Override (Fallback auf FieldRenderer)', () => {
    expect(hasDispatchFieldOverride('kennzeichen')).toBe(false)
    expect(hasDispatchFieldOverride('vorname')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd <worktree> && npx vitest run src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.test.ts`
Expected: FAIL — `hasDispatchFieldOverride is not a function`.

- [ ] **Step 3: Minimal implementation** — `dispatch-field-overrides.tsx`

```tsx
'use client'
import type { ReactNode } from 'react'
import type { OnboardingFeld } from '@/components/onboarding/types'
import SvDispatchPanel from '../SvDispatchPanel'

// Kontext den Dispatcher-Rich-Felder brauchen (von DispatchLeadForm gereicht).
export type DispatchFieldCtx = {
  leadId: string
  hardGateOk: boolean
  hardGateDetails: { q1: boolean; q2: boolean; q3: boolean } | null
  aktiverTermin: import('../SvDispatchPanel').AktiverTermin | null
  wunschterminIso: string | null
  wunschterminWochentage: number[] | null
}

// feld_key -> Renderer. Nur Felder die der Dispatcher REICHER sieht.
const OVERRIDES: Record<string, (ctx: DispatchFieldCtx) => ReactNode> = {
  termin: (ctx) => (
    <SvDispatchPanel
      leadId={ctx.leadId}
      hardGateOk={ctx.hardGateOk}
      hardGateDetails={ctx.hardGateDetails}
      aktiverTermin={ctx.aktiverTermin}
      wunschterminIso={ctx.wunschterminIso}
      wunschterminWochentage={ctx.wunschterminWochentage}
    />
  ),
}

export function hasDispatchFieldOverride(feldKey: string): boolean {
  return feldKey in OVERRIDES
}

export function renderDispatchFieldOverride(feld: OnboardingFeld, ctx: DispatchFieldCtx): ReactNode | null {
  const fn = OVERRIDES[feld.feld_key]
  return fn ? fn(ctx) : null
}
```

> NOTE: `AktiverTermin` muss aus `SvDispatchPanel.tsx` exportiert sein. Falls nicht → in Step davor `export type AktiverTermin` ergänzen (Task 1b unten).

- [ ] **Step 3b: `AktiverTermin` aus SvDispatchPanel exportieren** (falls noch nicht)

Modify `src/app/dispatch/leads/[id]/SvDispatchPanel.tsx`: den lokalen `type AktiverTermin` auf `export type AktiverTermin` heben. (Kein Verhalten geändert.)

- [ ] **Step 4: Run test, verify PASS**

Run: `npx vitest run src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.tsx src/app/dispatch/leads/[id]/_v2/dispatch-field-overrides.test.ts src/app/dispatch/leads/[id]/SvDispatchPanel.tsx
git commit -m "feat(dispatch-config-unify): P2d-1 Task1 — Dispatcher-Field-Override-Map + termin"
```

### Task 2: `?v2`-Page lädt aktiverTermin + hardGate + wunschtermin

**Files:**
- Modify: `src/app/dispatch/leads/[id]/page.tsx:39-42` (der `?v2`-Branch)

- [ ] **Step 1: aktiverTermin + qual in den `?v2`-Branch ziehen.** Den `gutachter_termine`-Select (heute Z.83-90 im Legacy-Branch) + `computeQualificationStatus` (Z.123) VOR den `if (v2 !== undefined)`-Branch hochziehen, ODER im `?v2`-Branch duplizieren. DRY-Variante: beides vor den Branch ziehen, beide Branches nutzen es.

Konkret (vor `if (v2 !== undefined)` einfügen):
```ts
const { data: svTerminRaw } = await supabase
  .from('gutachter_termine')
  .select('id, sv_id, start_zeit, end_zeit, status, sv_ablehnung_grund, sv_vorgeschlagene_slots, sachverstaendige(profiles!sachverstaendige_profile_id_fkey(vorname, nachname))')
  .eq('lead_id', id)
  .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag', 'abgelehnt'])
  .order('created_at', { ascending: false }).limit(1).maybeSingle()
// ... gleiche Normalisierung wie Legacy-Branch (svTerminRow -> aktiverSvTermin), Z.92-120 wiederverwenden
const qual = computeQualificationStatus(lead, aktiverSvTermin)
```

- [ ] **Step 2: An DispatchLeadForm reichen.** Den `?v2`-Return ändern:
```tsx
if (v2 !== undefined) {
  const phasen = await ladeFlowPhasen('lead-erfassung', 'dispatcher')
  return (
    <DispatchLeadForm
      lead={lead as Record<string, unknown> & { id: string }}
      phasen={phasen}
      aktiverTermin={aktiverSvTermin}
      hardGateOk={qual.q1_schuldfrage && qual.q2_schaden && qual.q3_polizei}
      hardGateDetails={{ q1: qual.q1_schuldfrage, q2: qual.q2_schaden, q3: qual.q3_polizei }}
      wunschterminIso={(lead.wunschtermin as string | null) ?? null}
      wunschterminWochentage={(lead.wunschtermin_wochentage as number[] | null) ?? null}
    />
  )
}
```
> Spalten-Check vor Bau: `wunschtermin` (text) + `wunschtermin_wochentage` (int[]) via information_schema verifizieren (sind in der Lead-Row vorhanden, `select('*')`).

- [ ] **Step 3: tsc grün** — `npx tsc --noEmit` exit 0 (DispatchLeadForm-Props folgen in Task 3; ggf. Task 2+3 zusammen committen damit tsc zwischenstand grün ist).

- [ ] **Step 4: Commit** (zusammen mit Task 3, s.u.).

### Task 3: DispatchLeadForm nutzt das Override

**Files:**
- Modify: `src/app/dispatch/leads/[id]/DispatchLeadForm.tsx`

- [ ] **Step 1: Props erweitern** — `DispatchLeadForm` nimmt `aktiverTermin, hardGateOk, hardGateDetails, wunschterminIso, wunschterminWochentage` (Typen aus `dispatch-field-overrides.tsx` `DispatchFieldCtx`, minus leadId).

- [ ] **Step 2: Im Feld-Loop Override-First rendern.** Aktuell (Z.126-134) rendert jedes Feld via `<FieldRenderer …>`. Ändern zu:
```tsx
{phase.felder.map((feld) => {
  if (hasDispatchFieldOverride(feld.feld_key)) {
    return (
      <div key={feld.id}>
        {renderDispatchFieldOverride(feld, {
          leadId, hardGateOk, hardGateDetails, aktiverTermin, wunschterminIso, wunschterminWochentage,
        })}
      </div>
    )
  }
  return (
    <FieldRenderer key={feld.id} feld={feld} value={values[feld.feld_key]}
      onChange={(val) => setField(feld.feld_key, val)} disabled={false} />
  )
})}
```
> `termin` schreibt nicht über `saveDispatchLeadFelder` (SvDispatchPanel ownt `gutachter_termine` + revalidatet selbst) — daher NICHT in `values`/Autosave aufnehmen. `saveDispatchLeadFelder` überspringt `termin`/`_termin` bereits (Sentinel, P2b §3.4).

- [ ] **Step 3: tsc grün** — `npx tsc --noEmit` exit 0.

- [ ] **Step 4: Commit**
```bash
git add src/app/dispatch/leads/[id]/page.tsx src/app/dispatch/leads/[id]/DispatchLeadForm.tsx
git commit -m "feat(dispatch-config-unify): P2d-1 Task2+3 — ?v2 laedt aktiverTermin+hardGate, DispatchLeadForm rendert SvDispatchPanel fuer termin"
```

### Task 4: Smoke (UI, staging)

**Files:**
- Create: `scripts/smoke-dispatch-v2-termin.mjs` (Vorlage: `scripts/smoke-dispatch-zb1-audience.mjs`)

- [ ] **Step 1:** Login als `test-dispatch@claimondo.de`/`Test1234!` (Basic-Auth `aaroncmdo`/`ClaimondoSuperuser123789!!`), `app.staging.claimondo.de/dispatch/leads/c1964512-23af-4973-bf37-ff62d80599d5?v2`.
- [ ] **Step 2: Assert** (case-insensitiv): Sektion „Termin & Besichtigung" rendert SvDispatchPanel-Marker (z.B. „Gutachter vorschlagen"/„Termin reservieren"-Text), **kein** „Link ungültig", 0 Console-Errors. Screenshot nach `docs/<datum>/smoke-dispatch-v2-termin/`.
- [ ] **Step 3:** `SMOKE_RESULT=PASS` → Commit Script + Screenshot.

### Task 5: 7-Punkt-Audit + PR

- [ ] Audit-Block (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression) in der Commit-/PR-Message. PR `--base staging`, **nicht selbst mergen**.
- [ ] Regression-Fokus: Legacy-Branch (ohne `?v2`) unverändert (DispatchShell) — die page.tsx-Umbauten dürfen den Default-Pfad nicht brechen. `findBestSV`/`sv-termin.ts`-Actions unverändert.

---

## Outline: P2d-2 — Field-Input-Upgrades (eigener Plan beim Erreichen)

Overrides ergänzen (gleiche Map): `unfallort` + `besichtigungsort_adresse` + `kunde_strasse` → `GooglePlaceAutocomplete` (onSelect schreibt Parts-Spalten via dediziertem Save, NICHT generischer Allowlist); `kennzeichen` + `gegner_kennzeichen` → `KennzeichenPartsInput` (ZUERST aus `Phase4Stammdaten.tsx:382-499` nach `src/components/shared/KennzeichenPartsInput.tsx` extrahieren — Boy-Scout, dann beide Consumer); `gegner_versicherung` → `VersicherungAutocomplete` (schreibt `gegner_versicherung_id`+`gegner_versicherung`). Tasks je: extrahieren (falls inline) → Override-Eintrag → Multi-Spalten-Save-Action → tsc → Smoke.

## Outline: P2d-3 — Sektion-Panels (eigener Plan)

Sektion-Injektion in `DispatchLeadForm` (nach den Feldern einer Sektion, keyed by `phase.titel`/`phase_key`): **Unfallhergang-Sektion** → `UnfallskizzeCard` (leadId + lead.unfallhergang + unfallskizze_*) + `ZeugenKontakteEditor` (nur wenn `values['zeugen']==='true'`; ZUERST aus Phase4 extrahieren nach `_v2/ZeugenKontakteEditor.tsx`). **Termin-Sektion** → `WunschterminPills` (aus Phase2 extrahieren, `leads.wunschtermin_wochentage`). Kein neues Seeding nötig (zeugen_kontakte/wunschtermin_wochentage sind Spalten, keine Felder — werden von den Editoren direkt gepflegt). Tasks: extrahieren → Sektion-Injektions-Mechanismus (`SEKTION_PANELS: Record<phaseKey, (ctx)=>ReactNode[]>`) → tsc → Smoke.

## Outline: P2d-4 — Kontext-Panels (separat/optional, Aaron-Entscheidung 2)

`KundenMatchCard` (leadId + initialMatchedKundeId) als Top-Panel über den Sektionen. `Gesprächsleitfaden`: braucht Entkopplung von `useDispatchPhase()` — entweder statische Variante (alle Phasen-Skripte als Akkordeon) oder rausnehmen. **Empfehlung: in eigenes „Dispatcher-Sidebar-v2"-Ticket.**

---

## Self-Review

**Spec coverage (Handoff §2 P2d):** SvDispatchPanel ✓ (P2d-1) · Unfallskizze ✓ (P2d-3) · zeugen_kontakte-Editor ✓ (P2d-3) · wunschtermin_wochentage ✓ (P2d-3) · Place-Autocomplete ✓ (P2d-2) · Kennzeichen-Parts ✓ (P2d-2) · Versicherungs-Autocomplete ✓ (P2d-2) · KundenMatch + Gesprächsleitfaden → P2d-4 (Entscheidung 2: empfohlen separat). Kein Spec-Punkt ohne Task.

**Placeholder-Scan:** P2d-1 vollständig (Code in jedem Step). P2d-2/3/4 sind bewusst Outlines (separate Pläne je Sub-PR beim Erreichen) — NICHT als „TODO später" innerhalb eines auszuführenden Tasks, sondern als getrennte Subsysteme (writing-plans §Scope-Check: multi-subsystem → separate Pläne).

**Type-Konsistenz:** `DispatchFieldCtx` (Task1) == Props die page.tsx (Task2) liefert == DispatchLeadForm (Task3) durchreicht. `AktiverTermin` aus SvDispatchPanel exportiert (Task1b) und in DispatchFieldCtx + page.tsx genutzt. `hasDispatchFieldOverride`/`renderDispatchFieldOverride` Namen konsistent über Task1+3.

**Gotchas verankert:** `termin` nicht in Autosave (SvDispatchPanel ownt gutachter_termine); page.tsx Legacy-Branch-Regression; Worktree-Gate = `tsc --noEmit` (Build OOMt); Branch off frischem staging (Squash).
