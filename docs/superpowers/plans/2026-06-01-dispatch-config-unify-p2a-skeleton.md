# Dispatch-Config-Unify P2a — DispatchLeadForm Skeleton (read-only, ?v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Der config-getriebene flache Dispatcher-Renderer `DispatchLeadForm` rendert die `lead-erfassung`-Felder (audience dispatcher/beide) nach `sektion` gruppiert mit den Lead-Werten — **hinter `?v2`**, neben der Live-`DispatchShell`. Read-only (kein Save; das ist P2b). Beweist Loader -> Render -> Gate-Pipeline + die geteilte FieldRenderer-/Loader-Infra.

**Architecture:** DRY-Refactor zweier Bestands-Files (verhaltensgleich) + 2 neue Files + 1 Page-Gate. `FieldRenderer` aus `WizardClient` in shared Modul extrahiert (2 Consumer). `ladeBeauftragungPhasen` zu `ladeFlowPhasen(flowKey, audience)` generalisiert (P0 hat den audience-Filter schon). Kein Live-Risk: alles hinter `?v2`, Default-Pfad unveraendert.

**Tech Stack:** Next.js 16 (searchParams = Promise), React, TypeScript, vitest. Harte Regeln: PR `--base staging`, nie selbst mergen, 7-Punkt-Audit, Umlaute UI, primitives/shared statt handrolled wo moeglich.

---

### Task 1: `FieldRenderer` in shared Modul extrahieren (DRY)

**Files:**
- Create: `src/components/onboarding/FieldRenderer.tsx` (move 1:1 aus WizardClient: die `FieldRenderer`-Funktion + ihr Props-Type + die `fields/*`-Imports)
- Modify: `src/components/onboarding/WizardClient.tsx` (FieldRenderer + fields/*-Imports raus; stattdessen `import { FieldRenderer } from './FieldRenderer'`)

- [ ] **Step 1:** Neue Datei mit `'use client'`, exportiere `FieldRenderer` (identischer Code inkl. Props-Type aus WizardClient L681-817). fields/*-Imports mitnehmen.
- [ ] **Step 2:** In WizardClient die lokale `FieldRenderer`-Funktion + die 11 `fields/*`-Imports loeschen, `import { FieldRenderer } from './FieldRenderer'` ergaenzen. Call-Site (L598) unveraendert.
- [ ] **Step 3:** `npx tsc --noEmit` + `npx vitest run src/lib/onboarding` (Helper-Tests gruen) — Verhalten unveraendert.
- [ ] **Step 4:** Commit `refactor(onboarding): FieldRenderer in shared Modul (Reuse fuer DispatchLeadForm)`.

---

### Task 2: `ladeFlowPhasen` generalisieren + Dispatch-Loader

**Files:**
- Create: `src/lib/onboarding/lade-flow-phasen.ts` — `ladeFlowPhasen(flowKey: string, audience: 'kunde'|'dispatcher'): Promise<OnboardingPhase[]>` = der bisherige `ladeBeauftragungPhasen`-Body, aber `flow_key=flowKey` + `filterFelderByAudience(felder, audience)`.
- Modify: `src/lib/onboarding/lade-beauftragung-phasen.ts` — Body ersetzen durch `return ladeFlowPhasen('beauftragung', 'kunde')` (Name + Signatur bleiben → /anfrage-Render unveraendert).

- [ ] **Step 1:** `lade-flow-phasen.ts` schreiben (kopiere die Query+Map-Logik aus lade-beauftragung-phasen.ts, ersetze die feste `'beauftragung'` durch `flowKey` und `'kunde'` durch den `audience`-Param).
- [ ] **Step 2:** `lade-beauftragung-phasen.ts` auf den Wrapper reduzieren (`import { ladeFlowPhasen }`; `export async function ladeBeauftragungPhasen() { return ladeFlowPhasen('beauftragung','kunde') }`).
- [ ] **Step 3:** `npx tsc --noEmit`. Erwartet: gruen (beauftragung-Consumer sieht identische Signatur).
- [ ] **Step 4:** Commit `refactor(onboarding): ladeFlowPhasen(flowKey, audience) — generalisiert fuer Dispatch-Renderer`.

---

### Task 3: `DispatchLeadForm` (flach, read-only Skeleton)

**Files:**
- Create: `src/app/dispatch/leads/[id]/DispatchLeadForm.tsx` (`'use client'`)

- [ ] **Step 1:** Component-Props `{ lead: Record<string, unknown> & { id: string }, phasen: OnboardingPhase[] }`. Lokaler `values`-State initial aus `lead` (pro `feld.feld_key` -> `lead[feld_key]`; bool -> 'true'/'false'-String fuer segmented). Render: pro Phase (== sektion) ein aufklappbarer `<details>`/SectionCard-Block mit `phasen[i].titel`; darin pro sichtbarem Feld (`meetsCondition` analog WizardClient, aber **alle sichtbar** — conditional_on nur als visuelle Gruppierung, kein Hard-Hide noetig fuer Dispatcher) ein `<FieldRenderer feld value onChange={lokal} disabled={false} />`. **Read-only-Hinweis-Banner** „Vorschau (?v2) — Speichern kommt in P2b". Kein DB-Write.
- [ ] **Step 2:** `npx tsc --noEmit`. Erwartet: gruen.
- [ ] **Step 3:** Commit `feat(dispatch): DispatchLeadForm Skeleton (flach, sektion-Gruppen, read-only)`.

---

### Task 4: `?v2`-Gate in `page.tsx`

**Files:**
- Modify: `src/app/dispatch/leads/[id]/page.tsx`

- [ ] **Step 1:** Signatur erweitern: `searchParams: Promise<{ v2?: string }>`. `const { v2 } = await searchParams`. Wenn `v2 !== undefined`: `const phasen = await ladeFlowPhasen('lead-erfassung','dispatcher')` und `return <DispatchLeadForm lead={lead} phasen={phasen} />` (vor dem bestehenden DispatchShell-Return; restliche Server-Loads koennen fuer den v2-Pfad uebersprungen werden — minimaler v2-Branch). Default-Pfad (kein v2) unveraendert → DispatchShell.
- [ ] **Step 2:** `npx tsc --noEmit` (Route-Change → CI-`build` autoritativ).
- [ ] **Step 3:** Commit `feat(dispatch): ?v2-Gate rendert DispatchLeadForm neben DispatchShell`.

---

### Self-Review / Verifikation
- **tsc gruen** + vitest onboarding gruen (FieldRenderer-Extraktion verhaltensgleich).
- **Default-Pfad unveraendert:** ohne `?v2` rendert weiter `DispatchShell` (Live-Dispatch unberuehrt).
- **Smoke (nach Merge+Deploy):** `/dispatch/leads/<id>?v2` zeigt 9 Sektionen mit Lead-Werten; `/anfrage/<token>?wizard=v2` + kunde-onboarding weiter ok (FieldRenderer/Loader-Refactor).
- **PR** `--base staging`, 7-Punkt-Audit, nicht selbst mergen.

### Folge (P2b ff.)
P2b Save-Action + Boolean-Coercion + Autosave · P2c Gates→Flags · P2d Rich-Sektionen · P2e OCR-DB-Fix · P2f Checkliste.
