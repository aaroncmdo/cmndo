# Vertrieb-CRM-Konsolidierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 5-Tab-Re-Export-Shell `/admin/vertrieb` wird EINE „Übersicht" (Cockpit): Rollen-Pills (SV·Makler·Werkstatt) + Lead/Partner-Schalter, kontextuelle Aktions-Leiste, ein Detail-Drawer als CRM-Cockpit — vollständig DB-driven.

**Architecture:** Der bestehende `VertriebRosterClient` (liest die DB-View `v_vertrieb_kontakt`) wird zum Cockpit ausgebaut; der `VertriebDetailDrawer` wird zum CRM-Cockpit, das die **bereits existierenden** Partner-Leads-Actions (`updatePartnerLead`, `protokolliereAktivitaet`, `konvertierePartnerLead`) wiederverwendet. Neu sind: DB-getriebene E-Mail-Vorlagen, die Cross-Table-Dedup-Erweiterung des Scrapers, und schwere Alt-Flows als Drawer-Overlays.

**Tech Stack:** Next.js (modifiziert — siehe Redirect-Regel), React, TypeScript, Supabase (Postgres + Views), react-email/Resend, vitest, Tailwind v4 + Claimondo-Design-Tokens.

## Global Constraints

Diese gelten für JEDE Task (verbatim aus Spec + AGENTS.md):

- **DDL nur via Supabase-Plugin** `mcp__plugin_supabase_supabase__apply_migration` (Regel 2). Ablauf: apply_migration → `list_migrations` (recorded Version `<V>` ablesen) → File committen als `supabase/migrations/<V>_<name>.sql` (Name == recorded Version) → `execute_sql` (READ) verifizieren. **NIE** raw `execute_sql` mit DDL, **NIE** `supabase db push`.
- **Reine Redirects NUR via `next.config.ts` `redirects()`** (`permanent: true`) + `page.tsx` löschen. **NIEMALS** eine `page.tsx`, die auf allen Pfaden `redirect()` macht ohne Content-`return` (Redirect-Stub-Gate → React #310 Leershell). Guard-`redirect()` (mit folgendem JSX-`return`) bleibt erlaubt.
- **Component-Set:** `@/components/primitives` (`Button` variant=`navy|ondo|ghost|bare|danger|success`, size=`sm|md|lg|icon`, `loading`, `onClick`; `Card` p/radius/onPress; `Drawer`, `Modal`), `@/components/ui/Chip` (`Chip`/`ChipRow`, variant=`default|selected|ghost`, `count`, `onClick|href`), `@/components/shared/DataTable`, `@/components/shared/StatusBadge`. **Kein** handgerolltes `<button>`/`<div class="card">`/`<table>`.
- **Status-Farben** nur via `<StatusBadge domain="vertrieb-workflow" code={stufe} />` (Status-Registry-Gate). Keine inline Status-Farb-Maps.
- **Token-Audit:** keine raw Hex in className, keine Tailwind-Status-Scales (`green/red/amber…`), keine Accent-Scales (`blue/indigo…`), keine Default-Radien (`rounded-lg` → `rounded-ios-lg`). Claimondo-Tokens (`bg-claimondo-navy`, `text-claimondo-ondo`, `#0D1B3E`/`#4573A2`/`#7BA3CC`).
- **Umlaute** in ALLEN nutzersichtbaren Strings (UI-Labels, Toasts, E-Mail-Vorlagen): echte `ä/ö/ü/ß`.
- **Server-Actions:** Result-Object `{ ok: boolean; error?: string }` bzw. `{ ok: true; data } | { ok: false; error }` — **kein** `throw`. Non-critical Sub-Ops (E-Mail/Log-Insert) in lokalem `try/catch`. **`revalidatePath('/admin/vertrieb')`** nach jedem Write. Keine Konstanten/Types aus `'use server'`-Files exportieren.
- **Nested-FK** aus Supabase mit `Array.isArray(x) ? x[0] : x` normalisieren.
- **Branch:** `kitta/vertrieb-konsolidierung` (Worktree `.claude/worktrees/vertrieb-konsolidierung`, off `release-4024`). PR-Target: mit Release-Owner klären (release-4024 vs staging). **Nie** direkt auf `main` (Regel 1).
- **⚠ Koordination e8aa73d4** (`kitta/partner-onboarding-termine`): Vor-Ort-/Onboarding-Termin dort andocken, nicht duplizieren (betrifft Task-Gruppe P2/P3-Termin). Interface abstimmen, bevor der Termin-Teil startet.
- **Jeder Commit:** 7-Punkte-Audit im Body (Build/UI/Redundanz/Dead-Code/Spec/Inkonsistenz/Regression).
- **tsc lokal:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`. Bei Routen/Layout/Server-Action-Änderungen **immer** `npm run build`. Vitest scoped: `npx vitest run <pfad>`.

---

## File Structure

**Neu:**
- `src/app/admin/vertrieb/VertriebPillBar.tsx` — Rollen-Pills + Lead/Partner-Schalter (Chip-basiert).
- `src/app/admin/vertrieb/VertriebAktionsleiste.tsx` — kontextuelle Aktions-Leiste (je Pill × Lead/Partner).
- `src/app/admin/vertrieb/_lib/context-kpis.ts` — reine Fn: KPIs je aktiver Pill aus `kontakte`.
- `src/app/admin/vertrieb/_lib/context-aktionen.ts` — reine Fn: Aktions-Set je (rolle, typ).
- `src/app/admin/vertrieb/_lib/get-vertrieb-lead-detail.ts` — Lead-Detail + Aktivitäten-Loader (P2).
- `src/app/admin/vertrieb/drawer/LeadCockpit.tsx` — CRM-Cockpit-Body für Leads (P2).
- `src/app/admin/vertrieb/drawer/PartnerCockpit.tsx` — Profil/Aktionen für Partner (P2).
- `src/app/admin/vertrieb/drawer/AktivitaetLog.tsx` — Aktivitäts-Feed + „Anruf protokollieren"/„Notiz" (P2, reuse-nah an partner-leads).
- `src/app/admin/vertrieb/drawer/MailComposer.tsx` — DB-Vorlage → editierbar → senden (P3).
- `src/lib/vertrieb/mail-vorlagen.ts` — Loader + Merge-Render (rein) für `vertrieb_mail_vorlagen` (P3).
- `src/app/admin/vertrieb/_actions/sende-vertrieb-mail.ts` — Send-Action + Activity-Log (P3).
- `src/app/admin/vertrieb/_actions/mail-vorlagen.ts` — CRUD der Master-Vorlagen (P3).
- `src/app/admin/vertrieb/vorlagen/page.tsx` + `MailVorlagenClient.tsx` — Verwaltungs-Fläche der Vorlagen (P3).
- `src/lib/partner/bestands-partner.ts` — `ladeBestandsPartner(rolle)` für Cross-Table-Dedup (P4).
- `src/app/admin/vertrieb/drawer/OverlayFlows.tsx` — Wrapper, der schwere Alt-Komponenten als Drawer rendert (P5).
- `src/app/admin/makler/actions.ts` → **erweitern** um `resendWerkstattWelcome` (P5) — bzw. `src/app/admin/werkstaetten/actions.ts`.

**Ändern:**
- `src/app/admin/vertrieb/VertriebRosterClient.tsx` — Buttons→Pills, KPIs kontextuell, Aktions-Leiste einhängen, Drawer-Props (P1/P2).
- `src/app/admin/vertrieb/VertriebDetailDrawer.tsx` — Lifecycle-/Rollen-Switch → LeadCockpit/PartnerCockpit (P2).
- `src/app/admin/vertrieb/layout.tsx` — `VertriebKonsoleTabs` entfernen (Titel bleibt) (P1).
- `src/app/admin/partner-leads/actions.ts` — `ladeBestandsLeads` um Partner erweitern; `updatePartnerLead`-Patch um Ansprechpartner-Felder (P2/P4).
- `next.config.ts` — Redirects der Alt-Listen-Routen (P5).

**Löschen (P5, nach Embedding):**
- `src/app/admin/vertrieb/VertriebKonsoleTabs.tsx`
- `src/app/admin/vertrieb/{makler,partner-leads,sachverstaendige,werkstaetten}/page.tsx` (Re-Export-Stubs) — Vorsicht: Sub-Routen (`sachverstaendige/[id]`, `sachverstaendige/anlegen`, `sachverstaendige/basic-freigaben`, `werkstaetten/[id]`, `werkstaetten/qr-pool`) BLEIBEN (Deep-Link/Overlay-Ziele).

---

## Phase 1 — Shell/Cockpit (UI-only, kein Datenverlust)

Ziel: Tab-Nav weg, Roster = Cockpit mit Pills + kontext-KPIs + Aktions-Leiste (Deep-Links auf Bestand). Alle Alt-Funktionen bleiben erreichbar. Keine DB-Änderung.

### Task 1: Kontext-KPIs (reine Fn)

**Files:**
- Create: `src/app/admin/vertrieb/_lib/context-kpis.ts`
- Test: `src/app/admin/vertrieb/_lib/context-kpis.test.ts`

**Interfaces:**
- Consumes: `VertriebKontakt` (`@/lib/vertrieb/vertrieb-kontakt.types`), `VertriebRolle`.
- Produces: `computeContextKpis(kontakte: VertriebKontakt[], rolle: VertriebRolle | 'alle'): { label: string; wert: number }[]`

- [ ] **Step 1: Failing test**

```typescript
// context-kpis.test.ts
import { describe, it, expect } from 'vitest'
import { computeContextKpis } from './context-kpis'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

const k = (p: Partial<VertriebKontakt>): VertriebKontakt => ({
  id: 'x', kind: 'partner-lead', name: 'A', email: null, telefon: null, plz: null, ort: null,
  lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null, roh_status: null,
  roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null, roh_portal_zugang: null,
  roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  stufe: 'neu', typ: 'lead', rolle: 'werkstatt', ...p,
})

describe('computeContextKpis', () => {
  it('zählt bei "alle" global über alle Rollen', () => {
    const rows = [k({ typ: 'lead', stufe: 'neu' }), k({ typ: 'partner', stufe: 'aktiv', rolle: 'sv' })]
    const kpis = computeContextKpis(rows, 'alle')
    expect(kpis.find((x) => x.label === 'Leads')?.wert).toBe(1)
    expect(kpis.find((x) => x.label === 'Aktiv')?.wert).toBe(1)
  })
  it('scopet bei Rolle-Pill auf diese Rolle', () => {
    const rows = [k({ rolle: 'sv', stufe: 'aktiv', typ: 'partner' }), k({ rolle: 'werkstatt', stufe: 'aktiv', typ: 'partner' })]
    const kpis = computeContextKpis(rows, 'sv')
    expect(kpis.find((x) => x.label === 'Aktiv')?.wert).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run src/app/admin/vertrieb/_lib/context-kpis.test.ts`
Expected: FAIL („computeContextKpis is not a function").

- [ ] **Step 3: Implement**

```typescript
// context-kpis.ts
import type { VertriebKontakt, VertriebRolle } from '@/lib/vertrieb/vertrieb-kontakt.types'

/** KPIs für die Cockpit-Cards, gescopet auf die aktive Rolle-Pill (DB-Daten, client-seitig gezählt). */
export function computeContextKpis(
  kontakte: VertriebKontakt[],
  rolle: VertriebRolle | 'alle',
): { label: string; wert: number }[] {
  const rows = rolle === 'alle' ? kontakte : kontakte.filter((k) => k.rolle === rolle)
  const zaehle = (pred: (k: VertriebKontakt) => boolean) => rows.filter(pred).length
  return [
    { label: 'Leads', wert: zaehle((k) => k.typ === 'lead') },
    { label: 'Onboarding', wert: zaehle((k) => k.stufe === 'onboarding') },
    { label: 'Aktiv', wert: zaehle((k) => k.stufe === 'aktiv') },
    { label: 'Gesperrt', wert: zaehle((k) => k.stufe === 'gesperrt') },
  ]
}
```

- [ ] **Step 4: Run — verify PASS**

Run: `npx vitest run src/app/admin/vertrieb/_lib/context-kpis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/vertrieb/_lib/context-kpis.ts src/app/admin/vertrieb/_lib/context-kpis.test.ts
git commit -m "feat(vertrieb): kontext-KPIs (reine Fn, rolle-gescopet)"
```

### Task 2: Kontext-Aktionen (reine Fn)

**Files:**
- Create: `src/app/admin/vertrieb/_lib/context-aktionen.ts`
- Test: `src/app/admin/vertrieb/_lib/context-aktionen.test.ts`

**Interfaces:**
- Consumes: `VertriebRolle`, `VertriebTyp`.
- Produces: `type VertriebAktion = { key: string; label: string; href?: string; kind: 'scrape' | 'csv' | 'anlegen' | 'freigaben' | 'qrpool' }` und `contextAktionen(rolle: VertriebRolle | 'alle', typ: VertriebTyp | 'alle'): VertriebAktion[]`

- [ ] **Step 1: Failing test**

```typescript
// context-aktionen.test.ts
import { describe, it, expect } from 'vitest'
import { contextAktionen } from './context-aktionen'

describe('contextAktionen', () => {
  it('Lead-Modus zeigt Scrapen + CSV', () => {
    const a = contextAktionen('werkstatt', 'lead')
    expect(a.map((x) => x.kind)).toContain('scrape')
    expect(a.map((x) => x.kind)).toContain('csv')
  })
  it('SV-Pill zeigt Anlegen + Basis-Freigaben', () => {
    const a = contextAktionen('sv', 'alle')
    expect(a.map((x) => x.kind)).toContain('anlegen')
    expect(a.map((x) => x.kind)).toContain('freigaben')
  })
  it('Werkstatt-Pill zeigt QR-Pool', () => {
    expect(contextAktionen('werkstatt', 'alle').map((x) => x.kind)).toContain('qrpool')
  })
  it('Partner-Modus blendet Akquise (scrape/csv) aus', () => {
    expect(contextAktionen('makler', 'partner').map((x) => x.kind)).not.toContain('scrape')
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run src/app/admin/vertrieb/_lib/context-aktionen.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
// context-aktionen.ts
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

export type VertriebAktion = {
  key: string
  label: string
  href?: string
  kind: 'scrape' | 'csv' | 'anlegen' | 'freigaben' | 'qrpool'
}

const ROLLE_TO_PL: Record<VertriebRolle, string> = { sv: 'sachverstaendiger', makler: 'makler', werkstatt: 'werkstatt' }
const ANLEGEN_LABEL: Record<VertriebRolle, string> = { sv: 'SV anlegen', makler: 'Makler anlegen', werkstatt: 'Werkstatt anlegen' }

/** Aktions-Set je aktiver Pill (Rolle) × Lead/Partner. P1: href = Deep-Link auf Bestand. */
export function contextAktionen(rolle: VertriebRolle | 'alle', typ: VertriebTyp | 'alle'): VertriebAktion[] {
  const out: VertriebAktion[] = []
  const rolleParam = rolle !== 'alle' ? `?rolle=${ROLLE_TO_PL[rolle]}` : ''

  // Akquise nur im Lead-Modus (nicht im reinen Partner-Modus)
  if (typ !== 'partner') {
    out.push({ key: 'scrape', kind: 'scrape', label: 'Scrapen (Google Places)', href: `/admin/vertrieb/partner-leads?aktion=scrapen${rolleParam ? '&' + rolleParam.slice(1) : ''}` })
    out.push({ key: 'csv', kind: 'csv', label: 'CSV importieren', href: `/admin/vertrieb/partner-leads?aktion=csv${rolleParam ? '&' + rolleParam.slice(1) : ''}` })
  }
  // Anlegen je Rolle
  if (rolle === 'sv') {
    out.push({ key: 'anlegen-sv', kind: 'anlegen', label: ANLEGEN_LABEL.sv, href: '/admin/vertrieb/sachverstaendige/anlegen' })
    out.push({ key: 'freigaben', kind: 'freigaben', label: 'Basis-Freigaben', href: '/admin/vertrieb/sachverstaendige/basic-freigaben' })
  } else if (rolle === 'makler') {
    out.push({ key: 'anlegen-makler', kind: 'anlegen', label: ANLEGEN_LABEL.makler, href: '/admin/vertrieb/makler' })
  } else if (rolle === 'werkstatt') {
    out.push({ key: 'anlegen-werkstatt', kind: 'anlegen', label: ANLEGEN_LABEL.werkstatt, href: '/admin/vertrieb/werkstaetten' })
    out.push({ key: 'qrpool', kind: 'qrpool', label: 'QR-Pool verwalten', href: '/admin/vertrieb/werkstaetten/qr-pool' })
  }
  return out
}
```

- [ ] **Step 4: Run — verify PASS** → `npx vitest run src/app/admin/vertrieb/_lib/context-aktionen.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/vertrieb/_lib/context-aktionen.ts src/app/admin/vertrieb/_lib/context-aktionen.test.ts
git commit -m "feat(vertrieb): kontext-aktionen (reine Fn, Deep-Links P1)"
```

### Task 3: VertriebPillBar (Rollen-Pills + Lead/Partner)

**Files:**
- Create: `src/app/admin/vertrieb/VertriebPillBar.tsx`

**Interfaces:**
- Consumes: `Chip`, `ChipRow` (`@/components/ui/Chip`); `VertriebRolle`, `VertriebTyp`.
- Produces: `VertriebPillBar` mit Props `{ rolle; setRolle; typ; setTyp }` (Werte inkl. `'alle'`).

- [ ] **Step 1: Implement (UI-Komponente — visueller Smoke, kein Unit-Test)**

```tsx
// VertriebPillBar.tsx
'use client'
import { Chip, ChipRow } from '@/components/ui/Chip'
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

const ROLLE_PILLS: { key: VertriebRolle | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'sv', label: 'Sachverständige' },
  { key: 'makler', label: 'Makler' },
  { key: 'werkstatt', label: 'Werkstätten' },
]
const TYP_PILLS: { key: VertriebTyp | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'lead', label: 'Leads' },
  { key: 'partner', label: 'Partner' },
]

export default function VertriebPillBar({
  rolle, setRolle, typ, setTyp,
}: {
  rolle: VertriebRolle | 'alle'
  setRolle: (r: VertriebRolle | 'alle') => void
  typ: VertriebTyp | 'alle'
  setTyp: (t: VertriebTyp | 'alle') => void
}) {
  return (
    <div className="space-y-2">
      <ChipRow>
        {ROLLE_PILLS.map((p) => (
          <Chip key={p.key} variant={rolle === p.key ? 'selected' : 'default'} onClick={() => setRolle(p.key)}>
            {p.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        {TYP_PILLS.map((p) => (
          <Chip key={p.key} variant={typ === p.key ? 'selected' : 'ghost'} onClick={() => setTyp(p.key)}>
            {p.label}
          </Chip>
        ))}
      </ChipRow>
    </div>
  )
}
```

- [ ] **Step 2: tsc**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: keine neuen Fehler in dieser Datei.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/vertrieb/VertriebPillBar.tsx
git commit -m "feat(vertrieb): VertriebPillBar (Rollen-Pills + Lead/Partner, Chip-basiert)"
```

### Task 4: VertriebAktionsleiste

**Files:**
- Create: `src/app/admin/vertrieb/VertriebAktionsleiste.tsx`

**Interfaces:**
- Consumes: `contextAktionen` (Task 2), `Button` (`@/components/primitives`), `useRouter` (`next/navigation`).
- Produces: `VertriebAktionsleiste` mit Props `{ rolle; typ }`.

- [ ] **Step 1: Implement**

```tsx
// VertriebAktionsleiste.tsx
'use client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { contextAktionen } from './_lib/context-aktionen'
import type { VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'

export default function VertriebAktionsleiste({
  rolle, typ,
}: {
  rolle: VertriebRolle | 'alle'
  typ: VertriebTyp | 'alle'
}) {
  const router = useRouter()
  const aktionen = contextAktionen(rolle, typ)
  if (aktionen.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {aktionen.map((a) => (
        <Button
          key={a.key}
          variant={a.kind === 'anlegen' ? 'navy' : 'ghost'}
          size="sm"
          onClick={() => a.href && router.push(a.href)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: tsc** → `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (keine neuen Fehler).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/vertrieb/VertriebAktionsleiste.tsx
git commit -m "feat(vertrieb): VertriebAktionsleiste (kontextuell, Deep-Links)"
```

### Task 5: VertriebRosterClient → Cockpit (Pills + kontext-KPIs + Aktionsleiste)

**Files:**
- Modify: `src/app/admin/vertrieb/VertriebRosterClient.tsx`

**Interfaces:**
- Consumes: `VertriebPillBar` (T3), `VertriebAktionsleiste` (T4), `computeContextKpis` (T1). Behält `filterKontakte`, `collapseByFirma`, `VertriebDetailDrawer`, `VertriebKarteClient`, `Card`, `StatusBadge`, `DataTable`-Set.
- Produces: unverändertes Prop-Interface `{ kontakte, rollup }` (rollup wird für KPIs nicht mehr gebraucht → optional lassen, nicht entfernen).

- [ ] **Step 1: Ersetze den `TYP_SWITCH`/`ROLLE_FILTER`-Button-Block durch `<VertriebPillBar>`**

Entferne die lokalen Consts `TYP_SWITCH`, `ROLLE_FILTER` und die zwei Button-`.map`-Blöcke. Füge oben ein:

```tsx
import VertriebPillBar from './VertriebPillBar'
import VertriebAktionsleiste from './VertriebAktionsleiste'
import { computeContextKpis } from './_lib/context-kpis'
```

Ersetze den KPI-`useMemo` (der aus `rollup` liest) durch:

```tsx
const kpi = useMemo(() => computeContextKpis(kontakte, rolle), [kontakte, rolle])
```

Und das KPI-Grid-Rendering:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {kpi.map(({ label, wert }) => (
    <Card key={label} p={4} radius="lg">
      <p className="text-caption text-claimondo-ondo/70">{label}</p>
      <p className="text-heading-md text-claimondo-navy">{wert}</p>
    </Card>
  ))}
</div>
```

- [ ] **Step 2: Pills + Liste/Karte-Toggle-Zeile + Aktionsleiste einsetzen**

Ersetze die alten Filter-Zeilen durch:

```tsx
<div className="flex flex-wrap items-start justify-between gap-2">
  <VertriebPillBar rolle={rolle} setRolle={setRolle} typ={typ} setTyp={setTyp} />
  <div className="flex gap-2">
    <Button variant={ansicht === 'liste' ? 'navy' : 'ghost'} size="sm" onClick={() => setAnsicht('liste')}>Liste</Button>
    <Button variant={ansicht === 'karte' ? 'navy' : 'ghost'} size="sm" onClick={() => setAnsicht('karte')}>Karte</Button>
  </div>
</div>
<VertriebAktionsleiste rolle={rolle} typ={typ} />
```

Entferne den alten P3b-`neueLeads`-Block + die `ROLLE_TO_PL`-Const (wandern nach `context-aktionen.ts`). Such-Input + Stufe-Select + Count-Zeile + Liste/Karte + `VertriebDetailDrawer` bleiben unverändert.

- [ ] **Step 3: Build (Route betroffen → voller Build)**

Run: `npm run build`
Expected: grün; `/admin/vertrieb` kompiliert.

- [ ] **Step 4: Ratchets**

Run: `npm run check:component-set -- --ratchet && npm run check:token-audit && npm run check:status-registry -- --ratchet`
Expected: keine NEUEN Verstöße (Pills = Chip, keine raw Status-Farben).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/vertrieb/VertriebRosterClient.tsx
git commit -m "feat(vertrieb): Roster -> Cockpit (Pills + kontext-KPIs + Aktionsleiste)"
```

### Task 6: Tab-Nav entfernen (layout.tsx)

**Files:**
- Modify: `src/app/admin/vertrieb/layout.tsx`

- [ ] **Step 1: `VertriebKonsoleTabs` aus dem Layout entfernen** (Import + `<VertriebKonsoleTabs />` löschen). Titel + Subtitle bleiben. Die Datei `VertriebKonsoleTabs.tsx` NOCH NICHT löschen (erst P5, falls kein anderer Consumer — `grep -rn "VertriebKonsoleTabs" src/` prüfen).

Ergebnis-`layout.tsx`:

```tsx
export default function VertriebKonsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6 pt-4 pb-3">
        <h1 className="text-heading-md text-claimondo-navy">Vertrieb</h1>
        <p className="text-caption text-claimondo-ondo/70">
          Partner &amp; Leads — Akquise, Bestand und Karte in einer Übersicht.
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Build** → `npm run build` (grün; Sub-Routen `sachverstaendige`/`makler`/… rendern jetzt ohne Tab-Leiste, aber weiter erreichbar per Deep-Link).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/vertrieb/layout.tsx
git commit -m "feat(vertrieb): Tab-Nav raus — Cockpit ist die eine Uebersicht"
```

**✅ Phase-1-Deliverable:** `/admin/vertrieb` ist EIN Cockpit (Pills + kontext-KPIs + Aktions-Leiste), alle Alt-Funktionen per Deep-Link erreichbar, kein Datenverlust. Post-Task-Audit im letzten Commit-Body dokumentieren.

---

## Phase 2 — Drawer = CRM-Cockpit (bestehende Partner-Leads-CRM surfacen)

Ziel: `VertriebDetailDrawer` wird zum CRM-Cockpit. Für Leads: Ansprechpartner + Stufe + Einstufung + Aktivitäts-Log (inkl. Anruf) + Convert — via **bestehende** Actions. Für Partner: Profil + Notizen. Kleine DDL: Ansprechpartner-Zusatzfelder.

### Task 7: DDL — Ansprechpartner-Zusatzfelder auf `partner_leads`

**Files:**
- Migration via Plugin, dann committen: `supabase/migrations/<V>_partner_leads_ansprechpartner_kontakt.sql`

**Interfaces:**
- Produces: Spalten `partner_leads.ansprechpartner_position text`, `ansprechpartner_email text`, `ansprechpartner_telefon text` (alle nullable). `ansprechpartner_vorname`/`_nachname` existieren bereits.

- [ ] **Step 1: Ist-Schema verifizieren (READ)**

`mcp__claude_ai_Supabase__execute_sql` (READ):
```sql
select column_name from information_schema.columns
where table_name='partner_leads' and column_name like 'ansprechpartner%';
```
Erwartet: `ansprechpartner_vorname`, `ansprechpartner_nachname` (nur die zwei).

- [ ] **Step 2: Migration anwenden (Plugin)**

`mcp__plugin_supabase_supabase__apply_migration`:
- name: `partner_leads_ansprechpartner_kontakt`
- query:
```sql
alter table public.partner_leads
  add column if not exists ansprechpartner_position text,
  add column if not exists ansprechpartner_email text,
  add column if not exists ansprechpartner_telefon text;
```

- [ ] **Step 3: Recorded Version ablesen** → `mcp__plugin_supabase_supabase__list_migrations` → `<V>` notieren.

- [ ] **Step 4: File committen (Name == recorded `<V>`)**

```bash
# Datei supabase/migrations/<V>_partner_leads_ansprechpartner_kontakt.sql mit obigem DDL anlegen
git add supabase/migrations/<V>_partner_leads_ansprechpartner_kontakt.sql
git commit -m "feat(vertrieb): DDL partner_leads ansprechpartner_position/email/telefon"
```

- [ ] **Step 5: Verify (READ)** → gleiche Query wie Step 1, jetzt 5 Spalten.

### Task 8: `updatePartnerLead` um Ansprechpartner-Kontakt erweitern

**Files:**
- Modify: `src/app/admin/partner-leads/actions.ts` (Funktion `updatePartnerLead`, Typ `UpdatePartnerLeadInput`)
- Test: `src/app/admin/partner-leads/actions.ansprechpartner.test.ts`

**Interfaces:**
- Produces: `UpdatePartnerLeadInput` zusätzlich `ansprechpartner_position?`, `ansprechpartner_email?`, `ansprechpartner_telefon?` (string|null). Mapping analog `ansprechpartner_nachname`.

- [ ] **Step 1: Failing test** (mappt neue Felder in `updates`)

```typescript
// actions.ansprechpartner.test.ts — testet die reine Patch-Mapping-Logik
import { describe, it, expect } from 'vitest'
import { baueUpdate } from './actions' // ggf. Mapping in reine baueUpdate(patch) extrahieren

describe('baueUpdate — Ansprechpartner-Kontakt', () => {
  it('mappt position/email/telefon (trim, leer→null)', () => {
    const u = baueUpdate({ ansprechpartner_position: ' Inhaber ', ansprechpartner_email: '', ansprechpartner_telefon: '0221 1' })
    expect(u.ansprechpartner_position).toBe('Inhaber')
    expect(u.ansprechpartner_email).toBeNull()
    expect(u.ansprechpartner_telefon).toBe('0221 1')
  })
})
```

- [ ] **Step 2: Run — FAIL** (`baueUpdate` existiert noch nicht / Felder fehlen).

- [ ] **Step 3: Implement** — Extrahiere die vorhandene Patch→`updates`-Logik in eine reine, exportierbare Fn `baueUpdate(patch: UpdatePartnerLeadInput): Record<string, unknown>` (Hinweis: KEINE Konstanten aus `'use server'`-File exportieren → falls `actions.ts` `'use server'` ist, lege `baueUpdate` in `src/app/admin/partner-leads/_lib/baue-update.ts` und importiere sie in beide). Ergänze die 3 Felder:

```typescript
// _lib/baue-update.ts
import type { UpdatePartnerLeadInput } from '../actions' // nur Type-Import
export function baueUpdate(patch: UpdatePartnerLeadInput): Record<string, unknown> {
  const u: Record<string, unknown> = {}
  // … bestehende Felder (status, zugewiesen_an, notiz, einstufung, email, telefon, vorname, nachname) …
  if (patch.ansprechpartner_position !== undefined) u.ansprechpartner_position = (patch.ansprechpartner_position ?? '').trim() || null
  if (patch.ansprechpartner_email !== undefined) u.ansprechpartner_email = (patch.ansprechpartner_email ?? '').trim() || null
  if (patch.ansprechpartner_telefon !== undefined) u.ansprechpartner_telefon = (patch.ansprechpartner_telefon ?? '').trim() || null
  return u
}
```
Erweitere `UpdatePartnerLeadInput` um die 3 optionalen Felder und nutze `baueUpdate` in `updatePartnerLead`.

- [ ] **Step 4: Run — PASS** → `npx vitest run src/app/admin/partner-leads/actions.ansprechpartner.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/partner-leads/_lib/baue-update.ts src/app/admin/partner-leads/actions.ts src/app/admin/partner-leads/actions.ansprechpartner.test.ts
git commit -m "feat(vertrieb): updatePartnerLead + Ansprechpartner-Kontaktfelder"
```

### Task 9: Lead-Detail-Loader (Ansprechpartner + Aktivitäten)

**Files:**
- Create: `src/app/admin/vertrieb/_lib/get-vertrieb-lead-detail.ts`
- Test: `src/app/admin/vertrieb/_lib/get-vertrieb-lead-detail.test.ts` (Mapping-Teil rein)

**Interfaces:**
- Consumes: Admin-Client (`@/lib/supabase/admin`), Staff-Guard (wie `get-vertrieb-daten.ts` → `requireRole(['admin','dispatch'])`).
- Produces:
```typescript
type LeadAktivitaet = { id: string; typ: string; text: string; erstellt_von_name: string | null; erstellt_am: string }
type VertriebLeadDetail = {
  id: string; einstufung: string | null; status: string; notiz: string | null
  ansprechpartner: { vorname: string | null; nachname: string | null; position: string | null; email: string | null; telefon: string | null }
  aktivitaeten: LeadAktivitaet[]
}
async function getVertriebLeadDetail(leadId: string): Promise<{ ok: true; data: VertriebLeadDetail } | { ok: false; error: string }>
```

- [ ] **Step 1: Failing test** (reine Mapping-Fn `mapLeadDetail(row, akt)` extrahieren + testen — inkl. `Array.isArray`-Normalisierung des Nested-FK `erstellt_von`)

```typescript
import { describe, it, expect } from 'vitest'
import { mapLeadDetail } from './get-vertrieb-lead-detail'
describe('mapLeadDetail', () => {
  it('normalisiert nested erstellt_von (Array→erste) auf Name', () => {
    const d = mapLeadDetail(
      { id: 'l1', einstufung: 'warm', status: 'kontaktiert', notiz: null,
        ansprechpartner_vorname: 'Tom', ansprechpartner_nachname: 'Müller',
        ansprechpartner_position: 'Inhaber', ansprechpartner_email: null, ansprechpartner_telefon: null },
      [{ id: 'a1', typ: 'anruf', text: 'nicht erreicht', erstellt_am: '2026-07-10',
         erstellt_von: [{ vorname: 'Ann', nachname: 'A' }] }],
    )
    expect(d.ansprechpartner.position).toBe('Inhaber')
    expect(d.aktivitaeten[0].erstellt_von_name).toBe('Ann A')
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — Guard + zwei Reads (`partner_leads` by id; `partner_lead_aktivitaeten` by `lead_id` order `created_at desc` mit FK-Join auf Ersteller-Profil) + reine `mapLeadDetail`. Nested-FK mit `Array.isArray(x) ? x[0] : x` normalisieren.

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/vertrieb/_lib/get-vertrieb-lead-detail.ts src/app/admin/vertrieb/_lib/get-vertrieb-lead-detail.test.ts
git commit -m "feat(vertrieb): Lead-Detail-Loader (Ansprechpartner + Aktivitaeten)"
```

### Task 10: AktivitaetLog-Komponente (Feed + Anruf/Notiz)

**Files:**
- Create: `src/app/admin/vertrieb/drawer/AktivitaetLog.tsx`

**Interfaces:**
- Consumes: `protokolliereAktivitaet(leadId, typ, text)` (`@/app/admin/partner-leads/actions`), `Button`, `StatusBadge`-nicht nötig.
- Produces: `AktivitaetLog` Props `{ leadId; aktivitaeten: LeadAktivitaet[]; onChanged: () => void }`. Formular mit Typ-Auswahl (`anruf|notiz|email|sonstiges`) + Textarea → ruft `protokolliereAktivitaet` → `onChanged()`.

- [ ] **Step 1: Implement** — Feed-Liste (Icon je `typ`: 📞 anruf, ✉️ email, 📝 notiz) + kompaktes „Anruf protokollieren"/„Notiz"-Formular. Ergebnis + Wiedervorlage können als Freitext in `text` (MVP; strukturierte Felder = spätere Iteration, YAGNI). Result-Check auf `protokolliereAktivitaet`.

- [ ] **Step 2: tsc + Ratchets** → `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`; `npm run check:component-set -- --ratchet`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/vertrieb/drawer/AktivitaetLog.tsx
git commit -m "feat(vertrieb): AktivitaetLog (Feed + Anruf/Notiz protokollieren, reuse action)"
```

### Task 11: LeadCockpit + PartnerCockpit

**Files:**
- Create: `src/app/admin/vertrieb/drawer/LeadCockpit.tsx`, `src/app/admin/vertrieb/drawer/PartnerCockpit.tsx`

**Interfaces:**
- LeadCockpit Props `{ kontakt: VertriebKontakt; detail: VertriebLeadDetail; onChanged: () => void }` — zeigt Ansprechpartner, `<StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} />` + Stufe-ändern (`updatePartnerLead({status})`), Einstufung (`updatePartnerLead({einstufung})`), `AktivitaetLog`, Convert-Button (`konvertierePartnerLead(id)`), Notiz (`updatePartnerLead({notiz})`). Mail-Buttons kommen in P3.
- PartnerCockpit Props `{ kontakt: VertriebKontakt; onChanged: () => void }` — Profil-Felder + Notiz (`updateVertriebFeld(kind,id,'notizen',...)`). Login-Mail/QR kommen in P5.

- [ ] **Step 1: Implement LeadCockpit** — alle Mutationen über bestehende Actions, Result-Check + `onChanged()`.
- [ ] **Step 2: Implement PartnerCockpit.**
- [ ] **Step 3: tsc + Ratchets.**
- [ ] **Step 4: Commit**

```bash
git add src/app/admin/vertrieb/drawer/LeadCockpit.tsx src/app/admin/vertrieb/drawer/PartnerCockpit.tsx
git commit -m "feat(vertrieb): LeadCockpit + PartnerCockpit (reuse partner-leads actions)"
```

### Task 12: VertriebDetailDrawer → CRM-Cockpit-Switch

**Files:**
- Modify: `src/app/admin/vertrieb/VertriebDetailDrawer.tsx`

**Interfaces:**
- Consumes: `getVertriebLeadDetail` (T9), `LeadCockpit`/`PartnerCockpit` (T11). Behält `onClose`-Prop + `kontakt`-Prop.

- [ ] **Step 1:** Bei `kontakt.typ === 'lead'` (bzw. `kind === 'partner-lead'`): `getVertriebLeadDetail(kontakt.id)` laden (useEffect + loading state) → `<LeadCockpit>`. Sonst `<PartnerCockpit>`. `onChanged` = Reload des Detail + `router.refresh()` (revalidiert Roster).
- [ ] **Step 2: Build** (`npm run build`) — Drawer in Route eingebunden.
- [ ] **Step 3: Regression** — `grep -rn "VertriebDetailDrawer" src/` (nur Roster-Consumer). Alte Read-only-Felder-Anzeige nicht verloren.
- [ ] **Step 4: Commit**

```bash
git add src/app/admin/vertrieb/VertriebDetailDrawer.tsx
git commit -m "feat(vertrieb): DetailDrawer -> CRM-Cockpit (Lead/Partner-Switch)"
```

**✅ Phase-2-Deliverable:** Klick auf einen Lead öffnet das CRM-Cockpit (Ansprechpartner, Stufe, Einstufung, Anruf-Log, Convert) — alles DB-driven über bestehende Actions. Post-Task-Audit dokumentieren.

---

## Phase 3 — E-Mail-Vorlagen (vollständig DB-driven)

Ziel: Zwei editierbare Master-Vorlagen in der DB (Vorstellungs-Mail, Terminbestätigung), ein Composer im Lead-Cockpit (Vorlage laden → Merge → vor Send editieren → senden), Versand-Kopie im Aktivitäts-Log. **⚠ Terminbestätigung** hängt am Vor-Ort-Termin der Lane e8aa73d4 — Merge-Feld `{{Termin}}` erst final verdrahten, wenn deren Termin-Datenmodell steht; bis dahin `{{Termin}}` aus manueller Eingabe im Composer.

### Task 13: DDL — `vertrieb_mail_vorlagen` (+ Seed)

**Files:** Migration via Plugin → `supabase/migrations/<V>_vertrieb_mail_vorlagen.sql`

**Interfaces:** Produces Tabelle `vertrieb_mail_vorlagen(id uuid pk, typ text unique check in ('vorstellung','terminbestaetigung'), betreff text not null, body text not null, aktiv boolean not null default true, aktualisiert_am timestamptz not null default now())`.

- [ ] **Step 1: Prüfen ob Tabelle existiert (READ)** — `execute_sql`: `select to_regclass('public.vertrieb_mail_vorlagen');` → erwartet `null`.
- [ ] **Step 2: apply_migration** (`mcp__plugin_supabase_supabase__apply_migration`), name `vertrieb_mail_vorlagen`:
```sql
create table if not exists public.vertrieb_mail_vorlagen (
  id uuid primary key default gen_random_uuid(),
  typ text not null unique check (typ in ('vorstellung','terminbestaetigung')),
  betreff text not null,
  body text not null,
  aktiv boolean not null default true,
  aktualisiert_am timestamptz not null default now()
);
alter table public.vertrieb_mail_vorlagen enable row level security;
-- Nur Staff (admin/dispatch) liest/schreibt; Zugriff läuft über service-role Actions.
create policy vertrieb_mail_vorlagen_staff on public.vertrieb_mail_vorlagen
  for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch'))
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.rolle in ('admin','dispatch'))
  );
insert into public.vertrieb_mail_vorlagen (typ, betreff, body) values
  ('vorstellung', 'Zusammenarbeit mit Claimondo — kurze Vorstellung',
   E'Guten Tag {{Ansprechpartner}},\n\nmein Name ist … von Claimondo. Wir vermitteln Kfz-Schadenfälle an qualifizierte Partner in Ihrer Region und würden {{Firma}} gern vorstellen.\n\nHätten Sie kurz Zeit für ein Gespräch?\n\nBeste Grüße'),
  ('terminbestaetigung', 'Terminbestätigung — Ihr Vor-Ort-Termin',
   E'Guten Tag {{Ansprechpartner}},\n\nvielen Dank für das Gespräch. Hiermit bestätigen wir Ihren Vor-Ort-Termin am {{Termin}}.\n\nBeste Grüße')
on conflict (typ) do nothing;
```
- [ ] **Step 3: list_migrations → `<V>` ablesen.**
- [ ] **Step 4: File `supabase/migrations/<V>_vertrieb_mail_vorlagen.sql` mit obigem DDL committen** (Name == `<V>`).
- [ ] **Step 5: Verify (READ)** — `select typ, betreff from public.vertrieb_mail_vorlagen;` → 2 Zeilen.
- [ ] **Step 6: Types** — `mcp__plugin_supabase_supabase__generate_typescript_types` → `src/lib/supabase/database.types.ts` aktualisieren + committen (Consumer folgt in T14).

### Task 14: `mail-vorlagen.ts` — Loader + Merge-Render (rein)

**Files:** Create `src/lib/vertrieb/mail-vorlagen.ts` + `src/lib/vertrieb/mail-vorlagen.test.ts`

**Interfaces:**
- Produces: `renderVorlage(body: string, merge: Record<string,string>): string` (rein), `getVertriebMailVorlage(typ: 'vorstellung'|'terminbestaetigung'): Promise<{ ok: true; data: { betreff: string; body: string } } | { ok: false; error: string }>`.

- [ ] **Step 1: Failing test** (renderVorlage ersetzt `{{Feld}}`, unbekannte bleiben stehen)
```typescript
import { describe, it, expect } from 'vitest'
import { renderVorlage } from './mail-vorlagen'
describe('renderVorlage', () => {
  it('ersetzt bekannte Merge-Felder, lässt unbekannte stehen', () => {
    expect(renderVorlage('Hallo {{Ansprechpartner}}, {{Firma}} — {{Termin}}', { Ansprechpartner: 'Tom', Firma: 'AH Müller' }))
      .toBe('Hallo Tom, AH Müller — {{Termin}}')
  })
})
```
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — `renderVorlage` (regex `\{\{(\w+)\}\}` → merge[k] ?? match); `getVertriebMailVorlage` liest `vertrieb_mail_vorlagen` where `typ` + `aktiv` (Admin-Client, Staff-Guard).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(vertrieb): mail-vorlagen Loader + renderVorlage`.

### Task 15: `sendeVertriebMail`-Action (+ Activity-Log)

**Files:** Create `src/app/admin/vertrieb/_actions/sende-vertrieb-mail.ts` + Test.

**Interfaces:**
- Consumes: `sendEmail` (`@/lib/email/google/client`), `protokolliereAktivitaet` (`@/app/admin/partner-leads/actions`).
- Produces: `sendeVertriebMail(input: { leadId: string; to: string; betreff: string; body: string }): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Failing test** — mit gemocktem `sendEmail`: prüft, dass `sendEmail({ to, subject, html })` gerufen wird und bei Erfolg `protokolliereAktivitaet(leadId,'email', …)` läuft, Result `{ ok: true }`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement:**
```typescript
'use server'
import { sendEmail } from '@/lib/email/google/client'
import { protokolliereAktivitaet } from '@/app/admin/partner-leads/actions'
import { revalidatePath } from 'next/cache'

export async function sendeVertriebMail(input: { leadId: string; to: string; betreff: string; body: string }): Promise<{ ok: boolean; error?: string }> {
  if (!input.to.trim()) return { ok: false, error: 'Keine Empfänger-Adresse.' }
  const html = input.body.split('\n').map((z) => z || '<br>').join('<br>') // schlichtes Text→HTML; react-email-Wrapper optional
  try {
    await sendEmail({ to: input.to.trim(), subject: input.betreff, html, empfaengerTyp: 'makler' })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'E-Mail-Versand fehlgeschlagen.' }
  }
  // Non-critical: Log-Fehler bricht den Versand nicht.
  try { await protokolliereAktivitaet(input.leadId, 'email', `Mail gesendet: ${input.betreff}`) } catch (err) { console.error('[vertrieb-mail] log', err) }
  revalidatePath('/admin/vertrieb')
  return { ok: true }
}
```
(`nurExterneEmpfaenger` greift bereits innerhalb von `sendEmail` — interne Test-Adressen werden im Live-Mode gefiltert; hier KEIN `allowInternalRecipient`.)
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(vertrieb): sendeVertriebMail + Activity-Log`.

### Task 16: MailComposer (im Lead-Cockpit)

**Files:** Create `src/app/admin/vertrieb/drawer/MailComposer.tsx`; Modify `LeadCockpit.tsx` (Buttons „Vorstellungs-Mail" / „Terminbestätigung").

**Interfaces:** `MailComposer` Props `{ leadId; empfaenger: string; merge: Record<string,string>; onClose: () => void; onSent: () => void }`. Lädt beide Vorlagen (`getVertriebMailVorlage`), Tab-Switcher, `renderVorlage(body, merge)` in editierbare `textarea` + editierbarer Betreff → `sendeVertriebMail`.

- [ ] **Step 1: Implement** — Composer als `Modal`/`Drawer` (primitives). Betreff-`Input` + Body-`textarea` (vorbefüllt aus gerenderter Vorlage), Vorlage-Umschalter lädt neue Vorlage. „Senden" → `sendeVertriebMail` → Result-Check → `onSent()`. Merge-Objekt aus Lead: `{ Ansprechpartner: '<Vorname Nachname>', Firma: kontakt.name, Termin: '<manuell/aus e8aa73d4>' }`.
- [ ] **Step 2:** In `LeadCockpit` zwei Buttons, die den Composer mit passender Start-Vorlage öffnen; `empfaenger` = `detail.ansprechpartner.email ?? kontakt.email`.
- [ ] **Step 3: tsc + Ratchets + Build.**
- [ ] **Step 4: Commit** `feat(vertrieb): MailComposer (DB-Vorlage, editierbar vor Send)`.

### Task 17: Vorlagen-Verwaltung (Master editierbar)

**Files:** Create `src/app/admin/vertrieb/_actions/mail-vorlagen.ts` (`updateMailVorlage(typ, { betreff, body, aktiv })`), `src/app/admin/vertrieb/vorlagen/page.tsx` (RSC-Loader) + `MailVorlagenClient.tsx` (Form je Vorlage).

- [ ] **Step 1:** `updateMailVorlage`-Action (Result-Object, `aktualisiert_am = now()`, `revalidatePath('/admin/vertrieb/vorlagen')`).
- [ ] **Step 2:** RSC lädt beide Vorlagen, Client rendert je ein Betreff-`Input` + Body-`textarea` + „Speichern".
- [ ] **Step 3:** Einstieg: in `VertriebAktionsleiste` (oder Cockpit-Header) einen kleinen „Vorlagen"-Link ergänzen (UI-Erreichbarkeit).
- [ ] **Step 4: Build + Ratchets.**
- [ ] **Step 5: Commit** `feat(vertrieb): Mail-Vorlagen-Verwaltung (DB-driven, ohne Deploy aenderbar)`.

**✅ Phase-3-Deliverable:** Zwei DB-Vorlagen, editierbar in der Verwaltung UND vor dem Senden im Composer; Versand geloggt. Post-Task-Audit dokumentieren.

---

## Phase 4 — Scraper: Cross-Table-Dedup (Leads + Bestands-Partner)

Ziel: Der **einzige echte Backend-Gap**. Aktuell prüft `ladeBestandsLeads(rolle)` (`src/app/admin/partner-leads/actions.ts:511`) nur `partner_leads`. Erweiterung: auch Bestands-Partner der Rolle. Die puren `istDublette`/`filterGegenBestand` (getestet) bleiben unverändert.

### Task 18: `ladeBestandsPartner(rolle)`

**Files:** Create `src/lib/partner/bestands-partner.ts` + Test.

**Interfaces:**
- Consumes: Admin-Client; `BestandsLead` (`@/lib/partner/scraping`).
- Produces: `ladeBestandsPartner(rolle: string): Promise<BestandsLead[]>` — mappt die Rollen-Tabelle (`sachverstaendiger`→`sachverstaendige`, `werkstatt`→`werkstaetten`, `makler`→`makler`) auf `{ google_place_id, firma, telefon, plz }`.

- [ ] **Step 1: Ist-Spalten je Partner-Tabelle verifizieren (READ)** — `execute_sql`:
```sql
select table_name, column_name from information_schema.columns
where table_name in ('sachverstaendige','makler','werkstaetten')
  and column_name in ('firma','firma_name','name','telefon','plz','google_place_id');
```
Ergebnis bestimmt das exakte Feld-Mapping (nicht raten — AGENTS.md §6). `werkstaetten.google_place_id` existiert (bestätigt); für sv/makler `google_place_id` ggf. `null` → dann greift Fallback Name+PLZ/Telefon.
- [ ] **Step 2: Failing test** — reine Mapping-Fn `mapPartnerRow(rolle, row)` → `BestandsLead` (mit den in Step 1 bestätigten Spalten).
- [ ] **Step 3: FAIL.**
- [ ] **Step 4: Implement** — `TABELLE: Record<string,{ table: string; firmaCol: string; telCol: string; plzCol: string; placeIdCol: string | null }>` (aus Step 1), Read je Rolle, map. `google_place_id: placeIdCol ? row[placeIdCol] : null`.
- [ ] **Step 5: PASS.**
- [ ] **Step 6: Commit** `feat(vertrieb): ladeBestandsPartner fuer Cross-Table-Dedup`.

### Task 19: Dedup gegen Leads UND Partner verdrahten

**Files:** Modify `src/app/admin/partner-leads/actions.ts` (`scrapePartnerLeadsVorschau`, `importScrapedLeads`).

- [ ] **Step 1:** Erweitere die Bestand-Ladung an beiden Stellen:
```typescript
import { ladeBestandsPartner } from '@/lib/partner/bestands-partner'
// … in scrapePartnerLeadsVorschau UND importScrapedLeads:
const [leads, partner] = await Promise.all([ladeBestandsLeads(r), ladeBestandsPartner(r)])
const bestehende = [...leads, ...partner]
const { neu, dubletten } = filterGegenBestand(scrape.kandidaten, bestehende)
```
- [ ] **Step 2: Build** (Server-Action geändert → voller Build).
- [ ] **Step 3: Commit** `feat(vertrieb): Scrape-Dedup gegen Leads + Bestands-Partner (Aaron: keine Dupes)`.

### Task 20: Regressions-/Integrationstest Cross-Table-Dedup

**Files:** Create `src/lib/partner/bestands-partner.integration.test.ts` (rein, ohne DB — testet `filterGegenBestand` mit gemischtem Bestand).

- [ ] **Step 1: Test** — Kandidat mit place_id eines Bestands-**Partners** (nicht Lead) wird als Dublette erkannt:
```typescript
import { filterGegenBestand } from '@/lib/partner/scraping'
it('erkennt Bestands-Partner als Dublette (nicht nur Leads)', () => {
  const partner = [{ google_place_id: 'P1', firma: 'X', telefon: null, plz: '50667' }]
  const { neu, dubletten } = filterGegenBestand(
    [{ google_place_id: 'P1', firma: 'X GmbH', telefon: null, plz: '50667', website: null, strasse: null, ort: null, formatted_address: '' }],
    partner,
  )
  expect(neu).toHaveLength(0); expect(dubletten).toHaveLength(1)
})
```
- [ ] **Step 2: PASS + Commit** `test(vertrieb): Cross-Table-Dedup-Regression`.

**✅ Phase-4-Deliverable:** Scrapen legt keine Dubletten bestehender Leads ODER Partner an. Bericht (neu/übersprungen) unverändert. Post-Task-Audit dokumentieren.

---

## Phase 5 — Schwere Flows als Overlay + Redirects + Login-Mail

Ziel: Alt-Funktionen final ins Cockpit heben, Alt-Listen-Routen redirecten, Dead-Code entfernen, `resendWerkstattWelcome`.

### Task 21: `resendWerkstattWelcome` (analog Makler)

**Files:** Modify/Create `src/app/admin/werkstaetten/actions.ts` (+ `sendWerkstattWelcome` in `src/lib/email/google/flows.ts` falls noch nicht vorhanden — prüfen; sonst analog `sendMaklerWelcome`).

**Interfaces:** `resendWerkstattWelcome(werkstattId: string): Promise<{ ok: true } | { ok: false; error: string }>` mit `allowInternalRecipient: true` (nur Admin-Resend).

- [ ] **Step 1:** `grep -rn "sendWerkstattWelcome\|WerkstattWelcome" src/` — existiert ein Welcome-Flow/Template? Falls ja: wiederverwenden. Falls nein: `WerkstattWelcome.tsx`-Template + `sendWerkstattWelcome`-Flow analog `MaklerWelcome`/`sendMaklerWelcome` (`src/lib/email/google/flows.ts:890`).
- [ ] **Step 2: Failing test** (Action ruft Send mit `allowInternalRecipient:true`, Result-Object).
- [ ] **Step 3: Implement** analog `resendMaklerWelcome` (`src/app/admin/makler/actions.ts:96`).
- [ ] **Step 4: PASS + Build.**
- [ ] **Step 5: Commit** `feat(vertrieb): resendWerkstattWelcome (analog Makler, Admin-Resend)`.

### Task 22: PartnerCockpit — Login-Mail (Makler+Werkstatt) + QR (Werkstatt)

**Files:** Modify `src/app/admin/vertrieb/drawer/PartnerCockpit.tsx`.

- [ ] **Step 1:** Bei `kontakt.rolle === 'makler'`: Button „Login-Mail neu senden" → `resendMaklerWelcome(kontakt.id)`. Bei `'werkstatt'`: „Login-Mail neu senden" → `resendWerkstattWelcome(kontakt.id)` + „QR-Codes" → Deep-Link/Overlay `/admin/vertrieb/werkstaetten/qr-pool`. Result-Check + Toast.
- [ ] **Step 2: tsc + Build + Commit** `feat(vertrieb): PartnerCockpit Login-Mail (Makler+Werkstatt) + QR`.

### Task 23: OverlayFlows — Anlegen-Wizards + QR-Pool als Drawer

**Files:** Create `src/app/admin/vertrieb/drawer/OverlayFlows.tsx`; Modify `VertriebAktionsleiste.tsx` (Aktion `kind='anlegen'|'qrpool'` → Overlay statt Deep-Link).

**Interfaces:** `OverlayFlows` rendert die **Client-Komponente** der jeweiligen Rolle in einem `primitives.Drawer`:
- `sv` → `AnlegenTabs` (`src/app/admin/sachverstaendige/anlegen/AnlegenTabs.tsx`)
- `werkstatt` → `WerkstaettenClient` bzw. QR: `QrPoolClient` (`src/app/admin/werkstaetten/qr-pool/QrPoolClient.tsx`)
- `makler` → `MaklerAdminClient` (`src/app/admin/makler/MaklerAdminClient.tsx`)

- [ ] **Step 1:** `OverlayFlows`-Wrapper (Drawer + lazy `dynamic()`-Import der Ziel-Client-Komponente). **Hinweis:** Nur Client-Komponenten sind einbettbar. **`basic-freigaben` (RSC)** bleibt Deep-Link aus der Aktionsleiste (kein RSC-in-Drawer) — dokumentierte, bewusste Abweichung von „alles als Overlay".
- [ ] **Step 2:** `VertriebAktionsleiste`: für `anlegen`/`qrpool` → `setOverlay({rolle,kind})` statt `router.push`; `scrape`/`csv`/`freigaben` bleiben Deep-Link (bzw. scrape/csv nutzen den bestehenden partner-leads-Prefill).
- [ ] **Step 3: Build + Ratchets + Regression** (`grep -rn` auf die eingebetteten Komponenten — kein Doppel-Mount-Konflikt).
- [ ] **Step 4: Commit** `feat(vertrieb): Anlegen/QR-Pool als Drawer-Overlay (Client-Flows)`.

### Task 24: Alt-Routen redirecten + Dead-Code entfernen

**Files:** Modify `next.config.ts`; Delete `src/app/admin/vertrieb/{makler,partner-leads,sachverstaendige,werkstaetten}/page.tsx` (Re-Export-Stubs) + `src/app/admin/vertrieb/VertriebKonsoleTabs.tsx`.

- [ ] **Step 1:** In `next.config.ts` `redirects()` ergänzen (nur die **Index**-Routen, Sub-Routen bleiben live):
```typescript
{ source: '/admin/makler', destination: '/admin/vertrieb', permanent: true },
{ source: '/admin/werkstaetten', destination: '/admin/vertrieb', permanent: true },
{ source: '/admin/sachverstaendige', destination: '/admin/vertrieb', permanent: true },
{ source: '/admin/partner-leads', destination: '/admin/vertrieb', permanent: true },
```
**Exakt-Match ohne `:path*`** → `/admin/sachverstaendige/[id]`, `/anlegen`, `/basic-freigaben`, `/werkstaetten/qr-pool` bleiben erreichbar (Redirect-Stub-Gate beachtet).
- [ ] **Step 2:** Löschen: die 4 `vertrieb/*/page.tsx`-Re-Export-Stubs + `VertriebKonsoleTabs.tsx`. **Achtung:** Die Alt-Seiten `src/app/admin/makler/page.tsx` etc. werden durch den Config-Redirect NIE mehr gerendert → sie können bleiben (Guard-Redirect harmlos) ODER separat aufgeräumt werden (nur wenn kein anderer Consumer). Konservativ: nur die `vertrieb/*`-Stubs + Tabs löschen.
- [ ] **Step 3:** `grep -rn "VertriebKonsoleTabs\|/admin/vertrieb/makler\|/admin/vertrieb/partner-leads" src/` — keine toten Referenzen. `npm run check:knip -- --ratchet` (Baseline ggf. senken: `-- --update-baseline`). `npm run check:redirect-stubs -- --ratchet`.
- [ ] **Step 4: Build** (anon-curl-Smoke: `/admin/makler` → 308 auf `/admin/vertrieb`).
- [ ] **Step 5: Commit** `feat(vertrieb): Alt-Listen-Routen -> /admin/vertrieb redirect + Tabs/Stubs entfernt`.

### Task 25: Prod-Smoke + Abschluss

- [ ] **Step 1: Voller Build** `npm run build` grün.
- [ ] **Step 2: Alle neuen Tests** `npx vitest run src/app/admin/vertrieb src/lib/vertrieb src/lib/partner/bestands-partner.test.ts src/lib/partner/bestands-partner.integration.test.ts`.
- [ ] **Step 3: Alle Ratchets** `npm run check:component-set -- --ratchet && npm run check:token-audit && npm run check:status-registry -- --ratchet && npm run check:knip -- --ratchet && npm run check:redirect-stubs -- --ratchet`.
- [ ] **Step 4: Prod-/Preview-Smoke** (nach Deploy des PR-Preview): Login als Admin → `/admin/vertrieb` → Pill-Wechsel filtert + KPIs scopen; Lead-Klick öffnet CRM-Cockpit; Anruf protokollieren erscheint im Log; Vorstellungs-Mail-Composer editierbar + sendet (Test-Empfänger mit `@claimondo.de` wird im Live-Mode gefiltert → für echten Send externe Test-Adresse); Scrapen zeigt „N neu / M Dupes" inkl. Bestands-Partner; `/admin/makler` → 308.
- [ ] **Step 5: Marker + MEMORY.md aktualisieren** (`COORDINATION-vertrieb-crm-konsolidierung.md` auf „gebaut/PR offen" setzen). Session-Abschluss-Checkliste (Regel 3): `git status` clean, kein Stash, alle Commits gepusht.

**✅ Phase-5-Deliverable:** Vollständig konsolidiertes Cockpit, Alt-Routen redirecten, Login-Mail für Makler+Werkstatt, keine Dubletten. PR gegen den geklärten Target-Branch.

---

## Self-Review (gegen die Spec)

**1. Spec-Coverage:**
- §3 D1 Pills (Rolle + Lead/Partner) → T3/T5 ✓ · D2 Drawer-Overlay → T12/T23 ✓ · D3 Cockpit → T5 ✓ · D4 (Freigaben-Badge/QR-Overlay/Redirect) → T2/T23/T24 ✓ · D5 DB-driven → T13–T17 (Vorlagen), KPIs aus DB-Daten (T1), keine Mock-Werte ✓
- §7 Drawer (Ansprechpartner/Anruf/Einstufung/Convert/Login-Mail/QR) → T9–T12, T21/T22 ✓
- §8 Mail-Vorlagen editierbar → T13–T17 ✓ · §9 Ansprechpartner → T7/T8 (Felder existierten teils schon) ✓ · §10 Anruf-Log → T10 (reuse `partner_lead_aktivitaeten`/`protokolliereAktivitaet`) ✓ · §11 Scraper-Dedup → T18–T20 ✓
- §12 Redirects/Dead-Code → T24 ✓ · §16 Tests → je Task ✓
- **Bewusste Abweichungen (dokumentiert):** (a) Redirects erst in P5 statt P1 (P1 bleibt no-loss, da Deep-Links bis Overlays stehen). (b) `basic-freigaben` (RSC) bleibt Deep-Link statt Drawer-Overlay (RSC-in-Drawer nicht ohne Refactor). (c) Ansprechpartner-DDL nur Zusatzfelder (`vorname/nachname` existierten).

**2. Placeholder-Scan:** Keine „TBD/TODO". Einzige verifikations-abhängige Stelle: T18 Feld-Mapping der Partner-Tabellen → bewusster READ-Step (AGENTS.md: DB-Spalten nie raten). DDL-Versionen `<V>` = Plugin-recorded (Regel 2), kein Platzhalter-Bug.

**3. Typ-Konsistenz:** `VertriebKontakt`/`VertriebRolle`/`VertriebTyp` durchgängig aus `@/lib/vertrieb/vertrieb-kontakt.types`. `filterKontakte`/`RosterFilter` unverändert. `protokolliereAktivitaet(leadId, typ, text)` / `updatePartnerLead(id, patch)` / `konvertierePartnerLead(id)` exakt wie bestehende Signaturen. `sendEmail(SendEmailOpts)` wie `client.ts`. `BestandsLead`/`filterGegenBestand` unverändert wiederverwendet.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-10-vertrieb-crm-konsolidierung.md`.**

Empfehlung: **Phasenweise ausführen** (P1 zuerst mergen/shippen, dann P2…P5) — auch wenn der Plan gesamthaft geschrieben ist, ist P1 eigenständig shippbar und unblockt den Rest. Vor P3-Termin + P4 die Lane e8aa73d4 abstimmen.

Zwei Ausführungs-Optionen:
1. **Subagent-Driven (empfohlen)** — pro Task ein frischer Subagent, Review zwischen den Tasks, schnelle Iteration (superpowers:subagent-driven-development).
2. **Inline** — Tasks in dieser Session, Batch mit Checkpoints (superpowers:executing-plans).
