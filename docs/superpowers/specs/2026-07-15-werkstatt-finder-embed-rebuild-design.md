# Werkstatt-Finder-EMBED — Rebuild als Entry-Point (Design)

**Datum:** 2026-07-15
**Status:** Design — approved (Aaron 15.07.)
**Branch:** `kitta/werkstatt-finder-embed-rebuild` (off staging)
**Folge-Spec zu:** `docs/superpowers/specs/2026-07-14-werkstatt-matching-foundation-design.md` (§5 — die zwei Finder)
**Visuelle Vorschau (Mockup):** https://claude.ai/code/artifact/8f1546db-355b-46b3-9c52-fbc907297e5f

**Zweck:** Der Werkstatt-Finder-Embed *existiert*, ist aber **verwaist** (kein Entry-Point auf claimondo.de), nutzt die **alte** Fit-Suche statt der gerankten Engine und ankert nur auf **PLZ**. Dieser Rebuild macht ihn zum echten Einstieg: Karten-Finder analog Gutachter, gerankte Vorschläge mit Begründungs-Chips, präziser Google-Places-Standort, GBP-Trust, und eine **lückenlose db-driven Übergabe** an Lead → FlowLink → Portal/Auftrag.

---

## 0. Aaron-Vorgaben (verbindlich, 15.07.)

- Karten-Finder **analog Gutachter-Embed** (FinderMap + Glass-Card links, mehrstufig). Mobil = **Bottom-Sheet**.
- Anfrage-Wizard sammelt die Engine-Inputs; **Schaden ist Pflicht** (eine von Fotos / Beschreibung / manueller Gewerke-Auswahl).
- **Marke rankt** („markengebunden schlägt frei"); **keine Marke gepflegt = freie Werkstatt** (`ist_freie_werkstatt=true`), NICHT „unbekannt".
- **Standort = EIN präzises Adressfeld (Google Places Autocomplete)** + Button **„Aktuellen Standort verwenden"** (Browser-Geolocation). Kein PLZ/Genau-Ort-Split.
- **Trust = Google Business Profile (GBP-Rating)** — Pattern von der SV gespiegelt.
- **gewerblich/privat** wird abgefragt + **db-driven** bis in den Auftrag durchgereicht.
- **Text-Schadenbeschreibung** als Alternative zu Fotos → Text-KI → Gewerke-Match **und** in die Schadenfeststellung.
- **Alle Daten db-driven** an Lead/FlowLink/Portal — kein Datenverlust beim Übergang.
- Entry-Point = eigene **claimondo.de-Seite** + **Navbar-Button „Werkstatt finden"**.
- **Hinten dran (eigene spätere Phasen):** KVA/Gutachten-Upload · Werkstatt-Terminkalender · Partner-Tiers (Silber/Gold).

---

## 1. Ist-Stand (live verifiziert 15.07.)

| Baustein | Wo | Status |
|---|---|---|
| Embed-Seite (iframe-bar, ConsentBridge, `lat/lng/plz`) | `src/app/embed/werkstatt-finder/page.tsx` | ✅ da |
| Embed-Client (Suche/Foto/Bedarf/Pick/Kontakt → Redirect `/flow`) | `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` | ✅ da, **alte Suche** |
| Server-Actions (Foto-KI, Suche, Lead-Anlage+FlowLink) | `src/app/embed/werkstatt-finder/actions.ts` | ✅ da |
| **Alte** Suche (`findWerkstaetten` + `qualifiziereWerkstaetten`, geo+fit) | `src/lib/werkstatt/finder.ts`, `bedarf/qualifiziere.ts`, `bedarf/fit.ts` | ✅ auf staging |
| **Neue** Rank-Engine (`rankeWerkstattVorschlaege`, Marke/Gruppe/Chips) | `src/lib/werkstatt/matching/rank-vorschlaege.ts` | ⚠️ **nur in #4359** (ungemergt) |
| FlowLink-Gegenpart (In-Flow-Finder wenn `reparatur_werkstatt_id` leer) | `src/app/flow/[token]/FlowWerkstattStep.tsx` | ✅ da |

**Die 3 Lücken (Rebuild-Kern):**
1. **Kein Entry-Point** → verwaiste Route. Der Gutachter-Finder hat `claimondo-marketing/components/gutachter-finden/GutachterFindenSection.tsx` + `.../landing/sections/SvFinderSection.tsx` — der Werkstatt-Embed hat **nichts** (nur Docs/Tests/Seed referenzieren ihn).
2. **Alte Engine** — `sucheEchteWerkstaetten` → `findWerkstaetten` (geo+fit), NICHT die gerankte `rank-vorschlaege` (Marke/Gruppe/Chips).
3. **PLZ-only / findet keine Werkstätten** — der Anker ist PLZ/lat-lng aus der URL, kein präziser Fahrzeugstandort; im Test kamen 0 Treffer.
+ **Doppel-Lead-Falle**: `erstelleWerkstattFinderLead` macht **immer** `createLead` (INSERT), nimmt kein `leadId` → bei bestehendem Lead entsteht ein zweiter.

---

## 2. Die 4 Kern-Phasen

**Phase 1 — Engine live + Daten-Kontrakt.** Kontrakt festnageln (§3), Embed-Suche auf `rankeWerkstattVorschlaege` umhängen, **am Fahrzeugstandort verankert**. Vorbedingungen: #4359 auf der Basis + Werkstatt-Datenpflege (Marken/Gruppen NULL). Text-KI-Klassifikator + GBP-Felder gehören hierher.
**Phase 2 — Karte + mehrstufige Anfrage.** FinderMap (Werkstatt-Pins, Fahrzeugstandort-Anker) + linke Glass-Card mit dem 4-Schritt-Wizard; jeder Schritt füttert die Engine → Live-Re-Rank. Mobil = Bottom-Sheet. Google-Places-Standort + „Aktuellen Standort".
**Phase 3 — db-driven Übergabe.** Bei „Werkstatt anfragen": alle Felder auf den Lead (create ODER update — Doppel-Lead-Falle) → FlowLink trägt sie → Portal/Auftrag liest sie.
**Phase 4 — Entry-Point.** claimondo.de-Extra-Seite (bindet den Embed ein) + Navbar-Button „Werkstatt finden" + Mobile-Bottom-Sheet-Verhalten.

Reihenfolge-Begründung: Rückgrat (Kontrakt+Engine) steht getestet, **bevor** UI daran hängt → die Anfrage sammelt exakt die Contract-Felder (keine Nacharbeit), die Übergabe reicht genau diese weiter, der Entry-Point macht am Ende etwas Fertiges sichtbar. Jede Phase einzeln ship- + smokebar.

---

## 3. Der Daten-Kontrakt (db-driven Rückgrat)

Die Felder, die die Engine *frisst* UND die durchfließen — ein Satz, kein Bruch:

| Feld | Lead-Spalte | Engine? | Fließt nach |
|---|---|---|---|
| Fahrzeugstandort (Geo-Anker) | `fahrzeug_standort_lat/_lng/_adresse` | ✅ Distanz-Anker | Claim, Werkstatt-Distanz |
| Marke / Hersteller | `fahrzeug_hersteller` | ✅ Marken-Rank | Claim/Vehicle `hersteller` |
| Fahrzeugtyp → EU-Klasse | `fahrzeugklasse` (Spec B/1) | ✅ Gruppen-Filter | Claim/Vehicle; Schein-OCR verfeinert im Flow |
| Gewerke-Bedarf | `bedarf_kategorien/_quelle/_confidence/_ermittelt_am` | ✅ Gewerke-Filter | Claim, Feststellung |
| Schadenbeschreibung (Freitext) | `fahrzeugschaden_beschreibung` | (via Text-KI → bedarf) | Claim, **Schadenfeststellung** |
| Schadensfotos | `schadensfoto_urls` (jsonb) | (via Foto-KI → bedarf) | Claim, Feststellung |
| gewerblich/privat | `gewerbe_flag` (+ `firma_name`, `vorsteuerabzugsberechtigt`) | – | **`claims.gewerbe_flag`** (convert Z.359) + `claim_parties.ist_gewerbe` (Z.629) + Firma-Entität (Z.801) |
| Gewählte Werkstatt | `reparatur_werkstatt_id` | – (Anzeige-Regel) | Claim, `reparatur_termine` (b1) |
| Kontakt | `email` (Pflicht), `vorname/nachname/telefon` | – | Lead/Account/Flow |

**NICHT im Embed** (erst im Flow, Conversion): Kennzeichen, Wunschtermin. **Alle Contract-Spalten existieren** (via convert-Copy-Liste geprüft) — **kein DDL** fürs Text-/gewerbe-Feld. Additive DDL nur für: GBP-Spalten (§6). `fahrzeugklasse` kam bereits mit Spec B/1.

---

## 4. Anfrageformular (Glass-Card, mehrstufig)

| Schritt | Feld | Pflicht |
|---|---|---|
| **1 Standort** | 1 präzises Adressfeld (Google Places) + „Aktuellen Standort verwenden" (Geolocation) → `fahrzeug_standort_*` | ✅ |
| **2 Fahrzeug** | Hersteller (Autocomplete) · Fahrzeugtyp (PKW/Transporter/LKW/Motorrad/Anhänger, Default PKW) · **gewerblich/privat** · Modell (optional) | ✅ (Modell optional) |
| **3 Schaden** | **eine von:** Fotos (Vision-KI) · Beschreibung (Text-KI) · manuelle Gewerke-Auswahl | ✅ Pflicht |
| **4 Kontakt** | E-Mail · Vorname/Nachname/Telefon (optional) | ✅ (Rest optional) |

Ergebnisse (bis 5) als **Pins auf der Karte** + Liste in der Card, jede mit Begründungs-Chips. Pick → „Werkstatt anfragen".

---

## 5. Engine (aus #4359, `rank-vorschlaege.ts`)

**4 Achsen, in dieser Priorität:**
1. **Marke** (`MARKEN_RANG {marke:0, frei:1, unbekannt:2}`) — führt die Werkstatt die gesuchte Marke → `marke`; sonst `ist_freie_werkstatt=true` → `frei`; sonst `unbekannt` (= markengebunden für *andere* Marke, rankt zu Recht schlechter).
2. **Gewerke-Fit** (`bedarf ⊆ faehigkeiten`; leer = „unbekannt", nicht „kann alles") — **hart** gefiltert ab `bedarf_confidence >= 60`.
3. **Gruppen-Fit** (Fahrzeug-Gruppe ∈ `fahrzeug_gruppen`; leer = unbekannt → nicht ausschließen).
4. **Distanz** (Haversine zum **Fahrzeugstandort**).

**Bis zu 5, kein Auto-Assign.** Jede mit `gruende: MatchGrund[]` (Chips): `marke` · `gewerk` · `klasse` · `distanz` · `trust`.
**Trust-Chip = GBP-Rating** (s. §6), zusätzlich `verifiziert`. `passt`-Feld = backward-compat für die bestehende UI.

---

## 6. GBP (Google Business Profile) — SV-Pattern spiegeln

SV hat: `sachverstaendige.standort_place_id` + `src/components/GoogleBusinessFeld.tsx` + `src/lib/actions/sv/google-business.ts`.
→ **Werkstatt spiegelt das:** neue Spalten auf `werkstaetten` (additiv, via `apply_migration`):
```
google_place_id      text
google_rating        numeric(2,1)   -- gecacht, nicht live pro Render
google_review_count  int
google_rating_am     timestamptz    -- Cache-Refresh-Marker
```
- Rating **gecacht** (nicht live bei jedem Finder-Render — Kosten/Latenz). Refresh periodisch/bei Datenpflege.
- `GoogleBusinessFeld` wird in der **Werkstatt-Datenpflege** (Task #10 / `/admin/werkstaetten/[id]`) wiederverwendet.
- **OFFEN (Phase 1):** `google-business.ts` lesen — genaues Refresh-/Storage-Verfahren der SV bestätigen und 1:1 übernehmen.

---

## 7. Standort — Google Places + Aktueller Standort

- **`src/components/GooglePlaceAutocomplete.tsx`** wiederverwenden (existiert; `NEXT_PUBLIC_GOOGLE_MAPS_KEY` gesetzt) → EIN präzises Adressfeld.
- Button **„Aktuellen Standort verwenden"** → `navigator.geolocation.getCurrentPosition` → Reverse-Geocode (`src/lib/google-geocoding/geocode-address.ts`) → befüllt Adresse + `fahrzeug_standort_*`.
- Beides schreibt **präzise Koordinaten** — behebt „findet keine Werkstätten" (der alte PLZ-only-Pfad ohne saubere Coords).
- ⚠️ Iframe: Google-Maps-JS im Embed braucht die JS-API + erlaubte Referrer für die Key-Domain; Geolocation braucht HTTPS + User-Geste.

---

## 8. UI (Karte + Glass-Card + Mobile Bottom-Sheet)

- **Analog `src/app/embed/gutachter-finder/_components/`** (FinderMap, GlassSurface, FinderWizard-Muster) — gleiche UI-Sprache, wo sinnvoll wiederverwenden/teilen.
- Desktop: Karte full-bleed, Glass-Card links (mehrstufig), Ergebnis-Pins + Popup.
- Mobil: Karte oben, **ziehbares Bottom-Sheet** trägt Wizard + Ergebnisse.
- Branding: Claimondo-Tokens (`bg-claimondo-*`, `rounded-ios-*`, GlassPanel) — greifen automatisch aufs Brand-Theme.
- Referenz-Look: die veröffentlichte Vorschau (oben).

---

## 9. db-driven Übergabe (Lead → FlowLink → Portal/Auftrag)

- `erstelleWerkstattFinderLead` erweitern: **alle** Contract-Felder (§3) schreiben — inkl. `gewerbe_flag`, `fahrzeug_hersteller`, `fahrzeugklasse`, `fahrzeug_standort_*`, `fahrzeugschaden_beschreibung`.
- **gewerbe-Durchlauf verifiziert:** `convert-lead-to-claim.ts` schreibt `lead.gewerbe_flag` → `claims.gewerbe_flag` (Z.359) + `claim_parties.ist_gewerbe` (Z.629) + `vorsteuerabzugsberechtigt` (Z.360) + Firma-Entität (Z.801). **Kein Gap** — der Embed muss nur den Flag setzen.
- FlowLink via `ensureCanonicalFlowLinkForLead` (bereits im Code) → `/flow/<token>` → Portal.

---

## 10. Doppel-Lead-Falle

`erstelleWerkstattFinderLead` optional `leadId`/Token annehmen → **UPDATE statt INSERT** (mirror des Gutachter-Finder-Fixes). Entry ohne Lead = INSERT; Entry mit bestehendem Lead = Zuordnung/Update. Anzeige-Regel durchgängig: `reparatur_werkstatt_id` gesetzt → anzeigen, kein Finder (analog `sv_id`).

---

## 11. Entry-Point (Phase 4)

- **claimondo.de-Extra-Seite** (Marketing-Build `claimondo-marketing/`), die den App-Embed (`app.claimondo.de/embed/werkstatt-finder`) einbindet — analog `GutachterFindenSection`/`SvFinderSection`.
- **Navbar-Button „Werkstatt finden"** (Marketing-Nav).
- Mobile-Bottom-Sheet-Verhalten.
- ⚠️ Marketing ist eigener Top-Level-Build — Token-/Ratchet-Scans erfassen ihn NICHT (AGENTS.md).

---

## 12. Abhängigkeiten + Sequenzierung

1. **#4359 muss auf die Basis** (Engine `rank-vorschlaege.ts`). Delegiert an Release-Lane; bis dahin Phase-1-Code drauf stacken oder Merge abwarten.
2. **Werkstatt-Datenpflege (Task #10)**: `marken`/`fahrzeug_gruppen` sind NULL → Marke/Gruppe ranken erst nach Pflege scharf. GBP-Felder (§6) kommen mit in die Datenpflege-UI.
3. Danach Phase 1 → 2 → 3 → 4.

---

## 13. Hinten dran (spätere, eigene Phasen)

- **Phase 5 — KVA/Gutachten-Upload:** „Ich habe schon ein Gutachten/KVA" → Upload → **OCR** (baut auf `src/lib/ocr/zb1-fields.ts` + beleg-review-OCR + `bedarf/gutachten-gewerke.ts`) → Marke/Klasse/Gewerke/Kosten raus → Matching-Prefill + **Dokument + kompletter Auftrag** durchgereicht.
- **Phase 6 — Werkstatt-Terminkalender:** alle Wunschtermine übersichtlich für die Werkstatt (evtl. Kalender-View im Werkstatt-Portal, `WerkstattAuftragDetail`/Auftraege-Liste).
- **Phase 7 — Partner-Tiers (Silber/Gold):** neues `partner_tier`-Feld als **Tie-Breaker** (nach Marke→Gewerke→Gruppe, um/über Distanz), NIE Top-Boost (sonst steht schlechtere Passung oben). Business-Entscheidung; deferred.

---

## 14. Text-KI-Klassifikator (neu, klein — Phase 1)

Heute nur Foto-Vision (`bedarf/schadenbild-gewerke.ts`) + Gutachten-deterministisch. Neu: `bedarf/schadenbeschreibung-gewerke.ts` (Claude **Text**): Freitext → `Reparaturbedarf` (`quelle='schadenbeschreibung'`, Confidence vom Modell), gleiches Output-Shape wie Fotos → gleiche Engine.
- `ERLAUBTE_QUELLEN` (in `bedarf/sanitize.ts`) um `'schadenbeschreibung'` ergänzen + `BedarfQuelle`-Type.
- Evidenz-Rang (`bedarf/ermittle-bedarf.ts`): Gutachten (100) > Foto-KI > **Text-KI** > manuell (40) > unbekannt.
- Regel: Foto bevorzugt (höhere Confidence); Text-Beschreibung wird **immer** persistiert (`fahrzeugschaden_beschreibung`) — wertvoll für SV/Werkstatt unabhängig vom KI-Ergebnis.

---

## 15. Offene Punkte / Risiken

- GBP-Rating: Storage/Refresh-Verfahren aus `google-business.ts` bestätigen (Phase 1).
- Fahrzeugtyp → EU-Klasse-Mapping: der Embed fragt die grobe Gruppe (PKW/…); Lead speichert eine repräsentative `fahrzeugklasse`, der Schein-OCR im Flow verfeinert. Ambiguität (LKW→N2/N3, Motorrad→L3e/L4e) sauber defaulten.
- Google-Maps-JS im Iframe: Key-Referrer + CSP prüfen.
- **Branch-Koordination:** 2+ Sessions laufen auf `kitta/aar-956-embed-reservierung-rueckruf` (Embed-Nähe) — vor jedem Touch der `embed/werkstatt-finder`-Files abgleichen; dieser Rebuild läuft isoliert auf `kitta/werkstatt-finder-embed-rebuild`.
- „findet keine Werkstätten": in Phase 1 die Wurzel bestätigen (PLZ-Geocoding vs. `nurEchte`/`verifiziert`-Filter) — der Coords-Anker sollte es lösen.

---

## 16. Betroffene Files (Orientierung, nicht abschließend)

- **Engine/Kontrakt (P1):** `matching/lade-vorschlaege.ts` (Loader `findWerkstattVorschlaegeFuer`), `bedarf/schadenbeschreibung-gewerke.ts` (neu), `bedarf/sanitize.ts`, `bedarf/ermittle-bedarf.ts`; Mig: `werkstaetten` GBP-Spalten.
- **UI (P2):** `embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` (Rebuild), neue `_components/` (Map/GlassCard/Steps), `GooglePlaceAutocomplete` (reuse).
- **Übergabe (P3):** `embed/werkstatt-finder/actions.ts` (`erstelleWerkstattFinderLead` — alle Felder + optional `leadId`→UPDATE).
- **Entry-Point (P4):** `claimondo-marketing/` (neue Section + Navbar).
- **Datenpflege (Dep):** `/admin/werkstaetten/[id]` (marken/fahrzeug_gruppen + GBP via `GoogleBusinessFeld`).
