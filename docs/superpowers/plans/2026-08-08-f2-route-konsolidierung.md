# F2 Route-Konsolidierung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or executing-plans. Steps use checkbox (`- [ ]`) tracking. Routing changes have NO unit tests → the gate is `npm run build` + `check:redirect-stubs` + a **Regel-4 Prod-Playwright-Smoke of every affected route + soft-nav drawer** (routing bugs only surface at runtime).

**Goal:** Pro Partner-Typ (SV, Werkstatt) EINE kanonische Detail-Route unter `/admin/vertrieb/*` — die `/admin/*`-Legacy-Detail-URLs per `next.config.ts`-Redirect (308) auf die kanonische umleiten, alle Consumer-Links + `revalidatePath` auf die kanonische ziehen, console-in-place-UX erhalten.

**Architektur:** Der Content lebt physisch unter `admin/sachverstaendige/[id]/` bzw. `admin/werkstaetten/[id]/` (co-lokalisierte Client/Actions). Aktuell rendert die vertrieb-Route via 1-Zeilen-**Re-Export**; die Legacy-URL rendert dieselbe Seite direkt + hat einen `@drawer/(.)[id]`-Soft-Nav-Intercept. Ziel: die Content-Page-Datei umbenennen (raus aus dem Route-Slot), die **vertrieb**-Route zur echten Route machen, die Legacy-URL redirecten.

**Tech Stack:** Next.js 15 App Router (Parallel/Intercepting Routes `@drawer/(.)`, `next.config.ts` `redirects()`), TypeScript.

## ⚠️ OFFENE PRODUKT-ENTSCHEIDUNG (vor Task 3/6 klären mit Aaron)
Der **Soft-Nav-Drawer** (`admin/sachverstaendige/@drawer/(.)[id]` → wrappt die Detail-Page in `DrawerShell`) hängt an der **Legacy-Liste** (`/admin/sachverstaendige`). Die vertrieb-Konsole hat **keinen** Detail-Drawer (dort Full-Page). Bei „vertrieb canonical + Legacy [id] redirectet":
- **Option 3a (empfohlen, kleiner):** Legacy-Liste `/admin/sachverstaendige` BLEIBT als Roster, ihr `@drawer/(.)[id]` wird **entfernt** → Row-Klick redirectet zur vertrieb-Full-Page-Akte. Der Legacy-Drawer entfällt (leichte UX-Änderung auf der Legacy-Liste).
- **Option 3b (größer):** Den Drawer NACH vertrieb ziehen (`admin/vertrieb/sachverstaendige/@drawer/(.)[id]` + `@drawer`-Slot im vertrieb-Listen-Layout) → Drawer-UX bleibt, aber unter dem vertrieb-Dach. Deutlich mehr Arbeit + Layout-Eingriff.
Default dieses Plans = **3a**. Bei 3b Tasks 3+6 erweitern.

## Global Constraints
- Regel 1: Branch `kitta/f2-route-konsolidierung` (off staging), PR gegen **staging**, kein Direct-Push main.
- Regel 4: nach Deploy vollständiger Prod-Playwright-Smoke (Test-Konten, 0 Residue) — **jede** betroffene Route (Full-Page + Redirect + Soft-Nav-Drawer).
- **Redirect-Stub-Gate:** KEINE reine `redirect()`-`page.tsx` (React #310) → Redirects NUR über `next.config.ts` `redirects()` + die alte `page.tsx` löschen/umbenennen.
- **:id-Regex Pflicht:** `/admin/sachverstaendige/:id` würde die Geschwister `anlegen`/`basic-freigaben`/`leads` fangen; `/admin/werkstaetten/:id` würde `qr-pool` fangen. Source MUSS die dynamische Segment-Form einschränken, z.B. `/admin/sachverstaendige/:id([0-9a-fA-F-]{36})` (UUID) — die IDs sind `gen_random_uuid()`-UUIDs.
- next.config `redirects()`-Muster: `{ source, destination, permanent: true }` (Bestand ~10 Einträge, `:id`/`:path*` + Regex bereits genutzt).
- Umlaute in nutzersichtbaren Strings; Server-Actions Result-Object; Component-Set/Token/Status-Ratchets grün.
- **Console-in-place bleibt erhalten** (deshalb vertrieb canonical, nicht Legacy).

## Topologie (Ist-Zustand, verifiziert 2026-08-08)
- **SV:** Content `admin/sachverstaendige/[id]/page.tsx` (+ co-lokalisiert: `SvDetailClient.tsx`, `actions.ts`, `verifizierung-actions.ts`, `VerifizierungsToggle.tsx`, `TestAccountToggle.tsx`, `test-account-actions.ts`, `page.tsx` hat `variant`-Prop für drawer). Legacy-Intercept `admin/sachverstaendige/@drawer/(.)[id]/page.tsx` importiert `../../[id]/page`. vertrieb `admin/vertrieb/sachverstaendige/[id]/page.tsx` = `export { default } from '@/app/admin/sachverstaendige/[id]/page'`. Geschwister (bleiben): `anlegen`, `basic-freigaben`, `leads`, Liste `page.tsx`.
- **Werkstatt:** Content `admin/werkstaetten/[id]/page.tsx` (+ `WerkstattDetailClient.tsx`, `actions.ts`, `detail-data.ts`). vertrieb `admin/vertrieb/werkstaetten/[id]/page.tsx` = Re-Export. KEIN Werkstatt-@drawer gefunden. Geschwister (bleiben): `qr-pool`, `qr-pool/drucken`, Liste.
- **Consumer (Navigation, Legacy → müssen auf vertrieb):**
  - SV `/admin/sachverstaendige/${id}`: `finance/(hub)/_views/PerSvBalanceView.tsx:133` · `organisationen/[id]/_tabs/MitgliederTab.tsx:43` · `tasks/KanbanBoard.tsx:129` · `vertrieb/wizards/BasisFreigabenDrawerContent.tsx:129` · `_components/AusstehendeZahlungenTable.tsx:142` · `_components/AusstehendeZahlungenWidget.tsx:77` · `_components/WerbebudgetAggregatWidget.tsx:103` · `_components/WichtigeUpdatesWidget.tsx:122,131,140` · `faelle/[id]/_sidebar/FallSidebar.tsx:113` · `components/live-ops/SvPopup.tsx:155`
  - Werkstatt `/admin/werkstaetten/${id}`: `werkstaetten/WerkstaettenClient.tsx:105` · `werkstaetten/WerkstattAnlegenForm.tsx:129` (router.push)
  - Self-Tabs (im Content, werden mit-umgezogen): `admin/sachverstaendige/[id]/page.tsx:40-42`
  - `revalidatePath`-Calls auf Legacy-Pfad (→ auf vertrieb ziehen ODER beide revalidieren): `sachverstaendige/[id]/actions.ts:135,171,296` · `test-account-actions.ts:38` · `verifizierung-actions.ts:48` · `lib/actions/sv-verifizierung-actions.ts:169,181` · `werkstaetten/[id]/actions.ts:68,96,134,194`
  - Bereits vertrieb (bleiben): `detail-link.ts`, `PartnerActionBar.tsx`, `partner-aktivitaet-actions.ts`, `vertrieb/live-ops/VertriebLiveOpsListe.tsx`, `vertrieb/drawer/PartnerCockpit.tsx`.

---

### Task 1: SV — Content-Page in einen importierbaren Component umbenennen

**Files:**
- Rename: `src/app/admin/sachverstaendige/[id]/page.tsx` → `src/app/admin/sachverstaendige/[id]/SvAkteContent.tsx` (default export bleibt die Server-Component; `variant`-Prop behalten). Co-lokalisierte Files (SvDetailClient/actions/…) NICHT bewegen (relative Imports bleiben intakt).
- Modify: `src/app/admin/sachverstaendige/[id]/page.tsx` existiert danach NICHT mehr (die Legacy-URL bekommt in Task 3 den Redirect).

- [ ] Step 1: `git mv src/app/admin/sachverstaendige/[id]/page.tsx src/app/admin/sachverstaendige/[id]/SvAkteContent.tsx`
- [ ] Step 2: In `SvAkteContent.tsx` die Self-Tab-hrefs (Z. ~40-42) von `/admin/sachverstaendige/${id}` auf `/admin/vertrieb/sachverstaendige/${id}` umstellen (die Tabs zeigen dann auf die kanonische Route).
- [ ] Step 3: Commit `refactor(f2): SV-Detail-Content in SvAkteContent umbenennen (raus aus dem Route-Slot)`.

### Task 2: SV — vertrieb-Route zur echten Route machen (Re-Export-Ziel umhängen)

**Files:** Modify `src/app/admin/vertrieb/sachverstaendige/[id]/page.tsx`

- [ ] Step 1: Re-Export-Ziel ändern von `@/app/admin/sachverstaendige/[id]/page` auf `@/app/admin/sachverstaendige/[id]/SvAkteContent`. `export const dynamic = 'force-dynamic'` behalten.
- [ ] Step 2: `npx tsc --noEmit` → 0 (verifiziert dass der neue Import-Pfad + alle SvAkteContent-Referenzen auflösen). Commit.

### Task 3: SV — Legacy-@drawer + Redirect (Option 3a)

**Files:**
- Delete: `src/app/admin/sachverstaendige/@drawer/(.)[id]/page.tsx` (importiert die umbenannte `../../[id]/page` → sonst Build-Fehler). Bei 3b stattdessen nach vertrieb ziehen.
- Modify: `next.config.ts` `redirects()`

- [ ] Step 1: Legacy detail-@drawer löschen. Prüfen ob `@drawer/default.tsx`/Slot-Layout auf der Legacy-Liste dadurch leer läuft — falls der `@drawer`-Slot NUR (.)[id] hatte, den Slot sauber lassen (default.tsx bleibt, rendert null).
- [ ] Step 2: In `next.config.ts` `redirects()` ergänzen: `{ source: '/admin/sachverstaendige/:id([0-9a-fA-F-]{36})', destination: '/admin/vertrieb/sachverstaendige/:id', permanent: true }`. (UUID-Regex → fängt NICHT anlegen/basic-freigaben/leads.)
- [ ] Step 3: `npm run build` grün + `npm run check:redirect-stubs` grün. Commit.

### Task 4: SV — Consumer-Links migrieren (Legacy → vertrieb)

**Files:** die 11 SV-Navigations-Consumer aus der Topologie-Liste (PerSvBalanceView, MitgliederTab, KanbanBoard, BasisFreigabenDrawerContent, AusstehendeZahlungenTable/Widget, WerbebudgetAggregatWidget, WichtigeUpdatesWidget ×3, FallSidebar, SvPopup).

- [ ] Step 1: Jeden Link `/admin/sachverstaendige/${x}` → `/admin/vertrieb/sachverstaendige/${x}`. (Nur Navigations-hrefs/router.push — NICHT die `constants`/`actions`-Imports, die zufällig „sachverstaendige" im Pfad haben.)
- [ ] Step 2: `revalidatePath`-Calls (actions.ts, test-account-actions, verifizierung-actions, lib/actions/sv-verifizierung-actions) auf `/admin/vertrieb/sachverstaendige/${svId}` umstellen (die Server-Component die die Zeile zeigt liegt jetzt dort). Bei Unsicherheit BEIDE Pfade revalidieren (Redirect macht Legacy eh leer, schadet nicht).
- [ ] Step 3: `grep -rn "/admin/sachverstaendige/\\${" src` → 0 verbleibende Navigations-Links (nur noch Redirect-Quelle + evtl. bewusste). `npm run build` grün. Commit.

### Task 5: Werkstatt — analog Task 1+2+3 (kein @drawer)

**Files:** rename `admin/werkstaetten/[id]/page.tsx` → `WsAkteContent.tsx`; vertrieb `werkstaetten/[id]/page.tsx` Re-Export-Ziel umhängen; next.config Redirect `/admin/werkstaetten/:id([0-9a-fA-F-]{36})` → vertrieb (UUID-Regex fängt NICHT qr-pool).

- [ ] Step 1: `git mv` + Re-Export umhängen + Self-Tabs (falls vorhanden) auf vertrieb. tsc grün.
- [ ] Step 2: next.config Redirect ergänzen (UUID-Regex). build + redirect-stubs grün. Commit.

### Task 6: Werkstatt — Consumer migrieren

**Files:** `werkstaetten/WerkstaettenClient.tsx:105` (row-href), `WerkstattAnlegenForm.tsx:129` (router.push nach Anlage), `werkstaetten/[id]/actions.ts` revalidatePath ×4.

- [ ] Step 1: hrefs/router.push → vertrieb. revalidatePath → vertrieb (oder beide). Step 2: `grep -rn "/admin/werkstaetten/\\${" src` → 0 Navigations-Links. build grün. Commit.

### Task 7: Voller Build + alle Ratchets + PR

- [ ] Step 1: `npm run build` + `check:redirect-stubs` + `check:component-set` + `check:knip` + `check:token-audit` grün.
- [ ] Step 2: PR gegen staging mit 7-Punkte-Audit + Regel-4-Smoke-Plan (unten).

### Task 8: Regel-4-Prod-Smoke (nach Deploy — Pflicht, das EINZIGE echte Gate für Routing)

- [ ] Anon-curl: `curl -sI https://app.claimondo.de/admin/sachverstaendige/<uuid>` → **308** nach `/admin/vertrieb/sachverstaendige/<uuid>`. Ebenso werkstatt.
- [ ] Negativ-Check: `/admin/sachverstaendige/anlegen`, `/basic-freigaben`, `/leads`, `/admin/werkstaetten/qr-pool` → **KEIN** Redirect (200/Login), Regex greift nicht fälschlich.
- [ ] Staff-Login: die kanonische vertrieb-Akte rendert voll (SV: Stammdaten/Verifizierung/Abrechnungen-Tabs + freischalten/sperren; Werkstatt: Verifizierung/Sperren). Self-Tabs navigieren korrekt.
- [ ] Consumer-Sprungpunkte: aus je 1 migriertem Consumer (z.B. WichtigeUpdatesWidget, FallSidebar, WerkstaettenClient-Zeile) → landet auf der vertrieb-Akte.
- [ ] Legacy-Liste `/admin/sachverstaendige` Row-Klick → (3a) Full-Page vertrieb-Akte, kein toter Drawer.
- [ ] Cockpit/detail-link „Vollständige Akte öffnen" → unverändert vertrieb (console-in-place intakt).
- [ ] Alte Bookmarks (Legacy-URL) → 308 → funktioniert.

## Self-Review-Notiz
- Kritische Fallen: (1) UUID-Regex im Redirect-source (sonst anlegen/qr-pool gefangen). (2) Legacy-@drawer-Delete sonst Build-Fehler (importiert umbenannte page). (3) `revalidatePath` auf toten Legacy-Pfad = No-op (Zeile aktualisiert nicht) → auf vertrieb ziehen. (4) NUR Navigations-hrefs migrieren, nicht `.../anlegen/constants`- oder `.../[id]/actions`-Import-Pfade. (5) Routing hat keine Unit-Tests → Task 8 Prod-Smoke ist zwingend.
