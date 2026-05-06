# Briefing für die Design-Review-Session (Claude Code)

Hi Claude, du übernimmst eine Design-Review für Claimondo (Next.js 16 / React 19 / Tailwind 4 / Supabase). Drei authenticated Portale + Public-Flow:

- **`/gutachter/**`** — Sachverständigen-Portal (operativer Tagesablauf)
- **`/dispatch/**`** — Lead-Verteilung an SVs
- **`/kunde/**`** — Endkunde nach Magic-Link-Login

## Was du vorfindest

```
docs/portals-review/
├── DESIGN-REVIEW-BRIEFING.md     ← du bist hier
├── audit-findings.md              ← Code-Audit (Funktional)
├── README.md                      ← Anleitung Toolkit
├── sv-walkthrough.md              ← SV-Architektur (32 Routen)
├── dispatch-walkthrough.md        ← Dispatch-Architektur (9 Routen)
├── kunde-walkthrough.md           ← Kunde-Architektur (15 Routen)
└── screenshots/
    ├── gutachter/   (50 PNGs)
    ├── dispatch/    (18 PNGs)
    └── kunde/       (16 PNGs)
```

Pro Portal je Route 2 PNGs: Desktop (1440×900) + Mobile (390×844).

## Dein Auftrag

Code-Bugs aus `audit-findings.md` werden separat gefixt. **Du fokussierst auf Visual + UX-Layer**:

### 1. Hierarchie & Visual-Weight pro Route

Sieh dir je Route Desktop + Mobile parallel an. Bewerte:
- **Was zieht den Blick zuerst?** Stimmt das mit der Aufgabe der Page überein? (z.B. Auftraege-Liste sollte primär die Aufträge zeigen, nicht das Wetter-Widget oben drüber.)
- **Hierarchie**: Heading → Subline → Action → Content sauber? Oder zerflattern Buttons + Cards ohne klares Lese-Pattern?
- **Empty-States**: rendert die Page bei leerer Datenlage hilfreich, oder zeigt sie nur ein Icon + Text? (Beispiel: `/gutachter/statistiken` zeigt nur „Statistiken werden gerade aufgebaut" mit viel Whitespace.)

### 2. Spacing + Alignment

- Werden Spacing-Tokens konsistent genutzt oder gibt's hardcodierte `mt-3`, `mb-4`, `p-2` mit zufälligen Werten?
- Card-Paddings konsistent zwischen Komponenten? (`Card` Primitive nutzt `tokens.spacing[6]` — werden alle Cards damit gerendert?)
- Vertical-Rhythm zwischen Sektionen einheitlich?

### 3. CI / Token-Konsistenz

Claimondo-Tokens (siehe `src/lib/design-tokens.ts`):
- Farben: `claimondo-navy` (#0D1B3E), `claimondo-ondo` (#4573A2), `claimondo-shield` (#7BA3CC), `claimondo-border`, Hintergrund `#f8f9fb`, Card weiß
- Semantic: rose/red für Fehler/dringend, emerald/green für Erfolg, amber für Warnung, violet für info
- Border-Radius: 4 Werte (`tokens.radius.{sm,md,lg,full}`)
- Schatten: 3 Stufen (`shadow-claimondo-sm/md/lg`)

Suche nach:
- Tailwind-Default-Farben (`bg-blue-500`, `text-gray-700` etc.) statt Claimondo-Tokens — siehe Memory `feedback_ci_farben.md`
- Inline-`#xxxxxx`-Hex-Werte in className statt Tokens
- 5+ verschiedene Border-Radius-Werte (Polish-Issue)

### 4. Mobile-Responsive

Pro Route Desktop ↔ Mobile vergleichen:
- Sidebar-Verhalten: collapsible auf Mobile? Bottom-Nav?
- Tabellen werden zu Cards/Listen?
- Modals werden zu Bottom-Sheets?
- Buttons + Aktionen erreichbar (nicht abgeschnitten)?

Wichtig: einige Mobile-Issues sind schon gefixt (siehe `audit-findings.md` „Was schon gefixt ist"). Vor allem #521 (SV-Mobile-Sidebar) und #522 (Cookie-Banner) — die Screenshots wurden BEVOR diese Fixes erstellt, also schaue auf die aktuellen Source-Files für die finale UI-Logik.

### 5. Konsistenz zwischen den drei Portalen

- Gleicher Use-Case → gleiches Pattern? (z.B. Listen mit Filter-Pills oben — sieht das in SV / Dispatch / Kunde gleich aus?)
- Nav-Strukturen vergleichbar (Section-Headers, Aktiv-State, Badge-Counts)?
- Gleiche Komponenten überall verwendet (Modal, Drawer, Card) oder lokale Reimplementierungen?

### 6. Communication-UX (Chat / Mitteilungen / Updates)

Hot-Spot — Aaron's Achillesferse. Pro Bereich:
- **Chat-Bubbles**: Kunde links, Mitarbeiter rechts? Tints konsistent? (z.B. SV emerald, KB ondo, Kunde weiß)
- **Mitteilungs-Card-Styling**: Unread-State erkennbar? Prio (dringend/normal) farblich differenziert?
- **Updates-Badge**: konsistent zwischen Sidebar-Pill und Drawer-Inhalt?

## Wie du arbeitest

1. **Lies zuerst die drei Walkthroughs** (`sv-walkthrough.md`, `dispatch-walkthrough.md`, `kunde-walkthrough.md`) — gibt dir die Routen-Map + Komponenten-Hierarchie.
2. **Read-Tool für Screenshots** nutzen (Read kann PNGs als visual content laden) — pro Route Desktop + Mobile parallel.
3. **Source-Code dazu**: für jede Finding die du machst, identifiziere die Datei(en) die geändert werden müssten. Empfohlen: `src/components/primitives/`, `src/components/shared/`, oder die jeweilige Page-Komponente.
4. **Output strukturiert**: pro Bereich (1-6 oben) eine Findings-Liste mit:
   - **Priorität** (🔴 kritisch / 🟡 Polish / 🟢 nice-to-have)
   - **Datei:Zeile** der vermutlichen Code-Stelle
   - **Screenshot-Referenz** (z.B. `screenshots/gutachter/auftraege-liste-desktop.png`)
   - **Problem** (1-2 Sätze)
   - **Empfohlene Lösung** (Code-Snippet wenn knapp)

## Was NICHT tun

- Funktional-Bugs aus `audit-findings.md` doppeln — die werden separat gefixt
- Marketing-Landing-Pages (`/`, `/landing/*`) reviewen — Fokus auf authenticated Portale
- Test-Code anschauen
- Migrations vorschlagen — du bist Visual + UX, nicht Schema

## Was du implementieren darfst (optional)

Wenn du nach dem Audit Lust auf Hands-on hast: **kleine, isolierte Visual-Fixes als PRs** sind willkommen. Pro PR ein Finding mit klarem Vorher/Nachher. Beispiele:
- Spacing-Token-Korrekturen
- Empty-State-Skeletons hinzufügen
- Konsistenz-Fixes (Card-Border-Radius einheitlich)
- Mobile-Polish (Drawer statt Modal etc.)

Größere Refactors (z.B. „GutachterShell auf shared AppShell migrieren") **nicht** anfangen — Aaron entscheidet.

## Convention

Aaron's Repo befolgt strenge Regeln (siehe `AGENTS.md` im Repo-Root):
- **Niemals direkt auf `main`** pushen — immer Feature-Branch + PR
- **DDL nur via supabase-CLI** (du brauchst hier eh keine DB-Changes)
- **Umlaute Pflicht** in UI-Texten und Commits (`ä/ö/ü/ß`, kein ASCII-Ersatz)
- **Server-Actions** mit Result-Pattern `{ ok, error? }`, nicht throw
- **Audit im Commit-Body** — siehe Beispiele in `git log`

## Erste Aktion

Lies in Reihenfolge:
1. `sv-walkthrough.md`
2. `dispatch-walkthrough.md`
3. `kunde-walkthrough.md`
4. `audit-findings.md` (für Kontext welche funktionalen Issues existieren — du fokussierst dann auf Visuelles)

Dann starte mit den Screenshots des SV-Portals (das größte mit 25 Routen). Frag Aaron wenn du unklar bist welche Findings ihm am wichtigsten sind.
