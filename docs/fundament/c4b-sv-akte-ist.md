# C4b · Ist-Erhebung — SV-Fallakte (`FallDetailClient` → `<FallAkte>`-Kern)

> Fundament Phase C, Paket **C4**, Tranche **SV** (FUNDAMENT §5, Verfassung §4 „Eine Akte, viele Sichten").
> **Ist-Erhebung — noch NICHT der bite-sized `writing-plans`-Plan.** Erhebung gegen `origin/staging` (file:line),
> Stand 31.07. Setzt `c4-eine-akte-plan.md` (C4-Gesamt-Ist + Kern-Design) + `2026-07-31-fundament-c4a.md` (Kunde-Kern,
> #4909 gemergt) voraus.
>
> **Gating:** C4-**Code** ist per §2-Deps auf **B1** (J1+J4-Journey-Smokes) gegated. Diese Erhebung ist **ungate-t**
> (Ist-Bestand ist empirisch). Sie beantwortet die offene §6-Q2 der C4-Doc (SV vs Werkstatt — kleinerer Sonderfall)
> und readyt die SV-Tranche.

## 1 · Ist — die SV-Sicht in Zahlen + Bau

Route `/gutachter/fall/[id]` (fall_id == claim_id, claim-first). **Zwei-Schicht-Bau: Server-Shell → Client-Body.**

| Schicht | File | Z. | Rolle |
|---|---|---|---|
| **Server-Shell** | `src/app/gutachter/fall/[id]/page.tsx` | 723 | Gate + ~15-Tabellen-Read + `topServerBlocks`-Assembly |
| **Client-Body** | `.../FallDetailClient.tsx` | 506 | `'use client'` — Layout + Interaktivität + SV-Core |
| **Sub-Route** | `.../stellungnahme/{page,StellungnahmeClient,actions}.ts` | 111+275+150 | SV-Stellungnahme (eigener Flow) |
| **Actions** | `.../actions.ts` + `_actions/*` | 884 + 130 + 91 | Server-Actions (Gutachten-Upload, Konfrontation, SV-Rechnung) |
| **`_components/`** | FallakteDrawer 422 · GutachtenCard 296 · GutachtenWerteCard 167 · LeadAblehnenCard 127 · SvRechnungUploadModal 93 · AnsprechpartnerCard 81 · FinNachtragenCard 70 · AnspruchVorschauCard 64 · FallHeader 55 · VorOrtTriggerCard 45 | ~1220 | SV-eigene Karten |

**Gate (page.tsx):** `getSvForUser → notFound` (:48) · `getFallForSv` sv_id-Defense-in-Depth `→ notFound` (:54) ·
**`if (!sa_unterschrieben) notFound()`** (:60) — der SV-spezifische Unlock über das gemeinsame
`claim_sichtbar_fuer_aktuellen_user`-Gate hinaus. Bleibt (C5-Domäne, nicht C4).

**Server-Reads (page.tsx):** Mix `createClient()` (RLS, :41) **und** `createAdminClient()` (service-role, :79) über
~15 Tabellen/Views — teils schon die View-Schicht (`v_claim_full` :157, `v_gutachten_werte` :454, `faelle_sv_view`
:189), teils roh (`claims`, `fall_dokumente`, `gutachter_termine`, `nachrichten`, `kanzlei_faelle`, `forderungspositionen`, …).
→ Der Read-Pfad ist **C5-Baustelle** (Server-first-Zugriff, `v_claim_full`-Konsolidierung), nicht C4.

## 2 · Mapping auf den `<FallAkte>`-Kern (die 5 Zonen aus `c4-plan §2`)

| Kanon-Zone | SV-Realisierung | Verhältnis zum Kunde-Prototyp |
|---|---|---|
| **1 Kopf/Status** | custom `FallHeader` (sticky, mit **Akte-Drawer**) + `AuftragHeaderPanel` (Stepper+Termin, phasen-gated) + `MeinFallStatusCard` (in `topServerBlocks`) | **divergent** — nicht `PageHeader`+`StatusZone`; SV-Header trägt einen Full-Screen-Drawer (Dateien/Timeline/Chat) |
| **2 Beteiligte** | `AnsprechpartnerCard` (team[]: KB/Kanzlei/Kunde) | **deckungsgleich** mit `TeamZone` (gleiches Datum) |
| **3 Dokumente** | `WeitereDokumenteCard` + `GutachtenCard` + `StammdatenAccordion.dokumenteAnzahl`; Filter `getSichtbarFuerRolle(…, 'sachverstaendiger')` | **teils** — Doc-Sichtbarkeits-Filter ist der geteilte Kern; Darstellung SV-eigen |
| **4 Kommunikation** | `ClaimChatPanel istStaff={false}` | **identische Komponente** wie `/faelle/[id]`-Kommunikation-Tab → schon geteilt |
| **5 Rollen-Zone (SV)** | Gutachten-Upload (`GutachtenCard`) + `GutachtenWerteCard` (OCR) + `GutachterCopilotPanel` (KI) + Stepper/Termin + Geo (`useGeoTracking`/`SvUnterwegsInfo`) + `KonfrontationsTerminCard` + `FinNachtragenCard` + `vorOrtCard` + Stellungnahme-Sub-Route | **der große Sonderfall** (~60 % der Sicht) |

**Geteilt (real):** `FallRealtimeRefresh` (identisch zu Kunde) · `ClaimChatPanel` · das Team/Beteiligte-Datum ·
der Doc-Sichtbarkeits-Filter. **Divergent:** Header (Drawer statt PageHeader) · Layout · die SV-Core-Zone · der
Server/Client-Bridge.

## 3 · Die drei harten Divergenzen vom c4a-Kern (der Migrations-Kern von C4b)

Der c4a-`<FallAkte>` (aus dem Kunde-Prototyp extrahiert) ist **Server-Component**, `mx-auto max-w-xl lg:max-w-5xl`
**`lg:columns-2`**-Masonry, Zonen mit `id="zone-<key>"`, Header = `(vm) => {title, description}`. Die SV-Sicht bricht
das an **drei** Achsen:

1. **Client-Tree statt Server-Component.** `FallDetailClient` ist `'use client'` (`useState` für Drawer, `useGeoTracking`).
   Der Kunde-Kern rendert Server-Zonen. → Der Kern muss **Client-Zone-Komponenten hosten** (der generische `<Vm>`-Container
   kann das prinzipiell, aber die c4a-Extraktion hat es nur mit Server-Zonen belegt).
2. **Layout-Variante.** SV = sticky-Header + **volle-Breite-Blöcke** (Stepper/Termin, topServerBlocks, Konfrontation,
   Gutachten/Werte/Copilot/Chat) + **`grid-[1fr_320px]`-Sidebar** (Stammdaten | Doks/Ansprechpartner). Das ist **nicht**
   die `columns-2`-Masonry. → Der Kern braucht eine **`layout`-Variante** (`columns` | `sidebar` | später `tabs`) statt
   eines fixen Zonen-Flows.
3. **Server-Block-Bridge.** `page.tsx` komponiert `topServerBlocks` + `vorOrtCard` als **server-gerenderte ReactNode**
   und injiziert sie als Props (`:688`). Der Kunde-Kern kennt keine server-injizierten Blöcke. → Der Kern braucht
   **ReactNode-Slots** (`headerExtras`/`topBlocks`/`footer`), damit der Server-Teil erhalten bleibt.

Zusätzlich: der **Header ist ein Custom-Slot** (der `FallHeader` mit Drawer), nicht `{title, description}`. Der
`config.header`-Vertrag aus c4a muss von „Titel/Beschreibung" auf „optionaler Custom-Header-ReactNode" erweitert werden.

## 4 · §6-Q2 beantwortet — SV vs Werkstatt: **Werkstatt ist der kleinere Sonderfall**

Direkter Vergleich (beide sind `'use client'`, beide custom):

| | **SV** (`FallDetailClient`) | **Werkstatt** (`WerkstattAuftragDetail`) |
|---|---|---|
| Client-Hooks | `useGeoTracking` + `useState`(Drawer) | nur `useState` (KVA-Modal) |
| Layout | Sidebar-Grid + viele Full-Width-Blöcke | **linearer Stack** aus 5 Sektionen (Reparaturtermin/Gutachten/Besichtigung/KVA) |
| Server-Block-Bridge | ja (`topServerBlocks`+`vorOrtCard`) | **nein** |
| Custom-Header-Drawer | ja (`FallakteDrawer` 422 Z.) | **nein** |
| KI-Copilot / Geo / Sub-Route | ja / ja / Stellungnahme | **nein / nein / nein** |
| Detail-Roh-Zeilen | 506 (client) + 723 (server) | 769 (aber strukturell flach) |

**Befund:** Werkstatt hat zwar mehr Roh-Zeilen im Detail-File, aber **strukturell** die geringste Divergenz zum
Zonen-Kern (linearer Sektionen-Stack ≈ Zonen-Flow, keine Geo/Drawer/Copilot/Server-Bridge). Nach FUNDAMENT §5
(„kleinste Sonderfälle zuerst") ist die **empfohlene Reihenfolge: Werkstatt VOR SV** — d.h. die tentative
`c4-plan §4`-Zuordnung (C4b=SV, C4c=Werkstatt) **umdrehen** (C4b=Werkstatt, C4c=SV). Grund: Werkstatt validiert die
Kern-Generalisierung (Layout-Variante + Custom-Header-Slot) am **einfacheren** View; SV (mit Client-Tree +
Server-Bridge + Sub-Route) baut dann auf einem bereits an der Realität gehärteten Kern auf.
**→ Aaron 31.07. wählte dennoch SV-zuerst** (Roadmap-Priorität); die Größen-Analyse bleibt als Evidenz (§6).

## 5 · Tranchen-Skizze SV (nach der Kern-Generalisierung)

1. **Kern-Generalisierung (fällt in C4a-Ausführung ODER die erste Custom-Tranche):** `<FallAkte>` um (a) `layout`-Variante
   (`columns` | `sidebar`), (b) optionalen **Custom-Header-Slot** (ReactNode statt nur `{title,description}`),
   (c) **ReactNode-Blöcke** (`topBlocks`/`footer` für server-injizierte Inhalte), (d) explizit **Client-Zone-Support**
   erweitern. **Feed-Forward:** diese Nähte schon bei der C4a-Kunde-Ausführung offen lassen (Kunde nutzt nur `columns` +
   `{title,description}`), damit SV/Werkstatt später **keinen** Kern-Refactor erzwingen.
2. **SV-Config + Adapter:** `FallDetailClient` wird dünner Adapter auf `<FallAkte layout="sidebar" header={<FallHeader…/>}
   topBlocks={topServerBlocks} footer={vorOrtCard} config={svConfig}>`. `svConfig.zones` = die SV-Zonen-Reihenfolge
   (Stepper/Termin · Stammdaten|Doks-Sidebar · Gutachten · Werte · Copilot · Chat); `zoneComponents` = die bestehenden
   SV-Karten (unverändert). **Byte-nahe** Ausgabe (kein visueller Umbau).
3. **DoD:** `/gutachter/fall/[id]` rendert über `<FallAkte>`; DOM/Layout/`sa_unterschrieben`-Gate unverändert; Alt-Shell
   (das Layout-Gerüst in `FallDetailClient`) entfernt; SV-Journey-Smoke grün (B1); die 13 `_components/`-Karten bleiben
   (via config referenziert); knip-Baseline sinkt.

## 6 · Entscheidungen (Aaron 31.07., AskUserQuestion → `DECISIONS.md`)

1. **Reihenfolge SV vs Werkstatt (§6-Q2): ENTSCHIEDEN — SV VOR Werkstatt** (C4b=SV, C4c=Werkstatt). Aaron überstimmte
   die Werkstatt-zuerst-Empfehlung (§4): der größere Sonderfall (SV) härtet die Kern-Generalisierung zuerst.
2. **Kern-Generalisierung vs Shell-Behalt: ENTSCHIEDEN — Kern generalisieren.** `<FallAkte>` wächst um layout-Variante
   (`columns`/`sidebar`/`tabs`) + Custom-Header-Slot + server-injizierte ReactNode-Blöcke → alle 5 Rollen echt über den
   Kern (C4-DoD). Feed-Forward: die Nähte schon bei der C4a-Kunde-Ausführung offen lassen.
3. **Client/Server-Grenze: ENTSCHIEDEN — Server-Kern + Client-Zonen.** Der `<FallAkte>`-Kern bleibt Server-Component;
   Interaktivität (Geo/Drawer/Modal) lebt in den (Client-)Zone-Komponenten + ReactNode-Slots. Kunde/Staff behalten RSC.

→ Verankert in `DECISIONS.md` (3× `2026-07-31 · C4`).

## 7 · Nicht-Ziele
Kein visuelles Redesign (Token/Primitives + Look identisch); keine neuen SV-Features; keine Gate-/RLS-/Read-Pfad-Änderung
(`sa_unterschrieben`-Gate + der 15-Tabellen-Read sind C5-Domäne); **kein** Anfassen der Sub-Route `stellungnahme/` in der
ersten SV-Tranche (eigener Flow, folgt separat).
