# Werkstatt-Embed-Profil — Design (2026-07-22)

## Kontext
Der Gutachter-Finder-Embed (`/embed/gutachter-finder`) zeigt ein reiches, marketing-gestyltes
**SV-Profil** über dem Map-Pin (`SvProfileInhalt` in `SvProfilePopup.tsx`) — Trust-Signale:
verifiziert, Google-Bewertung, Spezialisierungen, Credentials.

Für **Werkstätten** fehlt das. Beide kunden-facing Surfaces zeigen Werkstätten nur schlicht:
- **Werkstatt-Empfehlung-Kundenroute** (`/werkstatt-empfehlung/[token]`): die geteilte
  `WerkstattFinder`-Card (Name / verifiziert / `gruende`-Chips / Adresse / Distanz / Telefon).
- **Werkstatt-Finder-Embed** (`/embed/werkstatt-finder`): rendert in `WerkstattWizard` **dieselbe**
  `WerkstattFinder`-Card **UND** eine Mapbox-Karte (`WerkstattFinderShell`), deren Pin-Popup aktuell
  nur `mapboxgl.Popup().setText(w.name)` = **nackter Name** zeigt.

Aaron (22.07.): ein Werkstatt-Profil fürs Embed **und** in der Empfehlung, **analog zum
Gutachter-Profil, nur abgespeckter** (Approach C = hybrid, s.u.).

## Ziel
Ein **geteiltes `WerkstattProfileInhalt`** (analog `SvProfileInhalt` — reiner Inhalt ohne Surface,
von mehreren Stellen geteilt), das die **bereits vorhandenen** Werkstatt-Trust-Daten als Profil
rendert, an beiden Kunden-Surfaces:
1. **Empfehlung-Route + Embed-Liste** (geteilte `WerkstattFinder`-Card) → **kompakt** angereichert.
2. **Embed-Map-Pin-Popup** (`WerkstattFinderShell`) → **voll** (GlassSurface-Profilkarte, 1:1 wie
   `SvProfilePopup`).

## Nicht-Ziele (YAGNI)
- **Kein** Partner-Rang, **keine** SV-Credentials (öffentlich bestellt/vereidigt/Mitgliedschaften/
  Qualifikationen), **kein** Einsatzgebiet-km, **keine** Schadenarten, **keine** Bio — SV-spezifisch.
- **Nicht anonym.** Werkstätten sind **benannt**: der Kunde wählt gezielt eine (anders als beim SV,
  den das System zuteilt → dort anonym). Firmenname wird gezeigt. Das ist der bewusste
  „analog-aber-anders"-Punkt.
- **Keine** DB-/Schema-Änderung. Alle Profil-Felder liegen bereits in `WerkstattVorschlag`
  (`SELECT_COLS` in `lade-vorschlaege.ts` holt `google_rating`, `google_review_count`, `marken`,
  `faehigkeiten`, `verifiziert`, `fahrzeug_gruppen`).
- **Kein** Funnel-/Wizard-/Ranking-Umbau. Reine Anzeige.

## Feld-Map (abgespeckt — SV → Werkstatt)
| Gutachter-Profil | Werkstatt-Profil | Quelle |
|---|---|---|
| Avatar-Initiale + Vorname | Icon + **Firmenname** | `name` |
| „Rolle in Stadt" + ✓ Verifizierter Partner | „Werkstatt in [Ort]" + ✓ Verifizierter Partner | `adresse_ort`, `verifiziert` |
| Google-Bewertung | **Google-Bewertung** *(neu in der Card — Kernzugewinn)* | `google_rating`, `google_review_count` |
| „Spezialisiert auf" | **Marken** („BMW-Vertragswerkstatt" / „Freie Werkstatt") | `gruende` (typ `marke`) |
| Schadenarten | **Gewerke** („Repariert Karosserie + Lack") | `gruende` (typ `gewerk`) |
| Partner-Rang · Credentials · Einsatzgebiet-km · Bio | *(entfällt)* | — |
| — | *(optional)* Fahrzeug-Gruppen, Distanz | `fahrzeug_gruppen`, `distanz_km` |

## Architektur / Komponenten
- **`WerkstattProfileInhalt`** (neu, `src/components/werkstatt/finder/WerkstattProfileInhalt.tsx`) —
  reiner Profil-Inhalt (ohne Surface), analog `SvProfileInhalt`. Props = die Profil-Felder aus
  `WerkstattVorschlag`. **Reine Anzeige, keine Logik.** `gross`-Variante (größerer Header) fürs Popup.
  Rendert: Kopf (Icon + Firmenname + „Werkstatt in [Ort]" + ✓ Verifizierter Partner) →
  `GoogleBewertungBadge` (wenn Rating) → Marken-/Gewerke-Chips (aus `gruende`) → optional
  Fahrzeug-Gruppen/Distanz.
- **`WerkstattFinder`-Card-Anreicherung** — die Card zeigt zusätzlich die **`GoogleBewertungBadge`**
  wenn `google_rating` vorhanden. Bewusst **ohne** Opt-in-Prop: die Anreicherung ist additiv +
  benigne für **alle** Consumer (Empfehlung/Embed/SV-Empfehlen/Dispatch profitieren von der Rating-
  Anzeige). Marken-/Gewerke-Chips existieren bereits (`gruende`). Kein Card-Umbau, nur +Badge.
- **`WerkstattProfilePopup`** (neu, embed-lokal) + Verdrahtung in `WerkstattFinderShell`: der Map-Pin
  ersetzt `setText(w.name)` durch die GlassSurface-Profilkarte (`WerkstattProfileInhalt`), gerendert
  via `setDOMContent`. **Gleiches Render-Muster wie der Gutachter-Embed** (`SvProfilePopup` in
  `FinderMap.tsx` — React-Root/`renderToStaticMarkup` in den Popup-DOM). GlassSurface = die des Embeds
  (`src/app/embed/werkstatt-finder/_components/GlassSurface.tsx`).

## Datenfluss
`WerkstattVorschlag` (Empfehlung-Loader `getWerkstattEmpfehlungByToken` + Embed-`actions.ts`) trägt
alle Profil-Felder. **Plan-Verifikation:** sicherstellen, dass `google_rating`/`-count` im Embed-Pfad
tatsächlich befüllt sind (`SELECT_COLS` enthält sie — an einer echten Zeile prüfen) und dass der
Empfehlung-Loader `WERKSTATT_COLS` sie mitnimmt (heute nicht → **Loader-`WERKSTATT_COLS` um
`google_rating,google_review_count` ergänzen**, damit die Empfehlung-Card das Badge zeigen kann).

## Wiederverwendung
`GoogleBewertungBadge` (shared) · GlassSurface (Embed) · `WerkstattFinder` (geteilt) · die
`gruende`-Chip-Logik der Matching-Engine · das Popup-Render-Muster des Gutachter-Embeds.

## Blast-Radius / Regression
`WerkstattFinder` ist geteilt (Empfehlung · Embed-Liste · SV-Empfehlen-Card · Dispatch). Die
Card-Anreicherung (Google-Badge) ist **additiv + benigne** überall (kein Verhaltens-/Ranking-Change,
nur +1 Badge wenn Rating da). Das volle Popup ist **embed-only**. Kein bestehender Consumer bricht.

## Testing
- **Unit** (`WerkstattProfileInhalt`): rendert Firmenname · verifiziert-Marker · Google-Badge bei
  Rating · Marken-/Gewerke-Chips aus `gruende`; **graceful degradation** (kein Rating → kein Badge;
  keine Marken → kein Chip; kein Ort → „Werkstatt in Ihrer Nähe").
- **Regel-4-Prod-Smoke** (nach Deploy): (a) Empfehlung-Route — Card zeigt Google-Badge; (b) Embed-Map
  — Pin-Klick zeigt das Profil-Popup (Firmenname + Badge + Marken-Chip). Isolierte Wegwerf-Werkstatt
  (`google_rating` gesetzt, finder-sichtbar via `.invalid`-Email), Cleanup 0-leftover.

## Offen / flexibel (Aaron-Review)
- **Fahrzeug-Gruppen** (PKW/LKW) als Chip-Sektion — Default: **nur im vollen Popup** wenn nicht-leer;
  kompakte Card ohne.
- **Distanz** im Popup — Default: **ja** (Pin-Kontext „X,X km entfernt"); die Card hat sie schon.
- **Telefon/Adresse** im Popup — Default: Adresse ja, Telefon spiegelt die Card.
