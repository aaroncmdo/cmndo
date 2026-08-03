# Fundament C4b — Implementierungsplan (SV-Fallakte → `<FallAkte>`-Kern, layout='stack')

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.
>
> Phase-C-Code-Plan (FUNDAMENT §5). Setzt `docs/fundament/c4b-sv-akte-ist.md` (#4916) + den C4a-`<FallAkte>`-Kern
> (#4940) um. **Gating:** ausführbar, sobald **#4940 gemergt** (der Kern liegt dann auf staging) UND B1/J4 grün
> (steht). Verifikation = CI + der SV-Detail-Render-Smoke — **lokal nicht baubar (0 node_modules)**.

**Goal:** Die SV-Sicht (`/gutachter/fall/[id]`) **behavior-preserving** über den `<FallAkte>`-Kern rendern, indem der
Kern einen zweiten Layout-Modus **`stack`** bekommt (Full-Bleed-Wrapper + Sticky-Header-Slot + vertikaler Full-Width-
Block-Flow + ReactNode-Slots) und `FallDetailClient` zum dünnen Adapter wird. Server-Kern bleibt; die SV-Client-
Interaktivität (Geo/Drawer) lebt in Client-Zone-/Slot-Komponenten.

**Architecture:** `<FallAkte layout='stack'>` (Server-Component) rendert Header-Slot → `topBlocks`-Slot → die Zonen in
einem **einspaltigen** Full-Width-Flow (`max-w-7xl mx-auto … space-y-4 sm:space-y-6`) → `footer`-Slot. SVs einzige
2-Spalten-Stelle (Stammdaten | Doks/Ansprechpartner) ist ein **lokales grid INNERHALB einer Zone** — kein Layout-Feature.

## Global Constraints (aus `DECISIONS.md` 2026-07-31 · C4 + dieser Plan)

- **Kern generalisieren** (Entscheidung): `<FallAkte>` wächst um `layout='stack'` (SV jetzt, Werkstatt/C4c reused).
- **Server-Kern + Client-Zonen** (Entscheidung): der Kern bleibt Server-Component; `useGeoTracking`/Drawer-`useState`
  wandern in **client** Zone-/Slot-Komponenten, NICHT in den Kern.
- **Layout-Namens-Präzisierung (dieser Plan → DECISIONS-Nachtrag):** die tentative `sidebar`-Benennung (c4b-ist §3)
  wird **`stack`** — der Ist zeigt: SV ist ein vertikaler Full-Width-Stack, das `grid-[1fr_320px]` ist ein Zonen-
  internes Detail, kein persistenter Sidebar. Der `FallAkteLayout`-Union-Wert `'sidebar'` → `'stack'`.
- Byte-nahe Ausgabe (Token/Primitives + DOM identisch); keine Gate-/RLS-/Read-Pfad-Änderung (`sa_unterschrieben`-Gate
  + der 15-Tabellen-Read der page.tsx bleiben — C5-Domäne); **kein** Anfassen der `stellungnahme/`-Sub-Route.

---

## Verifizierter Ist (SV `FallDetailClient` 506 Z. + `page.tsx` 723 Z., unverändert seit #4815/S1/S2)

`FallDetailClient` (`'use client'`) rendert (return, :314-506):
1. Full-Bleed-Wrapper `min-h-full bg-claimondo-bg -mx-2… -mb/-mt… [&_.rounded-2xl]:shadow-sm`.
2. `<FallRealtimeRefresh>` + `<FallWindowDropzone>` (SV-spezifisch, Drag-Drop-Upload).
3. **Sticky-Header:** `<div className="sticky -top-2… z-30 bg-claimondo-bg shadow-sm"><FallHeader …/></div>` — `FallHeader`
   trägt den Full-Screen-Akte-Drawer (`FallakteDrawer`, `useState`).
4. `max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-3`: `<SvUnterwegsInfo tracking={geoTracking}/>` + (svPhase-gated)
   `<AuftragHeaderPanel …/>`. **`geoTracking` = `useGeoTracking(...)`** (Client-Hook, oben im Component).
5. (topServerBlocks) `max-w-7xl … pt-3 space-y-3` → `{props.topServerBlocks}` (server-injiziert aus page.tsx).
6. (konfrontationGewuenscht) `max-w-7xl … pt-3` → `<KonfrontationsTerminCard …/>`.
7. **Content** `max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-4 sm:space-y-6`:
   - `<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 sm:gap-6">` — `<StammdatenAccordion/>` |
     `<div className="space-y-4">{!fin && <FinNachtragenCard/>}<WeitereDokumenteCard/><AnsprechpartnerCard/></div>`.
   - (hat_vorschaeden) Vorschäden-Warnkarte · `<GutachtenCard/>` · (gutachtenWerte) `<GutachtenWerteCard/>` ·
     `<GutachterCopilotPanel/>` · (currentUserId) `<ClaimChatPanel istStaff={false}/>`.
8. (vorOrtCard) `max-w-7xl … pb-6` → `{props.vorOrtCard}`.

**page.tsx** liefert `topServerBlocks` + `vorOrtCard` (server-gerendert) als Props an `FallDetailClient` (:688). Gate
`sa_unterschrieben` + der Read bleiben unverändert.

## Design — `layout='stack'` + SV-Decomposition

**Der `stack`-Layout-Kern** (neu, `layouts/FallAkteStack.tsx`) rendert generisch:
```
<div className={config.wrapperClassName ?? …stack-default}>
  {realtime && <FallRealtimeRefresh …/>}
  {slots.beforeHeader}                        // SV: <FallWindowDropzone> (SV-spezifisch)
  <div className="sticky … z-30 bg-claimondo-bg shadow-sm">{header.custom}</div>   // Sticky-Header-Slot
  {slots.topBlocks}                            // SV: Stepper/Geo + topServerBlocks + Konfrontation
  <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 space-y-4 sm:space-y-6">
    {zones.map(z => <div id={`zone-${z}`} key={z}><Zone vm={vm}/></div>)}   // Full-Width-Stack (KEIN break-inside)
  </div>
  {slots.footer}                               // SV: vorOrtCard
</div>
```
→ SV nutzt den Header-Slot **custom** (`FallHeader`), die Slots `beforeHeader`/`topBlocks`/`footer` für die Full-Width-
Blöcke, und die **Zonen** für den Content-Flow (Stammdaten-grid-Block · Gutachten · Werte · Copilot · Chat). Das
`grid-[1fr_320px]` lebt **in der `stammdaten`-Zone-Komponente** (rendert Accordion | Doks/Ansprechpartner intern).

**SV-Config** (`svConfig: FallAkteConfig<SvViewModel, SvZoneKey>`):
- `layout: 'stack'`, `header: () => ({ custom: <FallHeader …/> })`, `realtime: (vm)=>({fallId, claimId})`.
- `zones: (vm) => ['stammdatenDoks','gutachten','gutachtenWerte','copilot','chat']` (phasen-adaptiv wie deriveKundeZonen —
  gutachtenWerte nur wenn `vm.gutachtenWerte`, chat nur wenn `currentUserId`).
- `zoneComponents`: neue **Client**-Wrapper (`SvStammdatenDoksZone` = das grid; `SvGutachtenZone`; `SvCopilotZone`;
  `SvChatZone` — dünn, umschliessen die bestehenden Cards).
- `slots: (vm) => ({ beforeHeader: <FallWindowDropzone…/>, topBlocks: <SvTopBlocks vm/> (Client: useGeoTracking +
  SvUnterwegsInfo + AuftragHeaderPanel + topServerBlocks + Konfrontation), footer: vorOrtCard })`.

## Task 1 — `layout='stack'` im Kern (+ Union-Wert)

**Files:** `src/components/fall-akte/types.ts` (Union `'sidebar'`→`'stack'`, + `wrapperClassName?` + `slots.beforeHeader?`) ·
`src/components/fall-akte/FallAkte.tsx` (Switch-Case `'stack'`) · NEU `src/components/fall-akte/layouts/FallAkteStack.tsx`.

- [ ] **Step 1** — `types.ts`: `FallAkteLayout = 'columns' | 'stack' | 'tabs'`; `FallAkteSlots` += `beforeHeader?: ReactNode`;
  `FallAkteConfig` += `wrapperClassName?: string`. (Der Header-Slot-`{custom}`-Zweig existiert schon aus C4a.)
- [ ] **Step 2** — `FallAkteStack.tsx` (Server-Component, `<Vm, ZK>`): das Design oben; **Zone-Render mit dem C4a-Cast**
  `const Zone = config.zoneComponents[z] as FallAkteZone<Vm>` (sonst TS2322, s. #4940). Full-Width-Stack (kein columns/
  break-inside). Sticky-Header aus `header.custom`.
- [ ] **Step 3** — `FallAkte.tsx`: `case 'stack': return <FallAkteStack config={config} vm={vm} />`. `'sidebar'`-Referenz
  in der throw-Message → `'stack'`.
- [ ] **Step 4** — `npx tsc --noEmit` (CI). **Risiko:** niedrig (additive Layout-Variante, kein Consumer bis Task 2).

## Task 2 — SV-Sicht auf den Kern (behavior-preserving Decomposition)

**Files:** `src/app/gutachter/fall/[id]/FallDetailClient.tsx` (→ Adapter) · NEU `…/_components/zonen/{SvTopBlocks,
SvStammdatenDoksZone,SvGutachtenZone,SvCopilotZone,SvChatZone}.tsx` (Client-Wrapper um die bestehenden Cards).

- [ ] **Step 1** — Client-Zonen extrahieren: je einen dünnen `'use client'`-Wrapper, der das bestehende JSX aus
  `FallDetailClient` **1:1** übernimmt (SvTopBlocks trägt `useGeoTracking` + SvUnterwegsInfo + AuftragHeaderPanel +
  topServerBlocks + Konfrontation; SvStammdatenDoksZone das `grid-[1fr_320px]`; usw.). Props = das jeweilige `vm`-Subset.
- [ ] **Step 2** — `FallDetailClient` → Adapter: baut `svConfig` (s. Design) + `return <FallAkte layout='stack'
  header={{custom:<FallHeader…/>}} config={svConfig} vm={svVm} />`. Der Wrapper/Sticky-Header/Content-Flow kommt aus dem
  Kern; das alte Layout-Gerüst wird entfernt.
- [ ] **Step 3** — Dead-Code: die inline-Layout-JSX aus `FallDetailClient` weg; die Card-Komponenten bleiben (via Zonen
  referenziert); `page.tsx`-Props (`topServerBlocks`/`vorOrtCard`) unverändert durchgereicht (jetzt in `svConfig.slots`).
- [ ] **Step 4** — `npx tsc --noEmit` + build (CI). **Risiko:** hoch (grösster Custom-View, Client-State-Decomposition) —
  durch die 1:1-Übernahme des JSX in die Zonen + den Render-Smoke abgesichert.

## DoD (C4b) + Sequenz

1. **Task 1 (stack-Kern) + Task 2 (SV-Adapter)** — empfohlen **zwei PRs** (Task 1 klein/risikoarm zuerst, dann Task 2),
   ODER ein PR falls Aaron es bündeln will.
2. **DoD:** `/gutachter/fall/[id]` rendert über `<FallAkte layout='stack'>`; DOM/Sticky-Header/Drawer/Geo/`sa_unterschrieben`-
   Gate unverändert; **SV-Journey-Smoke grün** (J1-deep SV-Schritt: Stellungnahme/Gutachten sichtbar); Alt-Layout-Gerüst
   aus `FallDetailClient` entfernt; knip-Baseline sinkt.
3. **C4c (Werkstatt)** reused `layout='stack'` (+ Werkstatt-Config); **C4d/e (Staff)** = `layout='tabs'` (Client-Tab-Controller).

## Offene Entscheidungen (→ DECISIONS, Aaron-Review vor Code)

1. **`sidebar` → `stack`** (Union-Wert + Impl): der Ist rechtfertigt es (SV ist ein Stack, kein Sidebar). Bestätigen.
2. **Client-Zone-Granularität:** 4-5 dünne Client-Wrapper (SvTopBlocks/StammdatenDoks/Gutachten/Copilot/Chat) vs. gröber.
   Empfehlung: so wie oben (folgt der bestehenden Card-Struktur, minimaler Umbau).
3. **`FallWindowDropzone`/Sticky-Header als Slot vs. Kern-Feature:** hier als `slots.beforeHeader` + Sticky-Header-Slot
   (SV-spezifisch bleibt in der Config). Bestätigen.

## Nicht-Ziele
Kein visuelles Redesign; keine neuen SV-Features; kein Anfassen von `page.tsx`-Gate/Read (C5) oder `stellungnahme/`;
keine Änderung der Card-Komponenten selbst (nur umschliessen). Der Kern bleibt Server-Component (Client nur in Zonen/Slots).
