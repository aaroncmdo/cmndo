# Marketing-Karte Privacy-Refactor

**Datum:** 14.05.2026
**Ziel:** Identitäten unserer SVs auf `/gutachter-finden` schützen. Customer sieht nur, was zum Vertrauen aufbauen reicht — keine Identifikations-Hinweise die zu „Abspringen über Google-Suche" führen.

## Soll-Verhalten

| SV-Gruppe | Quelle | Marker | Klickbar | Popup-Inhalt |
|---|---|---|---|---|
| `paket='standard'` (5 SVs in DB) | `sachverstaendige` | Avatar-Kreis mit Vorname-Initiale (z.B. „H") | Ja | Anonymes Profil: Region + Sterne + Specs + Initialen-Avatar + Wizard-CTA |
| `paket != 'standard'` (z.B. `pro`) | `sachverstaendige` | Generischer Claimondo-C-Logo-Pin (18px, navy) | **Nein** (`pointer-events: none`) | — |
| sv_leads (62 Tier-3 Excel-Imports) | `sv_leads` | Generischer Claimondo-C-Logo-Pin (identisch zu Pro) | **Nein** | — |

## Was nicht mehr geleaked wird

| Feld | Vorher | Nachher |
|---|---|---|
| Firmenname | Im Popup direkt sichtbar („Ingenieurbüro Vesser GmbH") | Nie auf Client |
| Adresse | Im Popup direkt sichtbar („Schützenstraße 68-70, 42853 Remscheid") | Stadt extrahiert („Remscheid"), Straße bleibt server-side |
| Marker-Initialen | Aus Firmenname berechnet („IV" für „Ingenieurbüro Vesser") | Vorname-Initiale für klickbare („T" für „Thomas"); Pro/Lead = generisches „C"-Logo |
| Ort-Pill am Marker | Ort sichtbar (z.B. „Bergheim/Erft") | Komplett entfernt |
| Telefon/Email | Nicht im Popup, aber in `SvLead`-Typ exportiert | Vom Public-Typ entfernt — Server-Action returnt sie nicht mehr |
| Iso-Halo (Einsatzgebiet) | Für alle Tier-1 SVs gezeichnet | Nur für `paket='standard'` — andere wären in dünn-besiedelten Regionen identifikations-Hinweis |

## Implementierungs-Details

### Server-Action — `src/lib/actions/gutachter-finder-actions.ts`

- Typen umbenannt: `SvLead` → `SvLeadPublic`, `AktiverSV` → `AktiverSVPublic`. Public-Typen enthalten nur Felder, die anonym sind oder rein anonymisiert wurden.
- `ladeSvLeads`: select nur noch `id, lat, lng` — kein `name, firma, adresse, telefon, email`.
- `ladeAktiveSVs`: zwei-Phasen-Read:
  1. Anon-SSR-Client liest `paket, profile_id, standort_*, spezifikationen, isochrone_polygon` (alles RLS-erlaubt).
  2. Service-Role-Admin-Client liest `profiles.vorname` + `google_bewertungen_cache.{durchschnitt, anzahl_bewertungen}` für die `paket='standard'`-Subset. Beide Tabellen sind anon-RLS-blockiert; wir reichen NUR die anonymisierten Aggregate raus (Initiale + Sterne-Zahl).
- Helper `extractStadt(adresse)`: matched gegen `, 12345 STADT` — robust gegen typische Adress-Formatierungen.
- Helper `firstInitial(name)`: nimmt nur den ersten Buchstaben, upper-case — kein voller Vorname je auf den Client.

### Client — `src/app/gutachter-finden/GutachterFinderMapClient.tsx`

- Zwei Helper-Funktionen am Modul-Top:
  - `addDeadPin(map, store, lng, lat)`: 18px Navy-Kreis mit „C"-Logo, `pointer-events: none`, `cursor: default`, `aria-hidden`. Mapbox propagiert Klicks dann an die Karte → User kann pan/zoom darüber wie normaler Untergrund.
  - `addClickableMarker(map, store, sv)`: 40px Avatar mit Vorname-Initiale + Online-Dot. Popup mit Region + Sterne (wenn Cache-Eintrag da) + Top-3-Specs (wenn vorhanden) + „Über Wizard anfragen →"-Button.
- Marker-Loop split:
  - `aktiveSVs.forEach`: `paket === 'standard'` → `addClickableMarker`, sonst → `addDeadPin`.
  - `svLeads.forEach`: immer `addDeadPin`.
- Popup-CTA emittiert `claimondo:open-wizard` Custom-Event statt `claimondo:select-sv`. Handler scrollt die Sidebar nach oben und öffnet das Mobile-Sheet — kein direkter SV-Kontaktpfad.
- Status-Pill: kein „Premium-Partner + weitere Sachverständige"-Wording mehr (war Paket-Detail). Nur noch konsolidierter `${total} Sachverständige in Ihrer Nähe`.
- Iso-Halo: gefiltert auf `paket === 'standard'`. Dead-Pin-SVs bekommen keinen Halo (würde sie in dünn-besiedelten Regionen identifizierbar machen).

### Marker-XSS-Härtung

Popup-Inhalt wird via Template-Literal in `setHTML()` gerendert — alle dynamischen Werte (`stadt`, `spezifikationen_top3`) werden durch `escapeHtml()` geschickt. Vorher waren `firmenname` und `adresse` direkt eingesetzt — wenn ein böswilliger SV-Eintrag HTML-Markup im Firmennamen gehabt hätte, hätte das XSS gefeuert. Mit dem Refactor sind die Felder a) entfernt und b) verbleibende Werte explizit escaped.

## Smoke (lokal gegen Prod-DB)

Playwright-Test `tests/e2e/flows/audit-gutachter-finder-screens.spec.ts` ist nicht-CI, dient als Audit-Tool:

```
diag: {
  markers: 69 (4 klickbar + 65 dead-pin),  // 5 paket=standard - 1 ohne iso = 4 klickbar; rest = 65 dead-pin
  popups captured: lead=true (klickbarer Standard-Marker hat Popup)
  hasIngenieurbuero: false,  // kein "Ingenieurbüro X" in HTML
  hasSvBuero: false,         // kein "Sachverständigenbüro X"
  hasVesser: false,          // keine bekannten Firma-Spezifika
}
```

Screenshots in `screens-anonymisiert/`:
- `01-desktop-vollbild.png` — Karte mit ~5 sichtbaren Dead-Pins + 1 großem klickbaren Marker um Köln
- `02-popup-lead.png` — Popup eines klickbaren Standard-SVs: „Sachverständiger in Köln", Initialen-Avatar, „Über Wizard anfragen"-CTA
- `03-mobile-vollbild.png` — Mobile-View: 1 Klickbar-Marker mit „T"-Initiale + Dead-Pins
- `04-mobile-sheet-open.png` — Mobile-Bottom-Sheet expanded mit Wizard-Step 1

## Was NICHT in diesem Refactor

- **Defense-in-Depth RLS:** Die admin-only Policies mit `polroles={-}` (z.B. `sachverstaendige."Admins full access"`) sollten auf `TO authenticated` eingeschränkt werden. Anon evaluiert sie dann gar nicht. Separater PR — Inzident-Stand siehe `PROD-BREAKER-MARKETING-KARTE.md` Folge-Punkt.
- **Marker-Position-Jitter:** Aaron hat explizit „nicht" gewählt. Position bleibt exakt am SV-Standort.
- **Hover-Tooltips für Dead-Pins:** Aaron: „komplett dead — kein Hover, kein Cursor-Change, kein Klick".
- **Sterne/Specs für Pro-SVs:** Sie sind nicht klickbar, also gibt's kein Popup → keine Sterne/Specs zu zeigen.

## Daten-Setup (für Marketing-Funktion)

Damit die klickbaren Popups attraktiv aussehen, müssen `paket='standard'`-SVs:
- `profiles.vorname` befüllt haben — Avatar-Initiale (✓ alle 5 haben)
- `sachverstaendige.spezifikationen` befüllt haben — Top-3 als Chips (✓ 2 von 5 haben, 3 leer)
- `google_bewertungen_cache` Einträge haben — Sterne anzeigen (✗ keine in DB — Cache leer)

**Folge-Tickets** (nicht im Scope):
- `google_bewertungen_cache` befüllen via Google-Places-API für die 5 Standard-SVs
- `sachverstaendige.spezifikationen` Befüll-UI im SV-Portal nachschärfen
