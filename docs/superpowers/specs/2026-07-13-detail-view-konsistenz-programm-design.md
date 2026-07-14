# Detail-View-Konsistenz-Programm — Design-Spec

**Datum:** 2026-07-13
**Lane:** `kitta/detail-view-konsistenz` (isolierter Worktree, off `origin/staging`)
**Auftrag (Aaron):** „welche Routen könnten wir zu Detailviews machen und migrieren? audite bzw. sweepe die vollständige App und dann schreib einen konsistenten Plan."
**Entscheidungen (Aaron, 13.07.):**
- **Scope** = volles Programm (Kategorien A + B + C + D).
- **Pattern** = Shared Shell + Drawer *zuerst* (abstraction-first), dann Migration darauf.

**Verwandt:** `PROGRAM-claim-case-management-map` · `coordination-faelle-hub-konvergenz-f0` · `audit-abgeleitete-views-mapping-konsistenz-detailview` · `assessment-admin-kb-dispatcher-detail-rebuild`

---

## 1. Problem

Die App hat **156 Routen** über ~9 Portale (Kunde, SV/Gutachter, Admin, Mitarbeiter/KB, Dispatch, Makler, Kanzlei, Flotte + öffentliche Magic-Link-Flows). „Detail-Views" — Seiten, die **eine** Entität vollständig zeigen/editieren — sind heute inkonsistent gebaut:

- **Manche Entitäten haben gar keinen Detail-View.** Die Liste zeigt flache Daten, Zeilen sind nicht klickbar: `organisationen`, `partner`, `communities`, `vertraege`, `embed-sites`, `gutachter/team`.
- **Manche behelfen sich mit einem Modal** — zu eng für die Datenmenge, kein Deep-Link, keine Tabs: `versicherungen` (512px-Modal), `abrechnungen` (672px-Modal mit Retry/Mark-Paid-Aktionen).
- **Bestehende Detail-Views sind 5+ verschiedene handgerollte Shells.** Claims allein haben 4 Rollen-Varianten mit 4 verschiedenen Shell-Implementierungen + 1 fehlende.
- **Ein Portal verlinkt auf eine tote Detail-Route:** `kanzlei/mandate` → `/kanzlei/fall/[id]` (existiert nicht), während `kanzlei/kanban` → `/faelle/[id]` zeigt. Selbst das Email-Template `KanzleiAuftragszusammenfassung` linkt auf die tote Route.
- **Standalone-Routen doppeln Hub-Sub-Routen:** `/admin/sla`, `/admin/reklamationen`, `/admin/statistiken`, `/admin/kanzlei-board` — die `(hub)`-Tabs sind reine `export { default } from '…'`-Re-Exports, **beide URLs lösen auf, kein Redirect**.

Es gibt **zwei ausgereifte Muster**, die als Vorlage taugen — aber sie sind **nicht als wiederverwendbare Primitives extrahiert**. Also reproduziert jeder neue Detail-View das Muster von Hand (oder eben gar nicht → Modal/keine Detail-View). Das ist die Wurzel der Inkonsistenz.

---

## 2. Bestandsaufnahme (der Sweep)

### 2.1 Die zwei Gold-Standards

**A · `FallakteShell`** (`src/app/faelle/[id]/FallakteShell.tsx`) — der reife Referenz-Shell:
- Geteilte `FallakteTabs` (6 Tabs, `?tab=`-synchronisiert).
- `FallProvider`/`FallContext` (`useFall()`) — **load-once** Context hält fall+lead+claim+permissions; alle Tabs/Sidebar/Sections konsumieren eine Quelle.
- **Rollen-parametrierte Facade:** `userRolle: FallakteRolle` treibt den Context, backed durch die `lib/fall/queries.ts`-Loader-Familie (`getFallForAdmin` / `getFallForSv` / `getFallForKunde` / `getFallById`).
- Geteilte Bausteine: `FallPhasenPanel`, `FallIdentityHeader`, `FallActionBar`, `FallMitteilungenBanner`, `TimelineView`. Ersetzte explizit einen 210KB-Monolithen.

**B · SV-Intercepting-Drawer** (`src/app/admin/sachverstaendige/`) — das reife List→Detail-Drill-Muster:
- `@drawer/(.)[id]/page.tsx` re-nutzt `[id]/page.tsx` in einer `DrawerShell` → Listen-Klick öffnet Drawer über der Karte, **Deep-Link** fällt auf die Full-Page zurück.
- `layout.tsx` mit Parallel-Slot `{children, drawer}`.
- Sticky `PageHeader` + Query-param-Tabs (`?tab=`) + 2-Spalten (Edit-Form ‖ Related-Panel „Offene Fälle/Tasks").
- **Aber:** die `DrawerShell` ist **SV-lokal** (`src/app/admin/sachverstaendige/DrawerShell.tsx`), nicht geteilt.

### 2.2 Die 4 Kategorien

**Cat A — Claim-Detail: 5 Rollen, 5 Shells (Konvergenz-Kandidat)**

| Route | Shell heute | Facade heute | Zustand |
|---|---|---|---|
| `/faelle/[id]` (Admin/KB) | `FallakteShell` | `getFallById` + `FallakteRolle` | ✅ kanonisch (Referenz) |
| `/gutachter/fall/[id]` (SV) | `FallDetailClient` (bespoke, Accordion, keine persistenten Tabs) | `getFallForSv` (Teil der Familie) | → auf `FallakteShell` (am nächsten dran) |
| `/kunde/faelle/[id]` (Kunde) | keine Shell (~970-Zeilen-Server-Page, `ClaimStepper`+Card-Stack) | `getKundeFallDetailRecord` (claim-anchored) | → `FallProvider`/Shell (Kunde-Linse erhalten) |
| `/makler/(shell)/akten/[id]` (Makler) | `MaklerAkteDetail` (sauber, 5 Tabs, `?tab=`) | `getMaklerFallDetail` (makler-only, **nicht** rollen-param.) | → Facade auf `getClaimDetail` angleichen |
| `/kanzlei/fall/[id]` (Kanzlei) | **existiert nicht** | — | ⚠ **Bug**: `mandate` linkt auf tote Route |

**Cat B — Entity-Listen OHNE Detail-View (netto-neue Detail-Views — der wörtlichste „Route → Detailview")**

| Route | Entität | Interaktion heute | Signal |
|---|---|---|---|
| `admin/organisationen` | Organisation | **NONE** — nur Filter-Button, Zeilen nicht klickbar | `OrganisationenClient` |
| `admin/versicherungen` | Versicherer | **MODAL** (`ClickableTr`→`setSelected`→512px-`Modal` „Versicherer-Detail") | upgrade Route+Drawer |
| `admin/partner` | Partner | **NONE** — keine Navigation/Modal | — |
| `admin/communities` | Community | **NONE** (nur Create-Wizard `router.push`) | — |
| `admin/vertraege` | Vertrag | **NONE** | — |
| `admin/abrechnungen` | Abrechnung | **MODAL** (672px, Retry/Mark-Paid) | upgrade Route+Drawer |
| `admin/embed-sites` | Embed-Site | **NONE** (nur `useRouter` für Create) | — |
| `gutachter/team` | Sub-SV / Pool-Lead | **NONE** (inline `<select>`/Sperren-Buttons, keine Zeilen-Navigation) | — |

**Cat C — Bestehende Detail-Views = handgerollte One-offs (an Shell angleichen)**

| Route | Wrapper heute | Ziel |
|---|---|---|
| `admin/team/[id]` | `MitarbeiterDetail` (stacked Cards + Edit-Form, kein Shell/Tabs/Provider) | → `EntityDetailShell` |
| `dispatch/sachverstaendige/[id]` | **kein Wrapper** — reines Inline-Server-JSX (3-Spalten-Grid) | → `EntityDetailShell` |
| `dispatch/gutachter-finder/[id]` | `GutachterFinderDetailClient` (bespoke 2-Spalten) | → `EntityDetailShell` |
| `admin/sachverstaendige/[id]` | eigene Tabs (`?tab=`) + eigene lokale `DrawerShell` | Tabs/DrawerShell auf geteiltes Muster |

*Nebenbefund:* Es gibt **3 SV-Detail-Varianten** (`admin/sachverstaendige/[id]` reich+Drawer, `dispatch/sachverstaendige/[id]` Inline-One-off, `dispatch/gutachter-finder/[id]` Finder-Anfrage). Die **Listen** sind bereits via `SachverstaendigeList` (basePath-Param) geteilt — die **Details** nicht. Konvergenz-Kandidat.

**Cat D — Standalone-Routen doppeln Hub-Sub-Routen (Konsolidierung — Route→Tab, NICHT Detail-View)**

| Standalone (kanonisch) | Hub-Re-Export | Status |
|---|---|---|
| `/admin/sla` | `(hub)/sla` → `export { default } from '../../../sla/page'` | 2 Routen lösen auf, kein Redirect |
| `/admin/reklamationen` | `(hub)/reklamationen` | dito |
| `/admin/statistiken` | `(hub)/statistiken` | dito |
| `/admin/kanzlei-board` | `(hub)/kanzlei` | dito |
| `/admin/tasks`, `/admin/meine-tasks`, `/admin/aufgaben/{alle,meine}` | — | Task-Wildwuchs (4+ Surfaces) |
| `/admin` vs `/admin/faelle` | — | Cockpit-Doppelung |

→ Das ist die laufende **Fälle-Hub-Konvergenz F2/F3** (Ownership: ops-cockpit-Lane 470d55c9). **Nur referenzieren/sequenzieren, nicht neu bauen.** Keine Detail-Views — Liste/Tab-Konsolidierung. Im Programm, weil Scope = „Alles", aber als **adjazent + fremd-owned** markiert.

### 2.3 Sofort-Fund (Bug, → P3)
`kanzlei/mandate` verlinkt auf `/kanzlei/fall/[id]` — **die Route existiert nicht** (bestätigt via `git ls-files` + `git grep`; auch `KanzleiAuftragszusammenfassung.tsx`-Email linkt dorthin), während `kanzlei/kanban` auf `/faelle/[id]` zeigt. Also im **selben Portal** zwei verschiedene (eine tote) Detail-Ziele.

---

## 3. Ziel-Architektur (P0 Foundation)

Das „konsistent" entsteht durch **ein** Muster, extrahiert als wiederverwendbare Primitives.

### 3.1 `EntityDetailShell` (präsentational)

`src/components/shared/detail/EntityDetailShell.tsx` — verallgemeinert das Layout-Skelett von `FallakteShell`:

```tsx
<EntityDetailShell
  header={<EntityIdentityHeader title={…} badges={…} actions={…} backHref="/admin/organisationen" />}
  tabs={[{ key: 'stammdaten', label: 'Stammdaten' }, { key: 'faelle', label: 'Fälle', badge: 3 }]}
  activeTab={sp.tab ?? 'stammdaten'}
  sidebar={<RelatedEntitiesPanel … />}   // optional
>
  {tabContent}
</EntityDetailShell>
```

- **Layout:** Sticky Header + `?tab=`-Tab-Bar (server-freundliche `<Link>`-Tabs, wie SV/Fallakte/Makler) + 2-Spalten (Content ‖ optionale Sidebar).
- **Nur Chrome** — kein Daten-Load, kein entity-spezifisches Wissen. Jede Entität liefert Header/Tabs/Content/Sidebar selbst.
- Baut auf `primitives/*` + `shared/*` (PageHeader, SectionCard, Badge) — token-gebunden, whitelabel-safe (`var(--brand-*)`).
- **Tabs sind optional:** Entitäten mit nur einem Daten-Konzept rendern die Shell single-column ohne Tab-Bar.

### 3.2 `DrawerShell` (extrahiert, geteilt)
- SV-lokales `src/app/admin/sachverstaendige/DrawerShell.tsx` → `src/components/shared/detail/DrawerShell.tsx`.
- Props: `title`, `width`, `children`, Close = `router.back()`.
- Baut auf `primitives/Drawer`. Mobile = Full-Screen-Sheet (via primitive prüfen).
- **SV-Detail wird Erst-Konsument** der geteilten Version (Beweis der Abstraktion, net-zero Verhalten).

### 3.3 Intercepting-Route-Rezept (Template + Doku)
Pro drillbare Liste `<liste>/` das kanonische 4-File-Skelett:

```
<liste>/layout.tsx                → Parallel-Slot { children, drawer }
<liste>/[id]/page.tsx             → EntityDetailShell (Full-Page = Deep-Link-Fallback)
<liste>/@drawer/(.)[id]/page.tsx  → re-import [id]/page in <DrawerShell>
<liste>/@drawer/default.tsx       → return null (Slot-Default)
```
Die 4 Files sind Boilerplate → Doku unter `docs/` + ein Skeleton-Snippet. (Ein Codegen-Script ist optional, YAGNI bis >3 Listen.)

### 3.4 Facade-Konvention `getXForRole(role, id)`
- Jede Entität: **ein** Detail-Loader, rollen-aware wo nötig, normalisierte Shape, **Result-Object** (kein `throw`; AGENTS.md Server-Action-Pattern), nested FKs via `Array.isArray(x) ? x[0] : x` normalisiert.
- Muster existiert schon: `getFallFor*` / `getClaimDetail` / `getMaklerFallDetail`. Neue analog: `getOrganisationDetail`, `getVersichererDetail`, …

### 3.5 Konventionen (die „Konsistenz"-Regeln)
1. **Listen-Zeile → `<base>/[id]`** (Link oder Intercept-Drawer). Kein Modal-als-Detail für Entitäten mit Related-Daten / >~8 Feldern.
2. **Kein toter Detail-Link** — jede Liste linkt auf eine existierende Route.
3. **Tabs nur wenn die Entität sie braucht** (>1 Daten-Konzept), sonst single-column.
4. **Optional (Nice-to-have):** leichter Check-Notiz gegen neue `<Modal ariaLabel="…-Detail">`-Muster (analog `check:component-set`-Ratchet) — nicht Blocker für P0.

### 3.6 Was NICHT generalisiert wird
- Entity-spezifische Provider/Contexts (`FallProvider` bleibt claim-spezifisch).
- Edit-Formulare, Server-Actions, Related-Panels — pro Entität.
- Die Shell ist **Chrome**; Daten + Verhalten bleiben lokal. Sauberer Seam: gemeinsames Chrome, private Daten.

### 3.7 Verhältnis `EntityDetailShell` ↔ `FallakteShell`
`FallakteShell` behält seinen claim-spezifischen `FallProvider` (zu viel Domänen-Logik, um sie zu generalisieren). Wo sinnvoll teilt es die **Chrome-Primitives** (Header/Tab-Bar) mit `EntityDetailShell`; es wird **nicht** zwangsweise ein Konsument. `EntityDetailShell` = Chrome für Cat B/C (Nicht-Claim-Entities) + die Cat-C-SV-Details. Endgültige Grenze wird im **P0-Implementierungsplan** gezogen.

---

## 4. Migrations-Matrix (Audit → Aktionsplan)

| Route | Entität | Heute | Ziel | Phase | DDL? |
|---|---|---|---|---|---|
| `faelle/[id]` | Claim (Admin) | `FallakteShell` ✅ | Referenz (bleibt) | — | — |
| `gutachter/fall/[id]` | Claim (SV) | bespoke `FallDetailClient` | → `FallakteShell` | P3 | evtl. |
| `kunde/faelle/[id]` | Claim (Kunde) | 970-Z, kein Shell | → Shell/Provider (Kunde-Linse) | P3 | — |
| `makler/akten/[id]` | Claim (Makler) | `MaklerAkteDetail` | Facade → `getClaimDetail` | P3 | — |
| `kanzlei/fall/[id]` | Claim (Kanzlei) | **fehlt (tot)** | **NEU** auf `FallakteShell` | P3 | — |
| `admin/organisationen` | Organisation | NONE | **NEU** `/[id]` + Drawer + Shell | P1 | ✅ **gebaut** |
| `admin/versicherungen` | Versicherer | MODAL 512 | Modal → Route+Drawer+Shell | P1 | ✅ **gebaut** |
| `admin/embed-sites` | Embed-Site | NONE | **NEU** `/[id]` | P1 | ✅ **gebaut** |
| `admin/communities` | ~~Community~~ → **Organisation** (`typ='community'`) | NONE | ~~NEU `/[id]`~~ → **auf `/admin/organisationen/[id]` drillen** (keine eigene Tabelle!) | P1 | ✅ **gebaut** |
| ~~`admin/partner`~~ | ~~Partner~~ | — | ❌ **GESTRICHEN — keine Entität.** Hub aus 5 Tabs; `page.tsx` ist ein Re-Export von `organisationen`. Es gibt **keine `partner`-Tabelle** und keine `partner_id`-FK. | — | — |
| ~~`admin/vertraege`~~ | ~~Vertrag~~ | — | ❌ **GESTRICHEN — keine Entität.** Der „Vertragseditor": Backing-Store ist Supabase **Storage**, die „Zeilen" sind ein `const SLOT_IDS`-Array. **Keine ID zum Routen.** | — | — |
| `admin/abrechnungen` | Abrechnung | MODAL 672 | ⏭ **eigener PR** — s. `docs/superpowers/2026-07-14-HANDOFF-abrechnungen-konsolidierung.md` (geldkritisch + doppelte Oberfläche) | P1b | — |
| `gutachter/team` | Sub-SV | NONE | **NEU** `/[id]` | P2 | — |
| `admin/team/[id]` | Mitarbeiter | bespoke | → Shell (no tabs) | P2 | ✅ **gebaut** |
| `dispatch/sachverstaendige/[id]` | SV | kein Wrapper | → Shell, **read-only + separat** (NICHT admin-SV reusen: exponiert sonst Billing/Verif-Doks an Dispatcher) | P2 | ✅ **gebaut** |
| `dispatch/gutachter-finder/[id]` | Finder-Anfrage | bespoke | → Shell (no tabs; Status-Workflow im Body) | P2 | ✅ **gebaut** |
| `admin/sachverstaendige/[id]` | SV | eigene Tabs+Drawer | ✅ auf `EntityDetailShell` | P0 | ✅ **gebaut** |

> **Korrektur zur „3 SV-Varianten zusammenführen"-Prämisse:** `SachverstaendigeList` wird **nicht mehr von Admin genutzt** (Admin-SV = Mapbox-Live-Ops-Karte → Pin → Drawer, AAR-151). Einziger Konsument = die Dispatch-Liste. Admin-SV-Detail (reich, editierbar) und Dispatch-SV-Detail (read-only, rollen-beschränkt) sind **bewusst zwei Views** — keine Zusammenführung nötig/gewollt.
> **Scope P2:** Chrome-Swap (Shell) für alle drei, **keine Drawer** (Dispatch ist drawer-frei; Full-Page ist bei edit/workflow-lastigen Details das richtige Affordance). Drawer = trivialer Rezept-Follow-up.
| `admin/{sla,reklamationen,statistiken,kanzlei-board}` | — | Doppel-Route | Redirect standalone → `(hub)` | P4 | — |
| `admin/{tasks,meine-tasks,aufgaben/*}` | Task | Wildwuchs | konsolidieren | P4 | — |
| `/admin` vs `/admin/faelle` | — | Cockpit-Doppel | entwirren | P4 | — |

**DDL-Erwartung:** P1/P2 = **0 DDL** (reine SELECTs auf bestehende Tabellen, Admin-only, kein RLS-Rollen-Gate nötig). Falls doch eine rollen-aware View gebraucht wird → nur via Supabase-Plugin `apply_migration` (Regel 2), cross-lane an view-owner.

---

## 5. Phasen

### P0 — Shared Foundation *(meine Lane, kollisionsfrei)*
**Deliverables:** `EntityDetailShell`, `DrawerShell` (extrahiert nach `shared/detail/`), Intercepting-Rezept + Doku, Facade-Konvention (dokumentiert), **SV-Detail als Erst-Konsument** refactored (net-zero).
**DoD:** SV-Detail nutzt geteilte `DrawerShell` (+ optional `EntityDetailShell`-Chrome); `tsc` grün; 4 Ratchets 0-neu; CI-Build grün; SV-Detail Prod-Smoke unverändert.
**DDL:** keine.

### P1 — Cat B: neue Admin-Detailviews *(meine Lane, greenfield)*
Reihenfolge nach Wert (meiste verstreute Related-Daten zuerst):
1. **`organisationen/[id]`** — Tabs: Stammdaten / Mitglieder (SVs·Makler·Werkstätten der Org) / Fälle / Branding. (Heute komplett un-drillbar, aber zentrale Entität.)
2. **`versicherungen/[id]`** (Modal→Route+Drawer) — Tabs: Stammdaten / Fälle / Kürzungs-Statistik.
3. **`abrechnungen/[id]`** (Modal→Route+Drawer) — der 672px-Modal (Retry/Mark-Paid) wird Route+Drawer.
4. **`partner/[id]`**, **`vertraege/[id]`**, **`communities/[id]`**, **`embed-sites/[id]`** — je nach Feld-Umfang single-view oder Tabs.
Jede: Listen-Zeile → Intercept-Drawer → Deep-Link Full-Page auf `EntityDetailShell`; neue `getXDetail`-Facade; `revalidatePath`.
**DDL:** erwartet keine (pro Entität prüfen).

### P2 — Cat C: One-offs angleichen *(meine Lane, niedrige Kollision)*
`dispatch/sachverstaendige/[id]`, `dispatch/gutachter-finder/[id]`, `admin/team/[id]` auf `EntityDetailShell`; `admin/sachverstaendige/[id]` Tabs auf geteiltes Muster; **3 SV-Detail-Varianten zusammenführen** (analog zum bereits geteilten `SachverstaendigeList`: ein geteilter `SvDetail` mit role/basePath).
**DDL:** keine. **Kollision:** prüfen ob Dispatch-Lane aktiv (Marker).

### P3 — Cat A: Claim-Konvergenz *(⚠ koordiniert)*
`gutachter/fall/[id]` (→ `FallakteShell`), `kunde/faelle/[id]` (→ Provider/Shell, Kunde-Zonen erhalten), `makler/akten/[id]` (Facade → `getClaimDetail`), **`kanzlei/fall/[id]` NEU bauen** auf `FallakteShell` (rolle=kanzlei) + Mandate/Email-Link fixen.
**⚠ Koordination:** Lane 412850cd (kunde-detail-rebuild), ops-cockpit (470d55c9). Großteils = deren laufendes Programm (`PROGRAM-claim-case-management-map`). Diese Phase **verankert + sequenziert**, baut nicht parallel.
**DDL:** evtl. `getClaimDetail`/`v_claim_base`-Erweiterung für kanzlei-Rolle (cross-lane, view-owner).

### P4 — Cat D: Hub-Konsolidierung *(⚠ fremd-owned, referenziert)*
Standalone→`(hub)`-Redirects (Doppel-Routen entfernen), Task-Wildwuchs konsolidieren, `/admin` vs `/admin/faelle` entwirren.
**⚠ Ownership:** ops-cockpit-Lane (Fälle-Hub-Konvergenz F2/F3). Nur referenzieren/sequenzieren. Keine Detail-Views.
**DDL:** keine.

---

## 6. Anti-Kollision & Regel-Compliance
- Worktree `kitta/detail-view-konsistenz` off `staging`; PRs → `staging` → `main` (Release-Lane); **nie direkt `main`** (Regel 1).
- DDL (falls doch) **nur** via Supabase-Plugin `apply_migration` + File-Tracking (Regel 2). P1/P2 erwarten 0 DDL.
- Kein unbegleiteter Stash am Session-Ende (Regel 3).
- **15 Parallel-Sessions:** Marker `COORDINATION-detail-view-konsistenz` in `memory/`. P3/P4 überlappen aktive Lanes → dort Marker-Koordination + disjunkte Files.
- **Boy-Scout:** bei jedem angefassten File die `component-set`/`token-audit`/`knip`-Ratchets senken.
- **Component-Set-Pflicht:** `EntityDetailShell` + alle Sub-Views nutzen `primitives/*` + `shared/*` — keine handgerollten Buttons/Cards/Tables.
- **Umlaut-Pflicht:** alle neuen UI-Strings mit echten `ä/ö/ü/ß`.

## 7. Verifikation (pro Phase)
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (bekannte Worktree-Modul-Rausch-Fehler ignorieren).
- 4 Ratchets 0-neu (`check:component-set`, `check:token-audit`, `check:knip`, `check:flag-drift`).
- Route-Changes → **CI-Build** (Next-15-Validator findet Route/Layout-Fehler, die tsc nicht sieht; lokal nicht baubar).
- **Prod-Smoke via Playwright** NUR mit Test-Accounts (`PLAYWRIGHT_BASE_URL=https://app.claimondo.de`, `telefon=NULL`) — jede neue Detail-View einmal live drillen (Liste→Drawer→Deep-Link).

## 8. Offene Fragen / Risiken
- **Kanzlei-Detail:** eigene `/kanzlei/fall/[id]` bauen ODER `mandate`+`kanban` beide auf `/faelle/[id]` (rolle=kanzlei) umbiegen? → Entscheidung im P3-Plan.
- **`EntityDetailShell` vs `FallakteShell`-Grenze** (§3.7) → im P0-Plan festzurren.
- **Welche Cat-B-Entities brauchen wirklich Tabs?** organisationen/versicherungen ja; embed-sites/communities evtl. single-view → pro Entität im P1-Plan.
- **Drawer auf Mobile** = Full-Screen-Sheet? (`primitives/Drawer` prüfen.)
- **Prod-Cleanup 13.07.:** Test-Anker wurden gepurgt → Playwright-Seeds brauchen self-bootstrap (`COORDINATION-prod-golive-cleanup`).

## 9. Nächster Schritt
Pro Phase ein eigener Implementierungsplan (writing-plans) beim Aufgreifen. **P0 zuerst** — kleinste, entblockende Einheit. Dieses Dokument = Programm-Master; die Phasen-Pläne referenzieren es.
