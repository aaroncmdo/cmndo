# Werkstatt-Finder SP-B2 (Selbstzahler-Claim-Abschluss) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Der Selbstzahler-Zweig erzeugt den partiellen Claim und schleust den Kunden über den bestehenden Account-Step ins Portal.

**Architecture:** Neue Server-Action `erzeugeSelbstzahlerClaim` (reuse `convertLeadToClaim` ohne SV/SA). `FlowQualiStep`-Selbstzahler-Zweig ruft sie → `onSelbstzahler(claimId)`. `FlowWizardKfz` spiegelt den SA→Account-Handler (`setFallId` + Nav zu `account`). Der Account-Step (E-Mail→Konto→Magic-Link→Portal) bleibt unverändert.

**Tech Stack:** Next.js 15 Server Actions, React client wizard, Supabase admin client.

## Global Constraints

- **Strikt additiv:** Account-Step + `createKundeAccount` + `convertLeadToClaim` unverändert. gegner/kasko/unklar + SA→Account-Pfad unberührt.
- **Umlaute Pflicht** in neuen UI-Strings (hardcoded-DE).
- **Voller Build** Pflicht (Route-Komponenten + Server-Action).
- **KB-Skip = Follow-up**, nicht hier (convert unberührt).

## File Structure

- **Modify** `src/app/flow/[token]/self-service-actions.ts` — neue `erzeugeSelbstzahlerClaim`.
- **Modify** `src/app/flow/[token]/FlowQualiStep.tsx` — Selbstzahler-Zweig ruft Action + `onSelbstzahler`.
- **Modify** `src/app/flow/[token]/FlowWizardKfz.tsx` — `onSelbstzahler`-Handler + Prop.

---

### Task 1: `erzeugeSelbstzahlerClaim` Server-Action

**Files:** Modify `src/app/flow/[token]/self-service-actions.ts` (nach `speichereQualiFlow`).

**Interfaces:**
- Consumes: `resolveFlowLead`, `convertLeadToClaim` (dynamic import).
- Produces: `erzeugeSelbstzahlerClaim(token: string): Promise<{ ok: true; claimId: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Funktion ergänzen** (direkt nach `speichereQualiFlow`):

```ts
/**
 * SP-B2: Selbstzahler-Abschluss. Erzeugt aus dem Flow-Lead den PARTIELLEN Claim
 * (kein SV/Gutachten/SA) via convertLeadToClaim ohne svIdFromTermin/signatureUrl.
 * Nur wenn der Lead als Selbstzahler qualifiziert ist (abrechnungsweg='selbstzahler',
 * SP-B1). Idempotent (convertLeadToClaim). Account-Step + Portal folgen im Wizard.
 */
export async function erzeugeSelbstzahlerClaim(
  token: string,
): Promise<{ ok: true; claimId: string } | { ok: false; error: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Defensive: nur echte Selbstzahler-Vorgaenge. abrechnungsweg ist type-lagged -> select('*')+Cast.
  const { data: leadRow } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle()
  const abrechnungsweg = (leadRow as Record<string, unknown> | null)?.abrechnungsweg as string | null | undefined
  if (abrechnungsweg !== 'selbstzahler') return { ok: false, error: 'Kein Selbstzahler-Vorgang.' }

  const { convertLeadToClaim } = await import('@/lib/leads/convert-lead-to-claim')
  const conv = await convertLeadToClaim({ leadId })
  if (!conv.ok) return { ok: false, error: conv.error }
  revalidatePath('/dispatch/leads')
  return { ok: true, claimId: conv.claimId }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Commit** (audit-Block).

---

### Task 2: `FlowQualiStep` — Selbstzahler-Zweig erzeugt Claim

**Files:** Modify `src/app/flow/[token]/FlowQualiStep.tsx`.

**Interfaces:**
- Consumes: `erzeugeSelbstzahlerClaim` (Task 1).
- Produces: neuer Prop `onSelbstzahler?: (claimId: string) => void`.

Verhalten: Im `sende`-Erfolgspfad, wenn `r.abrechnungsweg === 'selbstzahler'`, statt der bloßen Hinweis-Phase → `erzeugeSelbstzahlerClaim(token)`; bei Erfolg `onSelbstzahler(claimId)`, sonst Fehleransicht. Lade-Zustand „Wir richten deinen Vorgang ein…".

- [ ] **Step 1: Prop + Import ergänzen**

Import: `import { speichereQualiFlow, erzeugeSelbstzahlerClaim } from './self-service-actions'`
Prop im Signatur-Objekt: `onSelbstzahler?: (claimId: string) => void`

- [ ] **Step 2: `sende` erweitern** — den `selbstzahler`-Block ersetzen:

```tsx
      if (r.abrechnungsweg === 'selbstzahler') {
        setPhase('selbstzahler')
        const claimRes = await erzeugeSelbstzahlerClaim(token)
        if (!claimRes.ok) {
          setPhase('fehler')
          setFehler(claimRes.error)
          return
        }
        onSelbstzahler?.(claimRes.claimId)
        return
      }
```

- [ ] **Step 3: Selbstzahler-Phase = Ladeansicht** — den `phase === 'selbstzahler'`-Block ersetzen durch eine neutrale Ladeansicht:

```tsx
  if (phase === 'selbstzahler') {
    return (
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-2">Wir richten deinen Vorgang ein…</h1>
        <p className="text-claimondo-navy/70">Gleich findest du eine passende Werkstatt in deiner Nähe.</p>
      </div>
    )
  }
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** (audit-Block).

---

### Task 3: `FlowWizardKfz` — `onSelbstzahler`-Handler + Prop

**Files:** Modify `src/app/flow/[token]/FlowWizardKfz.tsx` (die `FlowQualiStep`-Render-Stelle, ~Z.599).

- [ ] **Step 1: Prop durchreichen** — im `<FlowQualiStep ... />` (currentStep.id === 'quali'):

```tsx
              <FlowQualiStep
                token={token}
                vorname={lead.vorname ?? null}
                onSchuldfrage={(v) => setSchuldfrageWahl(v)}
                onWeiter={() => setStepIndex(stepIndex + 1)}
                onSelbstzahler={(claimId) => {
                  // SP-B2: partieller Selbstzahler-Claim existiert -> wie SA-Pfad in den Account-Step.
                  setFallId(claimId)
                  setStepIndex(stepIndexById('account'))
                }}
              />
```

(Die vorhandenen Props `token`/`vorname`/`onSchuldfrage`/`onWeiter` bleiben — nur `onSelbstzahler` additiv ergänzt. Exakte bestehende Prop-Namen aus dem File übernehmen.)

- [ ] **Step 2: Voller Build** — `$env:NODE_OPTIONS='--max-old-space-size=8192'; npm run build` → grün.
- [ ] **Step 3: Commit** (audit-Block).

---

### Task 4: Audit + PR-Update

- [ ] **Step 1: Ratchets + i18n** — token-audit / component-set / knip / i18n(-render) → 0-neu.
- [ ] **Step 2: Vitest** (Regression) — `npx vitest run src/lib/self-service src/lib/werkstatt` → grün.
- [ ] **Step 3: 7-Punkt-Audit** dokumentieren.
- [ ] **Step 4: Push** auf `kitta/schaden-finder-abrechnungsweg` (= PR #3624 wächst um SP-B2). PR-Body um SP-B2-Abschnitt ergänzen + Post-Deploy-Smoke.

## Self-Review

- **Spec coverage:** §3 (erzeugeSelbstzahlerClaim / FlowQualiStep / FlowWizardKfz) → Tasks 1/2/3. §5 (Build+Smoke) → Task 4. ✓
- **Placeholder scan:** kein TBD; Code in jedem Step. ✓
- **Type consistency:** `erzeugeSelbstzahlerClaim`-Rückgabe (`claimId`) == Konsum in Task 2 (`claimRes.claimId`); `onSelbstzahler(claimId: string)` == Handler in Task 3. ✓
- **Kein Unit-Test** (Task 1 = Integration-Wrapper, keine reine Logik außer dem Guard) — bewusst, Verifikation via Build + Prod-Smoke (Spec §5).
