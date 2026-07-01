# Makler-Kunden-Landeseite (Hub) — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder superpowers:executing-plans. Steps nutzen Checkbox-Syntax.

**Goal:** Gebrandete Makler-Landeseite `claimondo.de/m/[Promo-Code]` (Finder + Anspruch, beide makler-attribuiert) + Behebung des `/start/makler`-404.

**Architecture:** Neue Marketing-Route (`claimondo-marketing/app/[locale]/m/[code]`) löst Promo-Code → Makler, rendert gebrandeten Hub mit 2 CTAs (Finder → App-Domain, Anspruch → `/check?m=`), trackt Klicks. Leg-2 reicht den Promo-Code in `/check` durch (post-convert UPDATE auf `leads.promotion_code_id`). 404-Fix = 1 Zeile in der App-`/makler/promo`-Seite.

**Tech Stack:** Next.js 16 (Marketing-Standalone-Build), next-intl, Tailwind v4, framer-motion, lucide-react, vitest 4, `@/lib/supabase/server` (`createServiceClient`).

**Spec:** `docs/superpowers/specs/2026-06-29-makler-landeseite-hub-design.md`.

## Global Constraints
- **UI-Umlaute Pflicht** (kundensichtbar): echte `ä/ö/ü/ß` in allen Hub-Strings.
- **Keine DDL** in diesem Feature (Leg-2 = post-convert UPDATE, kein Schema-Change). `anfragen` hat **keine** `promotion_code_id`-Spalte, `convert_anfrage_zu_lead` propagiert sie **nicht** (beides DB-verifiziert) → UPDATE nach der RPC.
- **Ratchets** (token-audit/component-set/knip) scannen **nur `src/**`** → die Hub-Files in `claimondo-marketing/` sind NICHT betroffen; **T3** (in `src/`) ist eine reine URL-String-Änderung (keine neuen Tokens/Komponenten).
- **DB-Client:** `createServiceClient()` aus `@/lib/supabase/server` (public Route, kein auth.uid()).
- **Cross-Domain-Link:** `process.env.NEXT_PUBLIC_EMBED_ORIGIN` (= `https://app.claimondo.de`), NICHT `NEXT_PUBLIC_APP_URL` (= Marketing-Domain).
- **Branding:** Claimondo (Marketing-eigene Komponenten/Tokens, KEIN app-`primitives/*`), Text-Personalisierung „Empfohlen von [Firma]".
- **⚠ Koordination:** T4 berührt `/check`-Files, an denen Session 3aba3976 (Rich-Anspruch-Rebuild) arbeitet → vor T4 `git log origin/staging -- claimondo-marketing/app/[locale]/check` prüfen + ggf. mit deren Stand mergen. T1–T3 sind unabhängig.

---

### Task 1: `resolveMaklerByPromoCode` Helper (TDD)

**Files:**
- Create: `claimondo-marketing/lib/makler/resolve-promo.ts`
- Test: `claimondo-marketing/lib/makler/__tests__/resolve-promo.test.ts`

**Interfaces:**
- Produces: `resolveMaklerByPromoCode(sb, code): Promise<{ promotionCodeId: string; maklerId: string; firma: string; aktiv: boolean } | null>` — von T2 (Hub) + T4 (/check) konsumiert.

- [ ] **Step 1: Failing test** — `__tests__/resolve-promo.test.ts`: mock einen `sb` mit `from('promotion_codes').select(...).eq('code', x).eq('aktiv', true).maybeSingle()`. Drei Fälle:
```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveMaklerByPromoCode } from '../resolve-promo'

function mockSb(row: unknown) {
  return { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }) }) }) } as never
}
describe('resolveMaklerByPromoCode', () => {
  it('valider Code -> Objekt', async () => {
    const r = await resolveMaklerByPromoCode(mockSb({ id: 'p1', makler: { id: 'm1', firma: 'Muster GmbH', status: 'aktiv' } }), 'MK-X')
    expect(r).toEqual({ promotionCodeId: 'p1', maklerId: 'm1', firma: 'Muster GmbH', aktiv: true })
  })
  it('unbekannter Code -> null', async () => {
    expect(await resolveMaklerByPromoCode(mockSb(null), 'MK-NOPE')).toBeNull()
  })
  it('inaktiver Makler -> aktiv:false', async () => {
    const r = await resolveMaklerByPromoCode(mockSb({ id: 'p1', makler: { id: 'm1', firma: 'X', status: 'gesperrt' } }), 'MK-X')
    expect(r?.aktiv).toBe(false)
  })
})
```
- [ ] **Step 2: Run, verify fail** — `cd claimondo-marketing && npx vitest run lib/makler/__tests__/resolve-promo.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** — `resolve-promo.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type MaklerHubTarget = { promotionCodeId: string; maklerId: string; firma: string; aktiv: boolean }

export async function resolveMaklerByPromoCode(
  sb: SupabaseClient,
  code: string,
): Promise<MaklerHubTarget | null> {
  const { data } = await sb
    .from('promotion_codes')
    .select('id, makler:makler_id(id, firma, status)')
    .eq('code', code)
    .eq('aktiv', true)
    .maybeSingle()
  if (!data) return null
  const m = Array.isArray((data as { makler: unknown }).makler)
    ? (data as { makler: unknown[] }).makler[0]
    : (data as { makler: unknown }).makler
  const makler = m as { id: string; firma: string; status: string } | null
  if (!makler) return null
  return {
    promotionCodeId: (data as { id: string }).id,
    maklerId: makler.id,
    firma: makler.firma,
    aktiv: makler.status === 'aktiv',
  }
}
```
- [ ] **Step 4: Run, verify pass** — `npx vitest run lib/makler/__tests__/resolve-promo.test.ts` → 3 PASS.
- [ ] **Step 5: Commit** — `git add claimondo-marketing/lib/makler && git commit` (Audit-Body, 7 Punkte).

---

### Task 2: Hub-Route + gebrandete Landing-Komponente

**Files:**
- Create: `claimondo-marketing/app/[locale]/m/[code]/page.tsx`
- Create: `claimondo-marketing/app/[locale]/m/[code]/MaklerHubLanding.tsx`

**Interfaces:** Consumes `resolveMaklerByPromoCode` (T1). Reachable: `claimondo.de/m/[code]` (middleware rewritet prefix-frei → `/de`).

- [ ] **Step 1: `MaklerHubLanding.tsx`** (präsentational, Server- oder Client-Komponente; nur Props, kein DB-Zugriff): Props `{ firma: string; finderHref: string; anspruchHref: string }`. Rendert: Hero „Empfohlen von **{firma}**" + Sub „Ihr Versicherungsmakler hat Sie an Claimondo vermittelt — Deutschlands Plattform für die Kfz-Schadenregulierung." + Trust-Zeile „Unverschuldet? Dann ist die Regulierung für Sie **kostenlos** (§ 249 BGB)." + 2 CTA-Karten: »Gutachter finden & Termin« (`href={finderHref}`) und »Anspruch prüfen« (`href={anspruchHref}`). Claimondo-Branding via Marketing-Tokens; lucide-Icons. **Echte Umlaute.** Reuse vorhandener Marketing-Section/Card-Patterns (vgl. `claimondo-marketing/components/landing/*`, `app/[locale]/check/*`).
- [ ] **Step 2: `page.tsx`** (Server-Component):
```tsx
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveMaklerByPromoCode } from '@/lib/makler/resolve-promo'
import { MaklerHubLanding } from './MaklerHubLanding'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function MaklerHubPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const sb = createServiceClient()
  const target = await resolveMaklerByPromoCode(sb, code)
  if (!target || !target.aktiv) redirect('/')   // Fallback: Marketing-Home (sicher vorhanden)

  // Klick-Tracking (fire-and-forget — Tracking-Fehler darf die Seite nie brechen)
  try { await sb.from('promo_clicks').insert({ promotion_code_id: target.promotionCodeId }) }
  catch (err) { console.error('[m] promo_clicks insert failed:', (err as Error).message) }

  const appOrigin = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'
  return (
    <MaklerHubLanding
      firma={target.firma}
      finderHref={`${appOrigin}/start/makler/${target.maklerId}`}
      anspruchHref={`/check?m=${encodeURIComponent(code)}`}
    />
  )
}
```
- [ ] **Step 3: Typecheck** — `cd claimondo-marketing && npm run typecheck` → grün.
- [ ] **Step 4: Smoke** — `npm run dev` (Marketing) → `localhost:3000/m/MK-SMKE` (Test-Makler, Prod-DB) zeigt „Empfohlen von Test Makler GmbH (Smoke)" + 2 CTAs; ungültiger Code → Redirect `/`; danach DB: `select count(*) from promo_clicks where promotion_code_id=(select id from promotion_codes where code='MK-SMKE')` ist gestiegen.
- [ ] **Step 5: Commit** (Audit-Body).

---

### Task 3: 404-Fix — `/makler/promo`-Link auf den Hub (App-Lane)

**Files:**
- Modify: `src/app/makler/(shell)/promo/page.tsx:44`

- [ ] **Step 1: Ändern** — `const landingUrl = `${landingBase()}/m/${code.code}`` (vorher `/start/makler/${makler.id}`). `landingBase()` bleibt (= `claimondo.de`); QR + Share-Buttons bauen automatisch aus `landingUrl`.
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` (App) → keine neuen Fehler. (Ratchets: reine URL-String-Änderung, keine neuen Tokens/Komponenten.)
- [ ] **Step 3: Smoke** — `/makler/promo` (als Test-Makler) zeigt oben `claimondo.de/m/MK-SMKE`; QR auflösbar.
- [ ] **Step 4: Commit** (Audit-Body; im Body: **Deploy NACH dem Hub** — Cross-Lane).

---

### Task 4: Leg-2 — Promo-Durchreichen in `/check` (⚠ Koordination 3aba3976)

**Files:**
- Modify: `claimondo-marketing/app/[locale]/check/check-lead-action.ts`
- Modify: `claimondo-marketing/app/[locale]/check/page.tsx` + `CheckFunnelClient.tsx`

- [ ] **Step 0: Koordination** — `git fetch origin && git log origin/staging --oneline -- "claimondo-marketing/app/[locale]/check"` prüfen. Falls 3aba3976 `/check` neu gebaut hat: deren Stand rebasen/mergen, dann additiv aufsetzen.
- [ ] **Step 1: `CheckFunnelClient.tsx`** — `m` aus `searchParams` (oder als Prop von `page.tsx`) lesen und als hidden field in das FormData an `submitCheckLead` hängen (`formData.append('m', m)` bzw. `<input type="hidden" name="m" value={m}>`).
- [ ] **Step 2: `page.tsx`** — `searchParams.m` an `CheckFunnelClient` durchreichen.
- [ ] **Step 3: `check-lead-action.ts`** — nach erfolgreichem `convert_anfrage_zu_lead` (vor dem Notify-Block), wenn `formData.get('m')` gesetzt: `resolveMaklerByPromoCode(sb, m)` → `await sb.from('leads').update({ promotion_code_id: target.promotionCodeId }).eq('id', leadId)` in **best-effort try/catch** (ein Fail darf die Lead-Erstellung nicht brechen; der Lead existiert schon, ohne Promo bleibt er ein normaler Check-Lead). `LeadSchema` um optionales `m: z.string().optional()` ergänzen (oder `m` außerhalb des Schemas via `formData.get` lesen).
- [ ] **Step 4: Typecheck** — `npm run typecheck` (Marketing) → grün.
- [ ] **Step 5: E2E-Verify** — `/check?m=MK-SMKE` ausfüllen+absenden → DB: `select promotion_code_id from leads where id=<neuer leadId>` == MK-SMKE-Promo-id. Und ohne `?m=` → `promotion_code_id` null (Regression: normaler Check-Lead unverändert).
- [ ] **Step 6: Commit** (Audit-Body; Koordinations-Hinweis 3aba3976).

---

## Abschluss
- PR gegen `staging` (Branch `kitta/makler-landeseite-hub`). PR-Body: Cross-Lane-Deploy-Reihenfolge (Hub/Marketing vor Promo-Flip/App), Koordination 3aba3976, Verweis auf Spec.
- **Deploy-Verifikation (Aaron/Plan):** Ist `/start/makler/[id]` auf `app.claimondo.de` (Prod-VPS) live? (Leg-1-Ziel.) Sonst App-Deploy zuerst.
- `superpowers:finishing-a-development-branch`.
