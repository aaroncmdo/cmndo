# Kunde-Claim-Detail-View Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Kunde-Claim-Detail-View (`src/app/kunde/faelle/[id]`) + die Kunde-Termine-Views als sauberes, tokenkonsistentes, phasen-adaptives Zonen-Dashboard (mobile-first) neu bauen — voll DB-getrieben aus einer reinen Ableitung.

**Architecture:** Dünne `page.tsx` → EIN Loader (`getKundeClaimView`) → EIN ViewModel → reine `deriveKundeZonen`/`deriveKundeAufgaben` (phasen-adaptiv, aus `getClaimLifecycle`) → 5 Zone-Komponenten. Gute Bestands-Cards werden in Zonen wiederverwendet, Token-Sünder neu. Termine-Views nutzen denselben `getKundeTermine`-Loader (SV `gutachter_termine` + Reparatur `reparatur_termine`).

**Tech Stack:** Next.js 15 App Router (Server Components + `'use client'`), Supabase (RLS-Views + admin/service-role), TypeScript, vitest, next-intl, `@/components/primitives` + `@/components/shared`, `src/lib/status`-Registry.

**Spec:** `docs/superpowers/specs/2026-07-09-kunde-claim-detail-rebuild-design.md`

## Global Constraints
- **Branch:** `kitta/kunde-claim-detail-rebuild` (off `staging`), PR gegen `staging`, nie `main` (Regel 1).
- **UI-Strings:** Umlaut-korrektes Deutsch (ä/ö/ü/ß); next-intl-Keys wo bestehende Muster es nutzen.
- **Token-Konsistenz:** NUR primitives/shared + claimondo-Tokens; kein inline-Hex/-color, keine handgerollten Cards/Buttons; Status/Farbe via `src/lib/status`-Registry (`StatusBadge`/`resolveStatus`). Ratchets (component-set/token-audit/status-registry/knip/redirect-stubs) 0-neu.
- **Phasen-SSoT:** `getClaimLifecycle`/`getClaimLifecycleForClaim` (lifecycle.ts) — NICHT `v_claim_workstate` (das ist 470d55c9-Ops). Kein Doppelbau; `FallPhasenPanel` kunde-Variante nutzen, kein Fork. (`broadcast-kunde-detail-rebuild-an-470d55c9`)
- **Termin-Lifecycle:** bleibt 6c630247 (Engine/Status). Ich lese nur `gutachter_termine`/`reparatur_termine`. (`broadcast-kunde-termine-rebuild-an-6c630247`)
- **Server-Actions:** Result-Object `{ok,…}`, kein throw; `revalidatePath`. Ownership: `assertKundeOwnsClaim` bzw. Kunde-Session-RLS-SELECT.
- **Ratchet-Verify je Task-Ende:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (0 in berührten Files) + relevante vitest.

## File Structure (Verantwortlichkeiten)
| Datei | Verantwortung |
|---|---|
| `src/lib/claims/kunde-claim-view.ts` | `getKundeClaimView(admin, user, claimId)` → `KundeClaimViewModel` (EIN Loader, bündelt die Reads) + Type-Export |
| `src/lib/claims/kunde-termine.ts` (+ `__tests__/`) | `getKundeTermine(admin, claimIds)` → `KundeTermin[]` (SV + Reparatur, discriminated `art`) |
| `src/lib/claims/kunde-zonen.ts` (+ `__tests__/`) | PURE `deriveKundeZonen(vm)` + `deriveKundeAufgaben(vm)` (phasen-adaptiv) + Zone/Aufgabe-Types |
| `src/components/kunde/claim-view/KundeClaimView.tsx` | Shell — rendert die sichtbaren Zonen in Reihenfolge |
| `src/components/kunde/claim-view/StatusZone.tsx` | Kompakter Status-Streifen + SV-Live |
| `src/components/kunde/claim-view/AufgabenZone.tsx` | Offene Kunde-CTAs |
| `src/components/kunde/claim-view/TeamZone.tsx` | KB + SV |
| `src/components/kunde/claim-view/GeldZone.tsx` | Forderung/Auszahlung/KVA/Ausfall |
| `src/components/kunde/claim-view/DoksTermineZone.tsx` | Pflichtdoks + Termine + Gutachten + FallDetailSections |
| `src/components/shared/KundeAlert.tsx` | status-registry-Alert (ersetzt 3 inline-Alerts) |
| `src/app/kunde/faelle/[id]/page.tsx` | dünn — Auth/Ownership/Redirect → getKundeClaimView → `<KundeClaimView>` |
| `src/app/kunde/termine/page.tsx` + `KundeTermineClient.tsx` | Liste, getKundeTermine, token-sauber |
| `src/app/kunde/termine/[id]/page.tsx` + `KundeTerminDetailClient.tsx` | Detail (SV + Reparatur), token-sauber |

---

## PHASE 0 — Fundament (pure Datenschicht, kein UI-Switch)

### Task 1: `KundeTermin`-Type + `getKundeTermine`-Loader (SV + Reparatur)

**Files:**
- Create: `src/lib/claims/kunde-termine.ts`
- Test: `src/lib/claims/__tests__/kunde-termine.test.ts`

**Interfaces:**
- Produces:
```typescript
export type KundeTermin = {
  id: string
  art: 'sv' | 'reparatur'          // discriminated
  start: string | null              // ISO (SV: start_zeit; Reparatur: bestaetigter_termin ?? wunschtermin)
  status: string | null
  claim_id: string | null
  // SV-only
  kanal?: string | null
  typ?: string | null
  // Reparatur-only
  werkstatt_id?: string | null
}
export async function getKundeTermine(
  admin: SupabaseClient, claimIds: string[],
): Promise<KundeTermin[]>
```
- Consumes: `createAdminClient`-Instanz (übergeben).

- [ ] **Step 1: Failing test** — `kunde-termine.test.ts`: mockt den admin-Client (2 `.from()`-Aufrufe: gutachter_termine → 1 Zeile; reparatur_termine → 1 Zeile), erwartet ein gemergtes, nach `start` desc sortiertes Array mit `art:'sv'` + `art:'reparatur'`.
```typescript
import { describe, it, expect, vi } from 'vitest'
import { getKundeTermine } from '../kunde-termine'
function mkAdmin(sv: unknown[], rep: unknown[]) {
  return { from: (t: string) => ({ select: () => ({ in: () => ({ is: () => ({ not: () => ({ order: () => Promise.resolve({ data: t === 'gutachter_termine' ? sv : rep }) }) }), order: () => Promise.resolve({ data: t === 'gutachter_termine' ? sv : rep }) }) }) }) } as never
}
it('merged SV + Reparatur, sortiert desc, discriminated art', async () => {
  const admin = mkAdmin(
    [{ id: 'sv1', start_zeit: '2026-07-10T09:00:00Z', status: 'bestaetigt', fall_id: 'c1', kanal: 'vor_ort', typ: 'sv_begutachtung' }],
    [{ id: 'r1', bestaetigter_termin: '2026-07-12T10:00:00Z', wunschtermin: null, status: 'angefragt', claim_id: 'c1', werkstatt_id: 'w1' }],
  )
  const r = await getKundeTermine(admin, ['c1'])
  expect(r.map(t => t.art)).toEqual(['reparatur', 'sv']) // 07-12 vor 07-10 (desc)
  expect(r.find(t => t.art === 'sv')?.id).toBe('sv1')
})
it('leere claimIds -> []', async () => {
  expect(await getKundeTermine(mkAdmin([], []), [])).toEqual([])
})
```
- [ ] **Step 2: Run** `npx vitest run src/lib/claims/__tests__/kunde-termine.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** — `getKundeTermine`: bei leeren claimIds `[]`; sonst zwei parallele Reads (`gutachter_termine` select `id,start_zeit,status,typ,kanal,fall_id` mit `.is('cancelled_at',null).not('status','in','(verschoben,verlegt,storniert,abgesagt)')`; `reparatur_termine` select `id,status,wunschtermin,bestaetigter_termin,claim_id,werkstatt_id` mit `.neq('status','storniert')`) → auf `KundeTermin` mappen (SV: start=start_zeit; Reparatur: start=bestaetigter_termin ?? wunschtermin) → mergen → nach `start` desc (nulls last) sortieren.
- [ ] **Step 4: Run** vitest → PASS.
- [ ] **Step 5: Commit** `feat(kunde-detail): P0 getKundeTermine-Loader (SV + Reparatur, discriminated)`.

### Task 2: `KundeClaimViewModel`-Type + `getKundeClaimView`-Loader

**Files:**
- Create: `src/lib/claims/kunde-claim-view.ts`

**Interfaces:**
- Consumes: `getKundeFallDetailRecord`, `getClaimLifecycleForClaim`, `getKundeTermine` (Task 1), + die kunde-only-Reads (SV/KB-Kontakt via `get-kontakt`, Dokumente, Auszahlung via `faelle_kunde_view`, Gutachten-Werte via `v_gutachten_werte`, Pflichtdoks).
- Produces:
```typescript
export type KundeClaimViewModel = {
  fall: Awaited<ReturnType<typeof getKundeFallDetailRecord>>   // flat record (bestehend)
  lifecycle: /* ReturnType von getClaimLifecycle */
  termine: KundeTermin[]
  team: { kb: KontaktInfo | null; sv: KontaktInfo | null }
  geld: { forderungNetto: number | null; auszahlungNetto: number | null; kvaBrutto: number | null; reparaturdauerTage: number | null; gutachtenWerte: GutachtenWerte | null }
  dokumente: FallDokument[]
  pflichtdokumente: /* getPflichtdokumenteForFall-Shape */
  flags: { abrechnungsweg: string | null; istReparaturRoute: boolean; bankdatenOffen: boolean; gutachtenVerfuegbar: boolean; /* … */ }
}
export async function getKundeClaimView(
  admin: SupabaseClient, userId: string, userEmail: string | null, claimId: string,
): Promise<KundeClaimViewModel | null>
```
- [ ] **Step 1:** `kunde-claim-view.ts` anlegen — `getKundeClaimView` orchestriert die Reads (Promise.all wo möglich), baut das ViewModel. KEINE neue Query-Logik erfinden: die bestehenden Loader/Reads aus `page.tsx` (heute Z.81-582) hierher ziehen + bündeln. `flags.istReparaturRoute = istWerkstattReparaturWeg(fall.abrechnungsweg)`.
- [ ] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → grün (nur Import-Verdrahtung, noch kein Consumer).
- [ ] **Step 3: Commit** `feat(kunde-detail): P0 getKundeClaimView-Loader + ViewModel`.

> HINWEIS: Task 2 ist KEIN TDD-Task (reiner Orchestrierungs-Loader, DB-integrationslastig). Verifikation über tsc + den P1-Prod-Smoke. Die TESTBARE Logik lebt in Task 3/4 (pure).

### Task 3: `deriveKundeZonen` (pure, phasen-adaptiv)

**Files:**
- Create: `src/lib/claims/kunde-zonen.ts`
- Test: `src/lib/claims/__tests__/kunde-zonen.test.ts`

**Interfaces:**
- Consumes: `KundeClaimViewModel` (Task 2).
- Produces:
```typescript
export type ZoneId = 'status' | 'aufgaben' | 'team' | 'geld' | 'doksTermine'
export function deriveKundeZonen(vm: KundeClaimViewModel): ZoneId[]  // in mobiler Reihenfolge, nur sichtbare
```
- [ ] **Step 1: Failing test** — Sichtbarkeits-Regeln (§4 Spec): status immer; aufgaben nur wenn `deriveKundeAufgaben(vm).length>0`; team wenn kb||sv; geld wenn `mainPhase∈{regulierung,abschluss}` ODER Forderung/Auszahlung/KVA gesetzt; doksTermine immer. Reihenfolge: status, aufgaben, team, geld, doksTermine.
```typescript
import { deriveKundeZonen } from '../kunde-zonen'
const base = { lifecycle: { mainPhase: 'begutachtung' }, team: { kb: {}, sv: null }, geld: { forderungNetto: null, auszahlungNetto: null, kvaBrutto: null }, /* … */ } as never
it('Begutachtung ohne Aufgaben/Geld -> status, team, doksTermine', () => {
  expect(deriveKundeZonen(base)).toEqual(['status', 'team', 'doksTermine'])
})
it('Regulierung -> geld erscheint', () => {
  expect(deriveKundeZonen({ ...base, lifecycle: { mainPhase: 'regulierung' } })).toContain('geld')
})
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren** (reine Regeln, ruft `deriveKundeAufgaben`). **Step 4: Run** → PASS. **Step 5: Commit** `feat(kunde-detail): P0 deriveKundeZonen (phasen-adaptiv, pure)`.

### Task 4: `deriveKundeAufgaben` (pure)

**Files:**
- Modify: `src/lib/claims/kunde-zonen.ts` (+ Test dazu)

**Interfaces:**
- Produces:
```typescript
export type KundeAufgabe = { id: 'bankdaten' | 'kva_freigabe' | 'pflichtdok' | 'termin_bestaetigen' | 'sa_vollmacht'; label: string; href?: string }
export function deriveKundeAufgaben(vm: KundeClaimViewModel): KundeAufgabe[]
```
- [ ] **Step 1: Failing test** — bankdaten wenn `flags.bankdatenOffen`; kva_freigabe wenn `flags.istReparaturRoute && kvaBrutto!=null && !reparatur_freigegeben`; pflichtdok wenn offene Pflichtdoks; etc. Leerer vm → [].
```typescript
import { deriveKundeAufgaben } from '../kunde-zonen'
it('Reparatur-Route mit KVA, nicht freigegeben -> kva_freigabe-Aufgabe', () => {
  const vm = { flags: { istReparaturRoute: true, bankdatenOffen: false }, geld: { kvaBrutto: 2380 }, fall: { reparatur_freigegeben_am: null }, pflichtdokumente: [] } as never
  expect(deriveKundeAufgaben(vm).map(a => a.id)).toContain('kva_freigabe')
})
it('nichts offen -> []', () => {
  expect(deriveKundeAufgaben({ flags:{istReparaturRoute:false,bankdatenOffen:false}, geld:{kvaBrutto:null}, fall:{}, pflichtdokumente:[] } as never)).toEqual([])
})
```
- [ ] **Step 2-4:** RED → implement → GREEN. **Step 5: Commit** `feat(kunde-detail): P0 deriveKundeAufgaben (pure)`.

---

## PHASE 1 — Shell + Status/Aufgaben + KundeAlert

### Task 5: `<KundeAlert>` (shared, status-registry)
**Files:** Create `src/components/shared/KundeAlert.tsx`. Ersetzt die 3 inline-Alerts (VS-Kürzung/Ablehnung/Klage, heute page.tsx:793-827).
- **Interface:** `KundeAlert({ tone: 'warning'|'danger'|'info', titel: string, text: string })` → rendert eine token-konsistente Alert-Card (semantische `*-soft`/`*-strong`-Tokens, KEIN inline-color).
- [ ] Bauen (primitives, semantische Tokens) → tsc grün → `npm run check:token-audit`/`check:component-set` 0-neu → Commit `feat(kunde-detail): P1 shared KundeAlert (status-registry)`.

### Task 6: `<KundeClaimView>`-Shell + `StatusZone`
**Files:** Create `KundeClaimView.tsx` + `StatusZone.tsx`.
- **KundeClaimView:** `{ vm }` → `deriveKundeZonen(vm).map(id => <Zone>)` (switch id → Komponente), mobile-first `space-y-4 max-w-xl mx-auto px-4`.
- **StatusZone:** kompakter Streifen — `MAIN_PHASE_LABEL[vm.lifecycle.mainPhase]` + `SUBPHASE_LABEL[subPhase]` + „nächster Schritt" (aus lifecycle) + SV-Live (aus vm.termine[art=sv] realtime-Feldern). Ersetzt `KundeSvLiveBanner` inline-colors → semantische Tokens/`StatusBadge`. Alert-Zustände via `<KundeAlert>`.
- [ ] Bauen → tsc grün → leichte Render-Smoke (mount, zeigt Phase-Label) → Commit `feat(kunde-detail): P1 KundeClaimView-Shell + StatusZone`.

### Task 7: `AufgabenZone` + page.tsx-Umstellung
**Files:** Create `AufgabenZone.tsx`; Modify `src/app/kunde/faelle/[id]/page.tsx`.
- **AufgabenZone:** `deriveKundeAufgaben(vm)` → CTA-Zeilen (primitives Button/Card, href/Anchor). Bankdaten → BankdatenBanner-Trigger; kva_freigabe → link/scroll GeldZone; pflichtdok → Dokumente-Tab.
- **page.tsx:** Auth/Ownership/Redirect behalten → `const vm = await getKundeClaimView(admin, user.id, user.email, claimId)` → `<KundeClaimView vm={vm} />`. Die alten 23 Card-Renders (P2/P3-Zonen) BLEIBEN vorerst darunter (inkrementeller Switch) ODER werden hinter einem Flag rausgenommen — sauberster Weg: page.tsx rendert NUR noch `<KundeClaimView>`, die noch nicht gebauten Zonen sind leer bis P2/P3.
- [ ] Bauen → `npm run build` (Route) grün → **Prod-Smoke** (test-kunde: Status + Aufgaben sichtbar, kein 5xx) → Commit `feat(kunde-detail): P1 AufgabenZone + page.tsx auf Zonen-Shell`.

---

## PHASE 2 — Team + Geld

### Task 8: `TeamZone`
**Files:** Create `TeamZone.tsx`. Wrappt KB + SV (aus vm.team) — KundeBetreuerStrip/SaeuleMeinBetreuer-Inhalt token-sauber neu (Avatar/Name/Rolle/Chat/Anruf via primitives).
- [ ] Bauen → tsc/Ratchets 0-neu → Commit `feat(kunde-detail): P2 TeamZone`.

### Task 9: `GeldZone`
**Files:** Create `GeldZone.tsx`. Wrappt (reuse) `SaeuleMeinGeld` + `AuszahlungCard` + `KostenvoranschlagCard` (Reparatur-Route) + `KundeAusfallEntschaedigungCard` — aus vm.geld. Token-Politur beim Wrappen.
- [ ] Bauen → tsc/Ratchets 0-neu → Prod-Smoke (Regulierungs-Claim zeigt Geld) → Commit `feat(kunde-detail): P2 GeldZone`.

---

## PHASE 3 — Doks & Termine + Termine-Views + Cleanup

### Task 10: `DoksTermineZone`
**Files:** Create `DoksTermineZone.tsx`. Wrappt `PflichtdokumenteSection` + Termine (aus vm.termine, SV + Reparatur, via TerminSectionCard-Muster) + Gutachten-Download (`GutachtenPdfButton`) + `FallDetailSections`.
- [ ] Bauen → tsc/Ratchets 0-neu → Commit `feat(kunde-detail): P3 DoksTermineZone`.

### Task 11: Termine-Views (Liste + Detail) auf `getKundeTermine` + token-sauber
**Files:** Modify `src/app/kunde/termine/page.tsx` (+ `KundeTermineClient.tsx`), `src/app/kunde/termine/[id]/page.tsx` (+ `KundeTerminDetailClient.tsx`).
- Liste: `getKundeTermine(admin, ownedClaimIds)` statt nur gutachter_termine → zeigt SV + Reparatur (art-Badge). Detail: bei `art:'reparatur'` die Reparatur-Ansicht (Werkstatt statt SV). Token-Sünder (3+5) → primitives/shared.
- [ ] Bauen → tsc/Ratchets 0-neu → Prod-Smoke (Selbstzahler-Kunde sieht Reparaturtermin) → Commit `feat(kunde-detail): P3 Termine-Views SV+Reparatur, token-sauber`.

### Task 12: Cleanup + Dead-Code + Ratchet-Baseline
**Files:** Modify `src/app/kunde/faelle/[id]/page.tsx`; delete tote Alt-Cards/inline-Blöcke.
- Alte inline-Alerts/ad-hoc-Gates/tote Loader entfernen; `npm run check:knip -- --update-baseline` (Boy-Scout) + `check:component-set`/`check:status-registry -- --update-baseline` (gesenkte Baselines) mit PR-Begründung.
- [ ] Voller `npm run build` grün → **Prod-Smoke über alle Phasen** (Erfassung/Begutachtung/Regulierung/Abschluss × Haftpflicht/Reparatur) → Commit `chore(kunde-detail): P3 Cleanup + Ratchet-Baselines`.

---

## Selbst-Review (Spec-Abdeckung)
- §3 Architektur → Task 2/6 (Loader+Shell). §4 Zonen → Task 6-10. §4 AufgabenZone → Task 4/7. §5 Token → Task 5 (KundeAlert) + Politur in 6-11. §6 470d55c9 → Global Constraints (lifecycle.ts, FallPhasenPanel). §7b Termine → Task 1 (Loader) + 11 (Views). §8 Testing → Task 1/3/4 vitest + Prod-Smokes. §9 Phasen → P0-P3. Keine Lücke.
- Type-Konsistenz: `KundeClaimViewModel` (Task 2) → konsumiert in Task 3/4/6-10; `KundeTermin` (Task 1) → Task 2/10/11; `ZoneId`/`KundeAufgabe` (Task 3/4) → Task 6/7. Konsistent.
