# Fundament C4a — Implementierungsplan (FallAkte-Kern + Kunde-Migration)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.
>
> Phase-C-Code-Plan nach FUNDAMENT §5 (`superpowers:writing-plans`). Setzt `c4-eine-akte-plan.md` um.
> **Revision 01.08. (v2):** baut die 3 C4-Entscheidungen (`DECISIONS.md`, `2026-07-31 · C4`) von Anfang an ein —
> der Kern wird **generalisierbar** gebaut (nicht Kunde-only-Shell), damit C4b/c/d **keinen** Kern-Refactor erzwingen.
> **Gating:** ausführbar, sobald die **Kunde-Journey-Smoke grün** (Teil von B2 — derzeit rot über J4-Reparatur, J1-deep
> grün; [[coordination-b2-journey-step-diagnose-j4-reparatur-rot]]). Verifikation = CI + Kunde-Detail-Render-Smoke —
> **lokal nicht baubar (0 node_modules)**.

**Goal:** Den rollen-parametrisierten `<FallAkte>`-Kern aus dem **Kunde-Prototyp** extrahieren + die Kunde-Sicht
**behavior-preserving** darüber rendern — mit **allen Generalisierungs-Nähten schon im Contract** (nur `columns`
implementiert). C4b–e (SV/Werkstatt/Staff) fügen je einen Layout-Zweig + ihre config hinzu, nicht neuen Kern.

**Architecture:** `<FallAkte>` = **Server-Component**-Shell (Layout + Header + Realtime + ReactNode-Slots), die eine
rollen-`config` + ein rollen-`vm` nimmt und die Zonen rendert. Zone-Komponenten dürfen Client-Components sein
(Interaktivität lebt dort, nicht im Kern). Ein `layout`-Switch wählt den Shell-Modus; C4a implementiert `columns`.

## Global Constraints (aus `DECISIONS.md`, `2026-07-31 · C4` — Aaron)

- **Kern generalisieren:** `<FallAkte>` trägt die **volle** Contract-Fläche — `layout` (`columns`|`sidebar`|`tabs`),
  **Custom-Header-Slot** (ReactNode ODER `{title,description,badges}`), **server-injizierte ReactNode-Slots**
  (`topBlocks`/`footer`/`aside`/`sidebar`). Alle 5 Rollen rendern am Ende über EINEN Kern.
- **Server-Kern + Client-Zonen:** `<FallAkte>` ist eine **Server-Component** (kein `'use client'`). Interaktivität
  (Geo/Drawer/Modal/Tab-Controller) lebt in den Zone-Komponenten bzw. Client-Chrome-Slots — **nie** im Kern.
- **Nähte offen lassen (Feed-Forward):** Kunde nutzt nur `layout='columns'` + `{title,description}`. Die anderen
  Layout-Zweige + Slots sind im **Typ** definiert, aber in C4a **nicht implementiert** (expliziter `throw`, kein
  Placeholder) — C4b (`sidebar`), C4c (`columns`+Slots), C4d/e (`tabs`) füllen sie.
- **Reihenfolge Folge-Tranchen:** C4b SV → C4c Werkstatt → C4d/e Staff (eine rollen-adaptive Tranche).
- Kein visuelles Redesign; Token/Primitives + DOM byte-identisch; keine Gate-/RLS-/Read-Pfad-Änderung (C5).

---

## Verifizierter Ist (31.07., `KundeClaimView.tsx`)

`<KundeClaimView vm={KundeClaimViewModel}>` (Server-Component) = **Shell + Zonen**:
- **Shell:** `PageHeader` (Titel `claim_nummer · kennzeichen — fahrzeug`, Description = `adresse`) + Multi-Fall-Zurück-
  Link (`vm.hatMehrereFaelle`) + `<FallRealtimeRefresh fallId claimId>` + Zonen-Layout (`mx-auto max-w-xl lg:max-w-5xl`,
  `lg:columns-2`, je Zone `id="zone-<key>"` + `break-inside-avoid`).
- **Zonen:** `deriveKundeZonen(vm)` (`@/lib/claims/kunde-zonen`) → geordnetes `ZoneKey[]` (phasen-adaptiv) → gemappt auf
  `StatusZone`/`AufgabenZone`/`TeamZone`/`GeldZone`/`DoksTermineZone`. Die id-Anker sind AufgabenZone-CTA-Sprungziele
  (`#zone-geld` etc.) → **müssen erhalten bleiben**.

→ Shell + Zonen-Layout sind **rollen-generisch**; Zonen-Menge/-Reihenfolge + Zone-Komponenten + `vm` sind
rollen-spezifisch. Genau die C4-Grenze (~80/20). Cross-Rollen bestätigt (`c4b/c4c/c4de-*-akte-ist.md`): SV braucht
`sidebar`+Header-Slot+`topBlocks`/`footer`; Werkstatt `columns`+`footer`; Staff `tabs`+aside/sidebar.

**⚠ Zwei Render-Sites (P6-Cross-Check 01.08.):** `<KundeClaimView vm>` wird an ZWEI Stellen gerendert —
`src/app/kunde/faelle/[id]/page.tsx:60` **und** `src/app/kunde/fahrzeuge/[id]/schaden/[claimId]/page.tsx:37` (P6 #4924,
sauberer Reuse — Kommentar dort: „C4-Gate: KONSUMIERT die bestehende Kunde-Claim-Sicht"). Die **Komponente selbst ist
unverändert** (dieser Ist hält). Task 2 macht `KundeClaimView` zum Adapter → die `<KundeClaimView vm>`-API bleibt,
**beide** Sites laufen automatisch weiter. **DoD-Konsequenz:** der Kunde-Render-Smoke prüft **BEIDE** Routen
(`/kunde/faelle/[id]` + `/kunde/fahrzeuge/[id]/schaden/[claimId]`).

## Kern-Design (`<FallAkte>` — generalisiert)

**File `src/components/fall-akte/types.ts`:**
```ts
import type { ReactNode, ComponentType } from 'react'

export type FallAkteLayout = 'columns' | 'sidebar' | 'tabs'

/** Header entweder simpel ({title,…}, Kunde/Werkstatt) ODER ein Custom-ReactNode (SV FallHeader, Staff IdentityHeader). */
export type FallAkteHeader =
  | { title: string; description?: string | null; badges?: ReactNode }
  | { custom: ReactNode }

/** Server-injizierte ReactNode-Slots (SV: topBlocks/footer; Staff: aside/sidebar). Alle optional. */
export type FallAkteSlots = {
  topBlocks?: ReactNode   // volle Breite, direkt unter dem Header (SV topServerBlocks)
  footer?: ReactNode      // volle Breite, ganz unten (SV vorOrtCard; Werkstatt Interaktiv-Segment+Copilot+Chat)
  aside?: ReactNode       // linke Spalte (Staff FallPhasenPanel) — nur layout='tabs'/'sidebar'
  sidebar?: ReactNode     // rechte Spalte (Staff FallSidebar) — nur layout='tabs'/'sidebar'
}

export type FallAkteConfig<Vm, ZK extends string> = {
  layout?: FallAkteLayout                                  // default 'columns'
  zones: (vm: Vm) => ZK[]                                  // geordnet, phasen-adaptiv (Kunde: deriveKundeZonen)
  zoneComponents: Record<ZK, ComponentType<{ vm: Vm }>>   // dürfen Client-Components sein
  header: (vm: Vm) => FallAkteHeader
  backLink?: (vm: Vm) => { href: string; label: string } | null
  realtime?: (vm: Vm) => { fallId: string; claimId: string | null } | null
  slots?: (vm: Vm) => FallAkteSlots
}
```

**File `src/components/fall-akte/FallAkte.tsx` (Server-Component, KEIN `'use client'`):**
```tsx
import type { FallAkteConfig } from './types'
import { FallAkteColumns } from './layouts/FallAkteColumns'

export function FallAkte<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const layout = config.layout ?? 'columns'
  switch (layout) {
    case 'columns':
      return <FallAkteColumns config={config} vm={vm} />
    // Naht offen — von den Folge-Tranchen gefüllt (nicht in C4a):
    //   'sidebar' → C4b (SV),  'tabs' → C4d/e (Staff).
    default:
      throw new Error(`FallAkte: layout="${layout}" noch nicht implementiert (C4b: sidebar, C4d/e: tabs)`)
  }
}
```

Die **Shell-Bausteine** (Header-Renderer, Realtime, Zonen-Loop mit `id="zone-<key>"`+`break-inside-avoid`, ReactNode-
Slots) leben in `layouts/FallAkteColumns.tsx`; jeder spätere Layout-Zweig (`FallAkteSidebar`/`FallAkteTabs`) teilt den
Header-Renderer + die Slots, variiert nur die Zonen-Anordnung.

## Was C4a baut vs. was die Folge-Tranchen ergänzen

| | C4a (dieser PR) | C4b/c/d (später) |
|---|---|---|
| `types.ts` (voller Contract) | ✅ komplett | — (fix) |
| `FallAkte.tsx` (layout-Switch) | ✅ `columns`-Zweig + `throw` für Rest | + `sidebar`/`tabs`-Zweig |
| `layouts/FallAkteColumns.tsx` | ✅ (Header-Renderer + Zonen-Loop + `footer`-Slot) | Werkstatt (C4c) nutzt es unverändert |
| Header-Slot-Union (`{title…}`\|`{custom}`) | ✅ im Renderer beide Fälle | SV/Staff liefern `{custom}` |
| `slots` (topBlocks/footer/aside/sidebar) | ✅ `columns` rendert `footer` (Kunde: none) | SV `topBlocks`/`footer`; Staff `aside`/`sidebar` |
| `layouts/FallAkteSidebar.tsx` | ❌ (throw) | C4b (SV) |
| `layouts/FallAkteTabs.tsx` | ❌ (throw) | C4d/e (Staff) — Client-Tab-Controller |

## Task 1 — `<FallAkte>`-Kern + voller Config-Typ + `columns`-Layout

**Files:** NEU `src/components/fall-akte/types.ts` · `src/components/fall-akte/FallAkte.tsx` ·
`src/components/fall-akte/layouts/FallAkteColumns.tsx`.
**Produces:** `FallAkte`, `FallAkteConfig<Vm,ZK>`, `FallAkteHeader`, `FallAkteSlots` (Task 2 konsumiert sie).

- [ ] **Step 1** — `types.ts` mit dem vollen Contract oben anlegen (`layout`-Union + Header-Union + `slots`). Exakt wie im Kern-Design.
- [ ] **Step 2** — `layouts/FallAkteColumns.tsx` (Server-Component): die Shell **1:1 aus `KundeClaimView.tsx` extrahieren** —
  Header-Renderer (rendert `{title,description,badges}` ODER `{custom}` je nach `header(vm)`), `backLink`-Renderer
  (`hatMehrereFaelle`-Link wenn `backLink(vm)` truthy), `realtime(vm)` → `<FallRealtimeRefresh>`, danach der
  `slots(vm).topBlocks` (volle Breite), dann der **`lg:columns-2`-Zonen-Loop** über `config.zones(vm)` (je Zone
  `<div id="zone-${zk}" className="break-inside-avoid">` + `const Z = zoneComponents[zk]; <Z vm={vm} />`), zuletzt
  `slots(vm).footer` (volle Breite). **Identisches DOM/Klassen** wie heute — kein Redesign.
- [ ] **Step 3** — `FallAkte.tsx` (Server-Component) mit dem `layout`-Switch oben: `columns` → `FallAkteColumns`,
  Rest → `throw`. Generisch `<Vm, ZK extends string>`.
- [ ] **Step 4** — `npx tsc --noEmit` (bzw. `npm run build`): grün, kein Consumer bricht noch (Task 2 verdrahtet den ersten).

**Verifikation:** build/tsc grün. **Risiko:** niedrig (reine Extraktion + Typ; kein Verhalten, kein Consumer live).

## Task 2 — Kunde-Sicht auf den Kern (behavior-preserving)

**File:** `src/components/kunde/claim-view/KundeClaimView.tsx` → dünner Adapter.
**Consumes:** `FallAkte`, `FallAkteConfig` (Task 1).

- [ ] **Step 1** — `kundeConfig: FallAkteConfig<KundeClaimViewModel, KundeZoneKey>` bauen:
  ```ts
  const kundeConfig = {
    layout: 'columns' as const,
    zones: (vm) => deriveKundeZonen(vm),
    zoneComponents: { status: StatusZone, aufgaben: AufgabenZone, team: TeamZone, geld: GeldZone, doksTermine: DoksTermineZone },
    header: (vm) => ({ title: `${vm.claimNummer} · ${vm.kennzeichen} — ${vm.fahrzeug}`, description: vm.adresse }),
    backLink: (vm) => (vm.hatMehrereFaelle ? { href: '/kunde', label: 'Alle Fälle' } : null),
    realtime: (vm) => ({ fallId: vm.fallId, claimId: vm.claimId }),
    // slots: keine (Kunde nutzt weder topBlocks noch footer) — Naht bleibt ungenutzt
  }
  ```
  (Die exakten `vm`-Feld-Namen aus dem heutigen `KundeClaimView`-Header-Aufbau übernehmen — 1:1, kein neuer Text.)
- [ ] **Step 2** — `KundeClaimView` returnt nur noch `<FallAkte config={kundeConfig} vm={vm} />`. Den Alt-Shell-/Zonen-
  Loop-Code entfernen (jetzt im Kern).
- [ ] **Step 3** — Dead-Code-Check: die 5 Zone-Komponenten bleiben (via `kundeConfig` referenziert); kein toter Import;
  `deriveKundeZonen` bleibt. `npx tsc --noEmit` grün.
- [ ] **Step 4** — build grün. (Kein Unit-Test-Ziel — Verifikation ist der Render-Smoke nach Merge.)

**Verifikation:** build/tsc; **Kunde-Detail-Render-Smoke** (`/kunde/faelle/[id]` rendert **byte-identisch**, Anker
`#zone-geld` etc. funktionieren) nach Merge; DOM-Diff = 0. **Risiko:** mittel (Kunden-kritische Sicht) — durch die
byte-genaue Extraktion + Render-Smoke abgesichert.

## DoD (C4a) + Sequenz

1. Task 1 (Kern + `columns`) → Task 2 (Kunde-Adapter) — **ein PR**.
2. **DoD:** `/kunde/faelle/[id]` rendert über `<FallAkte layout="columns">`; DOM/Anker/Layout unverändert;
   **Kunde-Journey-Smoke grün** (nach Merge); Alt-Zonen-Loop aus `KundeClaimView` entfernt (knip sinkt); Kunde-Gate +
   Route unverändert (Regression §7). **Voller Contract steht** (`types.ts`), nur `columns` implementiert.
3. **Folge-Tranchen:** C4b SV (`FallAkteSidebar` + SV-config + `{custom}`-Header + `topBlocks`/`footer`) → C4c Werkstatt
   (`columns` + `footer`-Segment + `{title,badges}`-Header) → C4d/e Staff (`FallAkteTabs` + Client-Tab-Controller +
   aside/sidebar + rollen-adaptive `zones(vm,rolle)`). Jede fügt **einen Layout-Zweig + config** hinzu, keinen Kern-Umbau.

## Nicht-Ziele

Kein visuelles Redesign (Token/Primitives + Look identisch); keine neuen Zonen-Features; **keine andere Rolle als Kunde**
live in C4a (die `sidebar`/`tabs`-Zweige `throw`en bis ihre Tranche); keine Gate-/RLS-/Read-Pfad-Änderung (C5); der Kern
bleibt **Server-Component** (Client-Interaktivität nur in Zone-Komponenten/Chrome-Slots). Die `sidebar`/`tabs`-Layouts
werden **nicht** in C4a implementiert (YAGNI — kein Consumer; die Naht ist der `throw` + der Typ).
