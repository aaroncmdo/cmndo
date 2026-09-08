# App-weites Token-/Design-Audit (2026-06-28)

Read-only Audit über alle 8 Portale (6 parallele Audit-Agenten + statische Token-Inventur). Ziel: wo Claimondo-Tokens noch nicht richtig genutzt werden + Design-Inkonsistenzen. Keine Änderungen in diesem Audit — nur Befund + priorisierte Roadmap.

## Ranking (Token-Disziplin, schlecht → gut)

| # | Portal | Einschätzung | Brennpunkte |
|---|---|---|---|
| 1 | **Dispatch** | viel Schuld | ~230 status-scales / ~37 Files, durchgehend handgerollte Status-Boxen/Badges/Buttons |
| 2 | **Gutachter** (Workflows) | mittel–viel | Termin-/Vor-Ort-/Finanz-Flows raw; ~221 magic-typo / 48 Files |
| 3 | **Makler** | Problem-Kind | Settings/Abrechnungen/Chat raw — obwohl Werkstatt-Zwilling sauber als Vorlage existiert |
| 4 | **Kanzlei (KB-Cards)** | konzentriert | gesamter Schaden in 5 `components/kb/*`-Cards; `app/kanzlei` selbst sauber |
| 5 | **Admin** | gemischt | `app/admin` Status raw (Team + Dashboard-Widgets); Tabellen GUT (DataTable); Charts legit |
| 6 | **Mitarbeiter** | gemischt | PerformanceClient + Timeline-Badges raw; `tasks/page` schon token'd (Beweis: trivialer Swap) |
| 7 | **Kunde** | meist sauber | aber **whitelabel-brechende Lecks** in `components/kunde/*`-Cards + Chat-Avataren |
| 8 | **Werkstatt** | ✅ sauber | Referenz-Implementierung, 0 Verstöße |

## Querschnitt-Themen (app-weit)

1. **Status-Scales (~1431)** — raw `green/emerald/red/rose/amber/yellow/orange/lime-50…950` statt `bg-success`/`-soft`/`text-success-strong` (+ warning/danger/info). Das dominante Problem.
2. **Magic-Typo (Hunderte)** — `text-[10px]`/`[11px]`/`[9px]` statt `text-caption`/`text-body-xs`. Der häufigste Einzelverstoß (admin 225, gutachter 221, dispatch 252). Codemod-bar.
3. **Radii** — `rounded-2xl`/`rounded-3xl`/`rounded-md/lg/xl` statt `rounded-ios-*` (admin ~45, kunde ~30, …). Codemod-bar.
4. **Handgerollte Components** — inline `<div bg-white rounded border p-4>`-Cards + `<button bg-claimondo-navy>` statt `SectionCard`/`NoticeBox`/`primitives.Button`. Pervasiv in Dispatch + KB-Cards.

## 🔴 KRITISCH — whitelabel-brechende raw hex/rgba (= echte Bugs, nicht nur Konsistenz)

Diese branden bei einem gebrandeten SV NICHT mit (raw hex statt `var(--brand-*)`) → Markenfarbe bricht in der Kundensicht:

- **`src/app/kunde/_components/KundeKbChat.tsx:222-226`** + **`GutachterCard.tsx:222`** — Chat-Avatar/Bubble-Hex `#059669`/`#7BA3CC`/`#F59E0B` (kundensichtbarer Gruppenchat).
- **`src/components/makler/MaklerShell.tsx:63-64`** — `radial-gradient(rgba(123,163,204,.10) …)` roher Marken-rgba (Brand-rgba-Gradient-Ratchet-Verstoß). Werkstatt macht es korrekt via `color-mix(var(--brand-accent,#7BA3CC) …)`.
- **`src/app/kanzlei/kanban/KanbanBoardClient.tsx:43-48`** — `PHASE_ACCENT` Hex-Map (`#eef4fb`/`#fffbeb`/…) via `style`.
- **Kunde-Cards raw `emerald`/`amber`** (KundeAbschlussCard, SaeuleMeinGeld, EskalierterAdminCard, GoogleReviewPrompt) — Status-Flächen die nicht mitbranden.

## Per-Portal Top-Findings

### Dispatch (höchster Hebel)
- `SvDispatchPanel.tsx` (~41 status-scales) → Status-Boxen auf `NoticeBox tone=danger/warning/success`.
- `_phases/DokumenteAnfordernCard.tsx` (~33) → Status-Map auf Soft-Tokens; `rounded`→`rounded-ios-sm`.
- `leads/_components/LeadsViewToggle.tsx` (Badge-Maps + 4 raw radii) → `StatusBadge` + `rounded-ios-*`.
- `dashboard/page.tsx` — 4× handgerollte SectionCard → `<SectionCard>`.
- `GespraechsleitfadenTimer` / `RueckrufTerminPanel` / `KundenMatchCard` — Status + handgerollte Buttons → Tokens + `primitives.Button`.
- `karte/KalenderClient.tsx` + `karte/DispatchKarteClient.tsx` — legit Data-Viz/Mapbox-Hex, aber **fehlender `// Token-Audit-Skip`-Header**.

### Gutachter
- `components/gutachter/AuftragHeaderPanel.tsx` (~25 status-scales) — zentraler Auftrags-Header → success/warning/danger-Tokens + `StatusBadge`.
- `termine/[id]/TerminDetailActions.tsx` (~22 status + ~8 raw `rounded-2xl`).
- `termine/[id]/vor-ort/VorOrtClient.tsx` (~14) — Vor-Ort-Kern-Workflow.
- `abrechnung/page.tsx` (KPI-Border grün/amber = Status) + `gebiet/page.tsx` (21 typo) + `heute/*` (typo) + `profil` (off-brand red-900).

### Kanzlei (KB-Cards) — alles in 5 Files
- `components/kb/VollstaendigkeitsCheckCard.tsx` (~25, der Brennpunkt — ~⅔ des Portal-Schadens).
- `RegulierungCard.tsx` (8) · `KanzleiSlaStatusCard.tsx` (+ toter `amber:amber`-Branch) · `VsKorrespondenzCard.tsx` (3 + eigenes Modal statt primitive).

### Makler (Werkstatt = 1:1-Vorlage)
- `MaklerAbrechnungen.tsx` — Copy-Paste von `WerkstattAbrechnungen.tsx` OHNE Token-Migration.
- `MaklerSettings.tsx` (~14) · `MaklerShell.tsx` (raw rgba-Gradient, s.o.) · `MaklerLeadsTable.tsx` ConsentBadge handgerollt (obwohl dieselbe Datei `StatusBadge` nutzt).

### Admin
- Team-Cluster (`TeamClient`/`MitarbeiterDetail`/`Leaderboard`/`Incentives`) raw + `!`-Hacks.
- Dashboard-Widgets (`AusstehendeZahlungen`/`StripeConnectStatus`/`WichtigeUpdates`) Status raw.
- ~225 magic-typo / 53 Files + ~45 raw radii / 21 Files. Tabellen GUT (DataTable adoptiert). Charts legit.

### Mitarbeiter
- `performance/PerformanceClient.tsx` (~13, KEIN Chart — semantischer Status) + Timeline-/Termin-Badges + 6 raw radii.

## Priorisierte Roadmap (Boy-Scout, je 1 PR pro Cluster)

1. **🔴 Whitelabel-Lecks** (Bugs zuerst): KundeKbChat/GutachterCard-Hex, MaklerShell-rgba, KanbanBoardClient-Hex-Map, kunde-Status-Cards. Klein, hochwertig, korrektheitsrelevant.
2. **Dispatch Status-Sweep** (größte Fläche): die 7 Panels → NoticeBox/StatusBadge/Tokens.
3. **KB-Cards** (5 Files, Legal-Workflow): VollstaendigkeitsCheckCard zuerst.
4. **Makler ← Werkstatt-Vorlage** (mechanischer Spiegel).
5. **Gutachter-Workflows** (AuftragHeaderPanel/TerminDetailActions/VorOrtClient).
6. **Systemische Codemods** (app-weit): `text-[9/10/11px]`→Typo-Tokens, `rounded-2xl/3xl`→`rounded-ios-*`. Skip-Header für legit Data-Viz (Charts/Mapbox/Kalender-Paletten).

## Status
Build + tsc + token-audit grün (kein NEUER Ratchet-Verstoß — alles oben ist grandfathered Bestand). Die Ratchets bremsen Drift; dieser Audit ist die Boy-Scout-Abbau-Liste.
