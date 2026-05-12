# Fokus-Modus / Feldmodus — 100 % Frontend-Design-Audit

**Datum:** 2026-05-12
**Scope:** `src/app/gutachter/feldmodus/*` (Cinematic Field-Mode für SVs auf der Strasse)
**Methode:** Statische Code-Analyse durch Frontend-Design-Skill-Lens (Typography, Color, Motion, Spatial, Backgrounds, Anti-Pattern + 4 feldmodus-spezifische Achsen)
**Vergleichsanker:** PR-Welle 2026-05-08 (10 PRs: Stau-Routing, NaviHud, Glass-Cards, Wetter-Particles, Offline-SW, GPS-Stale, Auto-PBR) → versprach „iOS Glass / Cinematic-Look"

---

## Bewertung gegen den Anspruch

> **„iOS Glass / Cinematic-Look" Erfüllung: ~60–70 %**
> Struktur sitzt (GlassPanel-Component, Tokens, Map-Fog, Wake-Lock). Aber: Motion zu sparsam ohne Charakter, Outdoor-Lesbarkeit nicht gehärtet, Glass-Optik nicht durchgängig — Funktional-solide, aber nicht „Apple-poliert".

---

## Top-3 Kritisch

| # | Befund | Datei : Zeile | Severity |
|---|---|---|---|
| 1 | **NaviHud-Kontrast bei direkter Sonneneinstrahlung unter WCAG-AA** — `THEME_WHITE` rendert `text-claimondo-ondo` (#4573A2) auf `bg-white/65 backdrop-blur-2xl`. Bei Tageslicht im Auto ist das nicht lesbar — und das ist genau die TBT-Manöver-Anzeige | `NaviHud.tsx:139-141` | 🔴 KRITISCH (Driving-Safety) |
| 2 | **`prefers-reduced-motion` nirgends respektiert** — keine `@media (prefers-reduced-motion: reduce)`-Branches, kein `useReducedMotion`-Check im Code. Im Driving-Kontext ist die Präferenz oft erhöht | global im Feldmodus-Tree | 🔴 KRITISCH (WCAG) |
| 3 | **`AktuellerStopCard` ist solide weiße Card mit `bg-white`** mitten im Glass-Setting — kein `GlassPanel`-Wrapper, kein `backdrop-blur`. Bricht visuell aus dem Cinematic-Look heraus | `AktuellerStopCard.tsx:271` | 🟠 HOCH (Aesthetic-Bruch) |

---

## Achse 1 — Typography

**Was funktioniert**
- Montserrat als UI-Font konsistent durchs Portal — kein Bruch zur restlichen App
- Noto Sans Arabic korrekt für AR-Locale geladen (subset=arabic), keine Glyph-Drift
- Type-Scale hierarchisch (`text-base`/`text-xs`/`text-[10px]`)
- `tracking-wider` auf Captions erzeugt visuelle Hierarchie ohne Größen-Spielerei

**Was kaputt / fehlt / generisch**
- `FokusHeader.tsx:105` Distanz-Label `text-claimondo-ondo/50` (50 % Opacity) → bei Sonneneinstrahlung unlesbar, keine bright-Variante 🟠 MITTEL
- `NaviHud.tsx:139-141` `THEME_WHITE` → siehe Top-3 #1 🔴 KRITISCH
- `TbtBanner.tsx:129-130` Subline `text-white/70` auf `bg-claimondo-navy/95` → bei Nacht zu dunkel-auf-dunkel, Distinktion verschwimmt 🟠 MITTEL
- `AktuellerStopCard.tsx:299-305` Status-Badge nutzt `text-[color:var(--brand-primary)]` mit hartem Navy-Fallback statt Token 🟡 NIEDRIG
- Keine eigene Display-Schrift für „Cinematic"-Momente (Manöver-Text, Distanz-Countdown) — alles bleibt Montserrat-Mid 🟠 MITTEL (verpasste Chance)

---

## Achse 2 — Color & Theme

**Was funktioniert**
- Claimondo-CI-Tokens definiert (`globals.css:133-139`) und meist konsistent referenziert
- `GlassPanel` mit 3 Levels (default/subtle/prominent) zentralisiert die Glass-Optik
- iOS-Tokens (`globals.css:152-161`: `--radius-ios`, `--shadow-ios-*`, `--ease-ios`, `--font-apple`) bewusst Apple-inspiriert
- NaviHud-Theming (RED Blitzer / AMBER Hazard / BLUE Maneuver / WHITE Standard) ist semantisch klar
- `OfflineStatusBanner` nutzt semantische Farben (Red Dead-Letter, Amber Offline)

**Was kaputt / fehlt / generisch**
- `RouteSidebar.tsx:43` `bg-[var(--brand-primary)]/95` mit undokumentiertem CSS-var-Fallback (default ist Ondo, nicht Navy) → optisch inkonsistent wenn Branding-Theme greift 🟠 MITTEL
- `RerouteToast.tsx:50` hardcodierte Hex-Farben `#DC2626`, `#1A73E8` statt Tokens → driften vom CI-System weg 🟠 MITTEL
- `AktuellerStopCard.tsx:321-333` Tracking-Status nutzt `emerald-50/700` und `amber-50/800` → reine Tailwind-Defaults, nicht Claimondo 🟠 MITTEL
- `NaviHud.tsx:135-141` `THEME_WHITE` (semi-transparentes Weiß) wirkt auf grauem Outdoor-Sky „schmutzig" 🟠 MITTEL
- Kein Dark-Mode-Branch, obwohl `globals.css:164-196` `.dark` definiert — Feldmodus erzwingt `text-white` statisch via `fixed inset-0 z-[1200]` 🟡 NIEDRIG

---

## Achse 3 — Motion & Animation

**Was funktioniert**
- `NaviHud.tsx:233` `animate-in fade-in slide-in-from-bottom-3 duration-500` — saubere Slide-Up
- `RerouteCard` Countdown-Progress (`NaviHud.tsx:417-421`) mit `transition-[width] ease-linear 100ms` für responsives Feedback
- `OfflineStatusBanner` bewusst statisch — nicht ablenken während Fahrt
- `AktuellerStopCard.tsx:369-370` Buttons diskret (`hover:bg-…/disabled:opacity-50`), kein Bounce/Scale

**Was kaputt / fehlt / generisch**
- `TbtBanner.tsx:113` `animate-spin` auf grauem `Loader2Icon` — Standard-Material-UI-Spinner, **nicht cinematisch** + dauerhafte Rotation = peripherer Distraction-Risk während TBT 🟠 MITTEL
- `NaviHud.tsx:197` Lane-Indikator `transition-all` ohne `duration` und ohne Stagger → schnappt eckig 🟡 NIEDRIG
- `FeldmodusClient.tsx:419` Mobile-Bottom-Sheet `transition-[max-height] duration-300 ease-out` → nutzt **nicht** das definierte `--ease-ios` cubic-bezier — eigener Token wird ignoriert 🟠 MITTEL
- Keine Idle-State-Choreography: Wetter-Particles im Memory erwähnt, aber im aktuellen `FeldmodusMap.tsx` nicht eindeutig auffindbar — entweder rausgefallen oder versteckt im untersuchten Bereich
- **Kein `prefers-reduced-motion`** — siehe Top-3 #2 🔴 KRITISCH
- `RerouteCard` Countdown-Bar refresh-rate 100 ms → visueller Flicker beim Fahren möglich, 200–300 ms wären angemessen 🟡 NIEDRIG

---

## Achse 4 — Spatial Composition

**Was funktioniert**
- Asymmetrische Floating-Card-Komposition: `AktuellerStopCard` mid-left (`FeldmodusClient.tsx:378`), kommende Stops bottom-left (`:396`) — bricht das vorhersehbare „Header–Sidebar–Content"-Muster
- Mobile (`< lg`): Bottom-Sheet mit Glass-Header + collapsible Toggle, 1-Hand-tauglich
- Desktop (`lg+`): Sidebar rechts 380px (`:337`), Floating-Cards links, Map mittig — sauber asymmetrisch
- `NaviHud` `bottom-center` (`:226`) mit `-translate-x-1/2 fixed` — robust über alle Breiten
- Safe-Area beachtet via `right-4 left-4` (`:350`) + Desktop-Right-Align über `md:left-auto md:max-w-md`

**Was kaputt / fehlt / generisch**
- `AktuellerStopCard.tsx:271` Solid-White ohne Glass — siehe Top-3 #3 🟠 HOCH
- `StopListItem.tsx:23-24` Zwei `variant`-Klassen mit identischem `rounded-lg p-3 flex items-start gap-2` — DRY-Verletzung, nur Farbunterschied, redundant 🟡 NIEDRIG
- Mobile-Sheet `bg-white/65 backdrop-blur-md` (`FeldmodusClient.tsx:419`) vs. Desktop-Floating-Cards `bg-white` (`AktuellerStopCard.tsx:271`) → Glass auf Mobile, Solid auf Desktop = umgekehrt von erwartet 🟠 MITTEL
- Border `lg:border-l lg:border-white/10` (`:337`) nur Desktop, nicht Mobile → visueller Bruch beim Resize 🟡 NIEDRIG
- Notch-Handling: Top-Padding hart `top-4` (`:450`), kein `pt-safe` oder Viewport-Meta-Adjustment für iPhone-Notch / Android-Status-Bar 🟠 MITTEL

---

## Achse 5 — Backgrounds & Visual Details

**Was funktioniert**
- `GlassPanel`-Shared-Component (Zeilen 1–38) zentralisiert die Glass-Optik
- `--shadow-ios-sm/md/lg` mit subtiler Navy-Tint (`globals.css:156-158`) — konsistent angewendet (`NaviHud.tsx:233`, `:465`, `:481`, `:491`)
- `layout.tsx:21` `bg-[var(--brand-primary)]` für Full-Bleed-Navy ohne Wrapper-Overhead
- **Map-Fog-Layer ist der Star** (`FeldmodusMap.tsx:75-122`): Tageszeit-adaptiv (Dawn/Dusk/Night/Day) + Weather-Modifier — sehr poliert, hier sitzt der Cinematic-Anspruch
- `RouteSidebar.tsx:43` Navy/95 + `backdrop-blur-md` = optisch reich

**Was kaputt / fehlt / generisch**
- `AktuellerStopCard.tsx:271` Pure White, kein Glow / Gradient / Tint → wirkt flach gegen die polierten Map-Fog-Layer (krasser Stilbruch im selben Viewport) 🟠 HOCH
- Wetter-Particles laut Memory implementiert, aber im Code nicht eindeutig nachweisbar — entweder verloren gegangen oder nicht im Audit-Scope sichtbar (➜ explizit verifizieren)
- `RerouteToast.tsx:60` `shadow-2xl shadow-black/40` — sehr dramatisch, widerspricht der subtilen `shadow-ios-md`-Sprache der GlassPanels 🟠 MITTEL
- Loading-States (z. B. `TbtBanner.tsx:113`): nur Spinner, keine Skeleton-Frames → Layout-Flash beim Ankommen der Daten 🟡 NIEDRIG
- Kein Grain / Noise-Overlay → moderne Apps haben subtile Texture; Feldmodus wirkt dadurch glatt-digital, nicht filmisch 🟡 NIEDRIG (Cinematic-Polish)

---

## Achse 6 — Sun-Readability & Outdoor-Use ⚠️ feldmodus-spezifisch

**Was funktioniert**
- `OfflineStatusBanner.tsx:33,53` `bg-red-600/95`, `bg-amber-600/95` — High-Saturation-Farben gut bei Sonne sichtbar
- `TbtBanner.tsx:117` `bg-claimondo-navy/95` mit `text-white` → hoher Kontrast, Navy absorbiert Streulicht
- `NaviHud.tsx:104-111` `THEME_RED` (Blitzer): `bg-red-500/20 text-white` — Warnung sichtbar

**Was kaputt / fehlt / generisch (KRITISCH bei Sonne)**
- `NaviHud.tsx:139-141` `THEME_WHITE` — siehe Top-3 #1 🔴 KRITISCH
- `FokusHeader.tsx:105-108` Distanz-Label `text-claimondo-ondo/50` auf `bg-white/10` → Kontrast < 3:1 🟠 MITTEL
- `StopListItem.tsx:45-46` Erledigte Stops `line-through truncate` → Strikethrough auf dunklem Hintergrund schwer erkennbar 🟡 NIEDRIG
- **Kein** Outline-Text / Text-Shadow für kritische Labels (Standard-Pattern in Outdoor-Apps wie Komoot, OsmAnd) — verpasste Härtung 🟠 MITTEL

---

## Achse 7 — One-Hand-Operation & Tap-Targets

**Was funktioniert**
- `TbtBanner.tsx:152-162` Voice-Toggle 48 px (`w-12 shrink-0`) — über Apple-HIG-44pt
- `NaviHud.tsx:400-413` Reroute-Buttons `h-11` (= 44 px) full-width — gross, leicht
- Mobile-Sheet-Toggle (`FeldmodusClient.tsx:426-433`) `w-full py-1` Drag-Handle — gross, erkennbar
- `AktuellerStopCard.tsx:365-373` Abschluss-Button `min-h-14` (= 56 px) — sehr fahrer-freundlich

**Was kaputt / fehlt / generisch**
- `FokusHeader.tsx:84-97` Pause-Button nur `px-2 py-1.5` (~ 32 px) + Icon `w-4` → unter HIG, riskant beim Fahren 🟠 MITTEL
- `StopListItem.tsx:20-25` Card sieht klickbar aus, hat aber **keinen onClick-Handler** — visuelle Lüge 🟠 MITTEL
- `AktuellerStopCard.tsx:336-344` Phone-Link `inline-flex` ohne Padding → ~ 30 px Höhe 🟠 MITTEL
- `OfflineStatusBanner.tsx:38-44` „Details"-Button als `underline` → Text-Link statt echter Button, schwer im Bewegung zu treffen 🟡 NIEDRIG
- Keine Swipe-Gesten — `FokusChatPanel.tsx:10` dokumentiert das als bewusste Entscheidung („Swipe-Gesten bewusst geschnitten"), aber dann fehlt überall sonst auch jede 1-Hand-Geste außer Chevron-Toggle 🟡 NIEDRIG (Design-Konsistenz, aber verpasste UX-Chance)

---

## Achse 8 — Driving-Distraction (TBT aktiv)

**Was funktioniert**
- Layout-Isolation: `TbtBanner` top-right, `NaviHud` bottom-center → keine Overlaps, klare Zones
- Motion sparsam außerhalb des aktiven Stepper-Pulses (`NaviHud.tsx:232-238`)
- 500 ms Slide-Up langsam genug, nicht ruckartig

**Was kaputt / fehlt / generisch**
- `TbtBanner.tsx:113` `animate-spin` als Endlos-Rotation → peripherer Distraction-Risk; sollte `animate-pulse` oder Heartbeat sein 🟠 MITTEL
- `NaviHud.tsx:359-374` Countdown-Bar 100 ms-Refresh → Flicker-Wahrnehmung möglich 🟡 NIEDRIG
- Keine Motion-Disabling im TBT-Aktiv-Modus → dieselben Animationen laufen, ob abgestellt oder fahrend 🟠 MITTEL

---

## Achse 9 — Battery & GPU-Last

**Was funktioniert**
- `useWakeLock()` in `FeldmodusClient.tsx:67-70` verhindert Standby-Drain
- CSS-Animationen statt JS-RAF überall — GPU-friendly
- Statisches `OfflineStatusBanner`, statisches `LaneStrip` (`TbtBanner.tsx:32-49`)

**Was kaputt / fehlt / generisch**
- `TbtBanner.tsx:113` Spinner ohne Timeout → wenn Re-Routing-API hängt, läuft Spinner ewig + Akku 🟡 NIEDRIG
- 3D-Fog im Map-Layer (Pitch=60) ist GPU-intensiv, aber statisch gerendert — vermutlich OK
- Wetter-Particles (falls Canvas-basiert): Implementation nicht im Sample → Verifikation nötig 🟡 NIEDRIG

---

## Achse 10 — Offline-First & Missing-Tiles

**Was funktioniert**
- `OfflineStatusBanner.tsx:26-49` mit drei klar unterscheidbaren States (Dead-Letter / Offline / Syncing)
- `DeadLetterDialog`-Integration für Fehlerbehandlung (`:46`)
- `FeldmodusClient.tsx:232-241` Outbox-Recovery + Sync-Listener bei Mount

**Was kaputt / fehlt / generisch**
- Map-Fallback nicht eindeutig im Code: kein expliziter Placeholder für „Map-Tiles fehlen" gefunden 🟠 MITTEL
- `OfflineStatusBanner` zeigt „Offline" aber nicht „Map wird gecached" / Sync-Progress 🟡 NIEDRIG
- Keine Visual-Indication wenn Karte auf Cached-Tiles fällt (z. B. Sepia-Tint oder „Offline Map"-Label) → User weiß nicht ob Realtime oder Stale 🟠 MITTEL

---

## Severity-Matrix (alle Befunde)

| ID | Achse | Severity | Befund | Datei : Zeile |
|---|---|---|---|---|
| F-01 | Typo / Sun | 🔴 KRITISCH | NaviHud `THEME_WHITE` Kontrast unter WCAG-AA bei Sonne | `NaviHud.tsx:139-141` |
| F-02 | Motion | 🔴 KRITISCH | Kein `prefers-reduced-motion`-Respekt | global Feldmodus |
| F-03 | Backgrounds | 🟠 HOCH | `AktuellerStopCard` solides Weiß, kein GlassPanel | `AktuellerStopCard.tsx:271` |
| F-04 | Typo | 🟠 MITTEL | Distanz-Label 50 % Opacity, Outdoor unlesbar | `FokusHeader.tsx:105` |
| F-05 | Color | 🟠 MITTEL | TBT-Banner Subline `text-white/70` zu dunkel-auf-dunkel | `TbtBanner.tsx:129-130` |
| F-06 | Color | 🟠 MITTEL | Hardcoded Hex in RerouteToast statt Tokens | `RerouteToast.tsx:50` |
| F-07 | Color | 🟠 MITTEL | Tailwind-Default-Emerald/Amber statt Claimondo-Tokens | `AktuellerStopCard.tsx:321-333` |
| F-08 | Motion | 🟠 MITTEL | Mobile-Sheet ignoriert eigenes `--ease-ios`-Token | `FeldmodusClient.tsx:419` |
| F-09 | Motion / Distraction | 🟠 MITTEL | TBT-Spinner `animate-spin` als peripherer Distraction-Risk | `TbtBanner.tsx:113` |
| F-10 | Spatial | 🟠 MITTEL | Mobile Glass / Desktop Solid Inkonsistenz | mehrere |
| F-11 | Spatial | 🟠 MITTEL | Kein `pt-safe` für iPhone-Notch / Android-Status-Bar | `FeldmodusClient.tsx:450` |
| F-12 | Backgrounds | 🟠 MITTEL | RerouteToast `shadow-2xl` widerspricht Glass-Sprache | `RerouteToast.tsx:60` |
| F-13 | Sun | 🟠 MITTEL | Kein Outline-Text / Text-Shadow für kritische Labels | global |
| F-14 | Tap-Targets | 🟠 MITTEL | Pause-Button ~32 px, unter HIG | `FokusHeader.tsx:84-97` |
| F-15 | Tap-Targets | 🟠 MITTEL | StopListItem sieht klickbar aus, ist aber inert | `StopListItem.tsx:20-25` |
| F-16 | Tap-Targets | 🟠 MITTEL | Phone-Link ohne Padding, ~30 px | `AktuellerStopCard.tsx:336-344` |
| F-17 | Distraction | 🟠 MITTEL | Animationen laufen unabhängig vom TBT-Aktiv-State | global |
| F-18 | Offline | 🟠 MITTEL | Map-Tile-Fallback nicht sichtbar im Code | `FeldmodusMap.tsx` (>:150) |
| F-19 | Offline | 🟠 MITTEL | Keine Visual-Indication für Cached-Tiles vs. Realtime | global |
| F-20 | Color | 🟡 NIEDRIG | RouteSidebar CSS-var-Fallback undokumentiert | `RouteSidebar.tsx:43` |
| F-21 | Color | 🟡 NIEDRIG | NaviHud `THEME_WHITE` wirkt „schmutzig" auf grauem Sky | `NaviHud.tsx:135-141` |
| F-22 | Color | 🟡 NIEDRIG | Kein Dark-Mode-Branch trotz definiertem `.dark` | global |
| F-23 | Typo | 🟡 NIEDRIG | Status-Badge Hard-Fallback statt Token | `AktuellerStopCard.tsx:299-305` |
| F-24 | Typo (Cinematic) | 🟠 MITTEL | Keine Display-Schrift für Manöver / Distanz — verpasste Cinematic-Chance | global |
| F-25 | Motion | 🟡 NIEDRIG | Lane-Indikator `transition-all` ohne `duration` | `NaviHud.tsx:197` |
| F-26 | Motion | 🟡 NIEDRIG | Countdown-Bar 100 ms-Flicker | `NaviHud.tsx:417-421` |
| F-27 | Spatial | 🟡 NIEDRIG | StopListItem DRY-Verletzung in zwei `variant`-Klassen | `StopListItem.tsx:23-24` |
| F-28 | Spatial | 🟡 NIEDRIG | Border `lg:border-l` nur Desktop | `FeldmodusClient.tsx:337` |
| F-29 | Sun | 🟡 NIEDRIG | Strikethrough auf Dark schwer erkennbar | `StopListItem.tsx:45-46` |
| F-30 | Tap-Targets | 🟡 NIEDRIG | Offline-Banner „Details" als underline-Link | `OfflineStatusBanner.tsx:38-44` |
| F-31 | Tap-Targets | 🟡 NIEDRIG | Keine 1-Hand-Geste außer Chevron-Toggle (bewusst, aber verpasste Chance) | `FokusChatPanel.tsx:10` |
| F-32 | Distraction | 🟡 NIEDRIG | Countdown-Bar 100 ms-Refresh als visuelle Distraction | `NaviHud.tsx:359-374` |
| F-33 | Battery | 🟡 NIEDRIG | TBT-Spinner ohne Timeout — Akkudrain bei API-Hang | `TbtBanner.tsx:113` |
| F-34 | Backgrounds | 🟡 NIEDRIG | Loading-States ohne Skeleton — Layout-Flash | `TbtBanner.tsx:113` |
| F-35 | Backgrounds (Cinematic) | 🟡 NIEDRIG | Kein Grain/Noise-Overlay → glatt-digital statt filmisch | global |
| F-36 | Backgrounds | 🟡 NIEDRIG | Wetter-Particles nicht eindeutig im Code auffindbar | `FeldmodusMap.tsx` |

**Summe:** 36 Befunde — 2 kritisch, 1 hoch, 16 mittel, 17 niedrig

---

## Priorisierte Fix-Reihenfolge (Empfehlung)

### Sprint 1 — Safety & WCAG (1–1.5 Tage)
1. **F-01** NaviHud `THEME_WHITE` → kontraststarke Variante: dunkle Glass-Card mit weißer Schrift, oder hochkontrastiges Outline-Text-Pattern
2. **F-02** `useReducedMotion`-Hook (z. B. via `framer-motion` `useReducedMotion()` oder eigener Wrapper) → alle Slide-Ins, Pulse, Spinner respektieren das Flag
3. **F-04, F-05, F-13** Outdoor-Härtung: Mindestkontrast 7:1 für TBT-relevante Texte, Text-Shadow / Outline-Layer für Distanz/Manöver

### Sprint 2 — Cinematic-Konsistenz (1–2 Tage)
4. **F-03** `AktuellerStopCard` auf `GlassPanel`-Wrapper umstellen — gleiche Sprache wie NaviHud / RouteSidebar
5. **F-10, F-12** Glass-Konsistenz Mobile↔Desktop angleichen, RerouteToast auf `shadow-ios-md` runterziehen
6. **F-08** Mobile-Sheet `--ease-ios` einsetzen (Token existiert, wird aber nicht genutzt)
7. **F-24** Display-Schrift für Manöver-Text + Distanz-Counter prüfen (z. B. SF Pro Display, Ginto Nord, Tomato Grotesk) — gibt dem Cinematic-Anspruch ein Gesicht

### Sprint 3 — Driving-Härtung & 1-Hand (1 Tag)
8. **F-09, F-17** TBT-Spinner durch ruhige Heartbeat-Animation ersetzen, Animations-Suspend bei aktivem TBT
9. **F-14, F-15, F-16** Tap-Targets auf 44 pt + StopListItem entweder klickbar machen oder visuell entkoppeln
10. **F-11** `pt-safe` / `env(safe-area-inset-top)` durchziehen

### Sprint 4 — Offline-Polish & Tokens (0.5–1 Tag)
11. **F-18, F-19** Map-Tile-Cached-Indicator (Sepia-Tint oder Mini-Badge), Tile-Cache-Sync-Status im Banner
12. **F-06, F-07** Hardcodes durch Tokens ersetzen
13. **F-22** Dark-Mode prüfen (vermutlich nicht relevant für Outdoor, aber Konsistenz mit Rest-App)

### Sprint 5 — Verpasste Cinematic-Chancen (optional, 1 Tag)
14. **F-35** Subtiler Grain/Noise-Overlay (8–12 % Opacity, screen-blend) gegen den glatt-digitalen Eindruck
15. **F-36** Wetter-Particles verifizieren: implementiert? Performance? Visuell integriert?
16. **F-31** 1-Hand-Geste experimentieren (Long-Press auf NaviHud → schneller Re-Center, Swipe-Down auf Sheet → Voice-Note)

---

## Was wirklich poliert ist (Lob)

- **Map-Fog-Layer in `FeldmodusMap.tsx:75-122`** — tageszeit-adaptiv mit Weather-Modifier. Hier sitzt der Anspruch zu 100 %, das ist die beste Stelle im ganzen Modul
- **`GlassPanel`-Component-Architektur** — 3 Levels, zentralisiert, sauber referenziert
- **iOS-Token-Set** in `globals.css:152-161` — Design-System-Vorbereitung, sichtbarer Anspruch
- **`OfflineStatusBanner` mit 3 differenzierten States** — bessere Information-Density als bei den meisten Konkurrenz-Apps
- **`useWakeLock` + Safe-Area-Padding-Versuche** — Attention to Detail
- **Asymmetrische Floating-Card-Komposition** — bricht das vorhersehbare „Header–Sidebar–Content" auf

---

## Was ich NICHT prüfen konnte

- **Wetter-Particles**: Im Memory dokumentiert, im Code nicht eindeutig auffindbar — möglicherweise in einem Kind-Modul oder komplett nicht implementiert
- **Reales Outdoor-Verhalten**: Kein Browser-Test mit simulierter Sonneneinstrahlung möglich — Kontrast-Werte nur statisch berechnet
- **Performance-Profiling**: Keine echten Mess-Werte (FPS bei aktivem TBT + Particles + GPS), nur Code-Analyse
- **Voice-Output (ElevenLabs)**: Memory erwähnt aufgeschobenes Plan-Upgrade — UI-seitig nicht hier auditiert
- **PBR auf Glass-Cards**: PR-Beschreibung erwähnt „Auto-PBR", im Code keine eindeutige PBR-Implementation gesehen — möglicherweise im `FeldmodusMap`-Bereich

---

## Geschätzter Gesamtaufwand bis „90 %+ Cinematic-Erfüllung"

| Sprint | Inhalt | Tage |
|---|---|---|
| 1 — Safety / WCAG | F-01, F-02, F-04/05/13 | 1–1.5 |
| 2 — Cinematic-Konsistenz | F-03, F-08, F-10/12, F-24 | 1–2 |
| 3 — Driving-Härtung | F-09/17, F-14/15/16, F-11 | 1 |
| 4 — Offline + Tokens | F-18/19, F-06/07, F-22 | 0.5–1 |
| 5 — Cinematic-Chancen (optional) | F-35, F-36, F-31 | 1 |
| **Gesamt** | | **~4.5–6.5 Dev-Tage** |
