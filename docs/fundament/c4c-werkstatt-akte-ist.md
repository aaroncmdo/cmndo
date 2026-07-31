# C4c · Ist-Erhebung — Werkstatt-Fallakte (`WerkstattAuftragDetail` → `<FallAkte>`-Kern)

> Fundament Phase C, Paket **C4**, Tranche **Werkstatt** (FUNDAMENT §5, Verfassung §4). **Ist-Erhebung**, noch NICHT
> der bite-sized `writing-plans`-Plan. Erhebung gegen `origin/staging` (file:line), Stand 31.07. Setzt
> `c4-eine-akte-plan.md`, `2026-07-31-fundament-c4a.md` (#4909, Kunde-Kern) + `c4b-sv-akte-ist.md` (SV) voraus.
>
> **Reihenfolge (DECISIONS 31.07.):** SV VOR Werkstatt → **Werkstatt = C4c** (nach C4b-SV). Kern-Generalisierung
> (layout-Variante + Custom-Header-Slot + ReactNode-Blöcke) + Server-Kern + Client-Zonen sind **entschieden**
> (`DECISIONS.md` 3× `2026-07-31 · C4`); diese Erhebung nutzt sie als gesetzt.
>
> **Gating:** C4-Code auf **B1**/J4. Erhebung ist ungate-t (empirisch).

## 1 · Ist — die Werkstatt-Sicht in Zahlen + Bau

Route `/werkstatt/auftraege/[claimId]` (Route-Group `(shell)`). **Sauberer Zwei-Schicht-Bau — deutlich schlanker als SV.**

| Schicht | File | Z. | Rolle |
|---|---|---|---|
| **Server-Shell** | `src/app/werkstatt/(shell)/auftraege/[claimId]/page.tsx` | **50** | Gate + view-backed Read (`Promise.all`) → Props |
| **Client-Body** | `src/components/werkstatt/WerkstattAuftragDetail.tsx` | 769 | `'use client'` — Header + Info-Karten + Interaktiv-Segment + Copilot/Chat |
| **Separate Route (out-of-scope)** | `src/app/werkstatt/(shell)/kva/page.tsx` (`WerkstattKvaFlow` 486 Z.) | — | Full-Page-KVA-Upload — **eigener Flow**, nicht Teil der Akte (analog SVs `stellungnahme/`) |

**Gate (page.tsx):** `getWerkstattByUserId → redirect('/login')`; `getWerkstattAuftrag(claimId)` via **`v_werkstatt_auftrag`**
(RLS `is_werkstatt_for_claim`) → null → `notFound()` (kein IDOR). **KEIN Extra-Unlock** (anders als SVs `sa_unterschrieben`).
**Read-Pfad ist schon C5-konform:** alles über Query-Helper (`@/lib/werkstatt/queries`) + Views (`v_werkstatt_auftrag`,
`v_claim_full` für `extra`) — **kein** 15-Tabellen-Inline-Mix wie bei SV. Props an den Body: `auftrag` · `extra` ·
`chatMessages` · `chatRealtime{fallId,gruppeThreadId}` · `currentUserId` (schlanke Fläche).

## 2 · Mapping auf den `<FallAkte>`-Kern (die 5 Zonen)

| Kanon-Zone | Werkstatt-Realisierung | Verhältnis zum Kern |
|---|---|---|
| **1 Kopf/Status** | **Inline-`<header>`** (`h1`=claim_nummer + StatusBadge(abrechnungsweg) + Vermittlungs-Provision-Badge + kundeName + fahrzeug/kennzeichen) + `istFrueh`-Status-Karte | **Kunde-nah** — passt fast direkt auf `header:(vm)=>{title,description}` + Badge-Slot; **kein** Custom-Drawer wie SV |
| **2 Beteiligte** | `SectionCard "Ansprechpartner"` (Kunde/Betreuer/Gutachter, tel/mail) | deckungsgleich mit `TeamZone` |
| **3 Dokumente/Info** | `SectionCard` Fall · Fahrzeug&Unfall · Schadensfotos · Vorschäden (aus `extra`=`v_claim_full`) | Info-Zone (Stammdaten-analog) |
| **4 Kommunikation** | `WerkstattChatTab` + `WerkstattCopilotPanel` | Chat geteiltes Muster (wie SV/Kunde) |
| **5 Rollen-Zone (Werkstatt)** | **segment-gated** (`werkstattAuftragSegment`): `reparatur` → `KvaSektion`+`ReparaturterminSektion`(+`Besichtigung`+`Gutachten` wenn `zeigtGutachten`), sonst `vermittlung` → „Meine Vermittlung"-Karte (Provision) | der Werkstatt-Sonderfall — **kleiner** als SVs (2 Segment-Varianten, 4 Karten) |

**Layout-Kern-Befund:** Die Info-Karten (Zone 2+3) liegen bereits in **`lg:columns-2`-Masonry** (`WerkstattAuftragDetail:548`)
— **identisch zur c4a-`<FallAkte>`-Shell** (Kunde `lg:columns-2`). Darunter volle Breite: Interaktiv-Segment + Copilot + Chat.

## 3 · Divergenz vom Kern — Werkstatt divergiert MINIMAL (vs SV)

Gegen die 3 SV-Divergenzen (`c4b §3`) gehalten:

| Achse | SV | **Werkstatt** |
|---|---|---|
| Client-Tree | tief (Geo-Hook + Drawer) | **flach** (nur KVA-Modal-`useState`) |
| Layout | fixe Sidebar (`grid-[1fr_320px]`) | **`columns-2`** (= Kern-Default) + Full-Width-Blöcke |
| Server-Block-Bridge | ja (`topServerBlocks`/`vorOrtCard`) | **nein** |
| Custom-Header | ja (`FallHeader`+Drawer 422 Z.) | **nein** (Inline-`{title,description,badges}`) |
| Read-Pfad | 15-Tabellen-Inline-Mix | **view-backed** (`v_werkstatt_auftrag`/`v_claim_full`) |
| Extra-Unlock | `sa_unterschrieben` | **keiner** |

→ **Werkstatt nutzt die (für SV nötige) Kern-Generalisierung fast geschenkt:** `layout="columns"` (schon so) +
Full-Width-Zone (der ReactNode-Block-Mechanismus aus C4b) + der einfache `{title,description}`+Badge-Header. Kein
neuer Kern-Bedarf über C4b hinaus. **Bestätigt §6-Q2 / DECISIONS:** Werkstatt ist der kleinste Custom-Sonderfall
(SV-zuerst-Entscheid bleibt Roadmap; Werkstatt profitiert vom bereits gehärteten Kern).

## 4 · Tranchen-Skizze Werkstatt (C4c, nach C4b-SV)

1. **Kern steht bereits** (aus C4a+C4b): `<FallAkte>` mit `layout`-Variante + Header-Slot + Full-Width-ReactNode-Zonen.
   Werkstatt braucht **keine** neue Kern-Fähigkeit.
2. **Werkstatt-Config + Adapter:** `WerkstattAuftragDetail` → dünner Adapter auf `<FallAkte layout="columns"
   header={{title:auftrag.claim_nummer, description:kunde/fahrzeug, badges:[typ, provision?]}} config={werkstattConfig}>`.
   `werkstattConfig.zones` = Info-Karten (columns) → Interaktiv-Segment (full-width, segment-gated) → Copilot → Chat.
   `zoneComponents` = die bestehenden `SectionCard`/`KvaSektion`/`…` (unverändert). Der `segment`-Gate
   (`reparatur` vs `vermittlung`) bleibt in `werkstattConfig.zones(vm)` (phasen-adaptiv, wie `deriveKundeZonen`).
3. **DoD:** `/werkstatt/auftraege/[claimId]` rendert über `<FallAkte>`; DOM/`columns-2`-Layout/Gate unverändert;
   Alt-Layout-Gerüst aus `WerkstattAuftragDetail` entfernt; die Sektionen/Cards bleiben (via config); Werkstatt-Journey-
   Smoke grün (B1, J4-Reparaturweg deckt KVA/Termin ab); knip-Baseline sinkt.

## 5 · Offene Punkte (klein — → C4c-Plan, kein DECISIONS-Blocker)

1. **`segment`-Varianz (reparatur/vermittlung):** die Rollen-Zone hat ZWEI Ausprägungen (Reparatur-Auftrag vs reine
   Vermittlung). Sauber über `zones(vm)` abbildbar (wie Kunde phasen-adaptiv) — kein Kern-Bedarf, nur Config-Logik.
2. **`WerkstattKvaFlow` (`/werkstatt/kva`)** bleibt **out-of-scope** der Akte-Tranche (eigener Full-Page-Flow, wie SVs
   `stellungnahme/`). Nur die **In-Akte-KVA** (`KvaSektion`-Modal) ist Teil der Werkstatt-Zone.

## 6 · Nicht-Ziele
Kein visuelles Redesign; keine neuen Werkstatt-Features; keine Gate-/RLS-/Read-Pfad-Änderung (der Read ist schon
view-backed — C5-konform, bleibt); **kein** Anfassen von `/werkstatt/kva`. Werkstatt ist die **letzte kleine** Custom-
Tranche vor Kanzlei/Admin (Tab-Sicht, größter Sonderfall, zuletzt).
