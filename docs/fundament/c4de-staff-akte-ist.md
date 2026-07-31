# C4d/C4e · Ist-Erhebung — Staff-Fallakte (`/faelle/[id]` Tab-Sicht → `<FallAkte>`-Kern)

> Fundament Phase C, Paket **C4**, Tranchen **Kanzlei (C4d) + Admin/Dispatch (C4e)** (FUNDAMENT §5, Verfassung §4).
> **Ist-Erhebung**, noch NICHT der bite-sized `writing-plans`-Plan. Erhebung gegen `origin/staging` (file:line),
> Stand 31.07. Setzt `c4-eine-akte-plan.md`, `2026-07-31-fundament-c4a.md` (#4909), `c4b-sv-akte-ist.md`,
> `c4c-werkstatt-akte-ist.md` voraus.
>
> **Grundsatz-Entscheidungen (DECISIONS 31.07.) gelten:** Kern generalisieren (layout-Variante + Custom-Header-Slot +
> ReactNode-Blöcke) · Server-Kern + Client-Zonen · SV vor Werkstatt vor Staff. Die Staff-Tab-Sicht ist der **größte
> Sonderfall, zuletzt** — hier wird die **`layout="tabs"`-Variante** des Kerns gebaut (der 3. + komplexeste Layout-Modus).
>
> **Gating:** C4-Code auf **B1**/J4. Erhebung ungate-t (empirisch).

## 1 · Ist — die Staff-Sicht in Zahlen + Bau (die größte Rollen-Sicht)

Route `/faelle/[id]` — **eine rollen-adaptive Implementierung** für Admin · Dispatch · Kanzlei · Kundenbetreuer.

| Schicht | File | Z. | Rolle |
|---|---|---|---|
| **Server-Shell** | `src/app/faelle/[id]/page.tsx` | **1164** | Gate + rolle-Bestimmung + massives Daten-Assembly → `ShellProps` |
| **Client-Shell** | `FallakteShell.tsx` | 268 | `'use client'` — 3-Spalten-Layout + Tab-Controller |
| **Client-Context** | `FallContext.tsx` | 150 | `FallProvider` (fall/lead/claim/userRolle) |
| **6 Tabs** | `_tabs/` | Dokumente 546 · Übersicht 310 · Kommunikation 103 · Prozess 54 · Timeline 20 (+ Verlauf via shared `TimelineView`) | die Zonen (mutually-exclusive Panels) |
| **Sidebar** | `_sidebar/` | FallSidebar 127 · EskalationCard 180 · FallRueckrufSection 125 · QuickActions 93 | rechte Rollen-Aktions-Spalte |
| **Prozess/Stammdaten** | `_prozess/Sections` 729 · `_stammdaten/Sections` 501 | 1230 | die schwersten Zonen-Inhalte |
| **Rollen-Logik** | `_lib/permissions.ts` (98, `@deprecated` Wrapper) → **`@/lib/permissions`** (zentrale Matrix `can`/`canRead`/`canWrite`) | — | rollen-adaptive Sichtbarkeit |

**Gate + Rolle (page.tsx):** `createClient()` (RLS) → `profile.rolle` (:151) bestimmt `userRolle: FallakteRolle`. Das
**RLS-Gate `claim_sichtbar_fuer_aktuellen_user`** lässt admin/dispatch (immer) + kanzlei (`service_typ='komplett'`) +
KB (`kundenbetreuer_id=uid`) durch. **Read:** Mix `createClient` + mehrfach `createAdminClient`; teils `v_claim_full`
(:119) + Kanzlei-Queries (`getActiveKanzleiPaket`/…), roh `claims`/`fall_dokumente`/`profiles` + 7-Quellen-Event-Stream
+ Timeline. → schwerste C5-Baustelle.

## 2 · Mapping auf den `<FallAkte>`-Kern

| Kanon-Zone | Staff-Realisierung | Verhältnis zum Kern |
|---|---|---|
| **1 Kopf/Status** | `FallIdentityHeader` (shared) + `FallActionBar` + `FallStatusBadge` + `EndzustandDropdown`/`KanzleiWunschDropdown` (rolle-guarded) + `FallMitteilungenBanner` + `FallPhasenPanel` (aside) | rich Custom-Header (→ Header-Slot) |
| **2 Beteiligte** | `FallSidebar` (kundenbetreuer + sv) rechts | Team-Zone (rechte Spalte) |
| **3 Dokumente** | `DokumenteTab` (546 Z., QC/Filmcheck/Anforderung) | Zone = **eigener Tab** |
| **4 Kommunikation** | `KommunikationTab` (+ `TimelineTab`/Verlauf) | Zone = **eigener Tab** |
| **5 Rollen-Zone (Staff)** | `UebersichtTab` + `ProzessTab` (`_prozess/Sections` 729) + `_stammdaten/Sections` (Inline-Edit) + Sidebar-Aktionen (Eskalation/Rückruf/QuickActions) | die Staff-Werkbank (Prozess/QC/Regulierung) |

**Layout-Kern-Befund:** **Tab-Paradigma** (`FallakteShell:63-70` TABS-Array, `activeTab`-State + URL-`?tab=`-Sync,
`<FallakteTabs>` + `<TabDropContent>`). Die Zonen sind **mutually-exclusive Tab-Panels** (eine sichtbar), NICHT
columns-Masonry (alle sichtbar wie Kunde/Werkstatt). 3-Spalten-Rahmen: `<aside>` Phasen · `<main>` Tabs · `<FallSidebar>`.

## 3 · Divergenz vom Kern — die GRÖSSTE, aber viel ist schon shared

Die neuen Achsen ggü. Kunde/SV/Werkstatt:
1. **`layout="tabs"` (neuer, 3. Layout-Modus):** Zonen als **umschaltbare Tab-Panels** (nicht alle-sichtbar). Braucht
   einen **Client-Tab-Controller** (`activeTab` + URL-Sync) — das ist die „Client-Zone/-Chrome"-Seite der DECISIONS-3
   (Server-Kern rendert die Panels, ein Client-Chrome schaltet). Plus 3-Spalten-Rahmen (aside + main + sidebar).
2. **Rollen-Adaptivität (4 Rollen in EINER Sicht):** admin/dispatch/kanzlei/KB — gesteuert über `userRolle` +
   die **zentrale Matrix `@/lib/permissions`**. Im Config-Modell: `config.zones(vm, rolle)` + Zonen self-gaten via Matrix.
3. **Massives Server-Assembly** (1164 Z.) — der schwerste Read-Pfad (C5).

**ABER — viel ist bereits als shared Component gebaut** (der Kern formalisiert es nur): `FallakteTabs`
(Kommentar `:232`: „gleiches Component wie SV-Fallakte und Kunde-Fallakte"), `FallIdentityHeader`, `FallRealtimeRefresh`,
`TimelineView`, `FallPhasenPanel`, `FallMitteilungenBanner`, die Status-/Endzustand-Dropdowns (`@/components/shared/claims`).
→ Der Staff-Kern ist zu großen Teilen schon aus geteilten Bausteinen zusammengesetzt; C4d/e hebt die **Shell + Zonen-
Zuordnung** auf `<FallAkte layout="tabs">`, nicht die einzelnen Bausteine.

## 4 · Kern-Befund — C4d + C4e sind EINE Tranche (nicht zwei)

`c4-plan §4` listete **C4d Kanzlei** + **C4e Admin/Dispatch** als getrennte Tranchen. Der Ist widerlegt die Trennung:
beide (plus Dispatch + KB) laufen über **dieselbe** `/faelle/[id]`-Implementierung, rollen-adaptiv via `userRolle` +
`@/lib/permissions`. Es gibt **keinen** getrennten Kanzlei-Code. → **Empfehlung: C4d + C4e zu EINER Tranche „Staff-
Tab-Sicht" zusammenlegen** (eine Migration deckt alle 4 Staff-Rollen ab). Das ist die letzte + größte C4-Tranche und
baut die `layout="tabs"`-Variante — danach ist der `<FallAkte>`-Kern in allen 3 Layout-Modi (columns/sidebar/tabs) belegt.

## 5 · Tranchen-Skizze Staff (letzte C4-Tranche, nach Kunde/SV/Werkstatt)

1. **`layout="tabs"`-Variante bauen** (die einzige neue Kern-Fähigkeit): 3-Spalten-Rahmen (aside-Slot Phasen · main
   Tab-Controller · sidebar-Slot Team/Aktionen) + Client-Tab-Controller (`activeTab` + `?tab=`-Sync) über
   server-gerenderten Tab-Panels. Header-Slot + ReactNode-Blöcke (Mitteilungs-Banner) sind schon aus C4b/c da.
2. **Staff-Config + Adapter:** `FallakteShell` → dünner Adapter auf `<FallAkte layout="tabs" header={<FallIdentityHeader…>}
   config={staffConfig}>`. `staffConfig.zones(vm, rolle)` = die 6 Tabs, rollen-gefiltert (Matrix); `zoneComponents` =
   die bestehenden `_tabs/*` (unverändert); `aside`=`FallPhasenPanel`, `sidebar`=`FallSidebar`.
3. **DoD:** `/faelle/[id]` rendert über `<FallAkte>`; Tab-/URL-Sync + 3-Spalten-Layout + alle Rollen-Gates (Matrix)
   unverändert; Alt-Shell-Gerüst entfernt; Staff-Journey-Smoke grün (B1, J10 Dispatch-Ausnahmen + J6 Kanzlei-Übergabe);
   knip-Baseline sinkt. **Regression-Fokus §7:** admin/dispatch/kanzlei/KB je eigene Sichtbarkeit bleibt exakt.

## 6 · Offene Punkte (→ C4-Plan, kein DECISIONS-Blocker)

1. **C4d+C4e zusammenlegen** (§4): Empfehlung ja — eine rollen-adaptive Tranche. Bei C4-Plan bestätigen.
2. **`_lib/permissions.ts`** ist ein `@deprecated`-Wrapper auf `@/lib/permissions` — Boy-Scout beim Anfassen auf die
   zentrale Matrix migrieren (tangential zu C4, nicht blockierend).
3. **Read-Pfad (1164 Z.)** = C5-Domäne (nicht C4): die C4-Tranche fasst den Read NICHT an, nur die Shell/Zonen-Zuordnung.

## 7 · Nicht-Ziele
Kein visuelles Redesign; keine neuen Staff-Features; keine Gate-/RLS-/Read-Pfad-/Matrix-Änderung (C5 bzw. eigene Lane);
keine Änderung der Rollen-Sichtbarkeit (byte-genau erhalten). Mit dieser Erhebung ist die **C4-Ist über alle 5 Rollen
komplett** (Kunde-Prototyp + SV + Werkstatt + Staff) — es fehlt nur noch der C4-**Code** (gated auf B1/J4).
