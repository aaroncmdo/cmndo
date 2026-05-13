# Ticket: 3 fehlende NRW-Stadt-Landingpages — Münster / Krefeld / Duisburg zu `staedte.ts` ergänzen

**Typ:** SEO / Stadt-Landingpages-Ausbau · **Owner:** SEO / Frontend · **Priorität:** mittel · **Aufgedeckt:** 13.05.2026 (Smoke-Audit `BACKLINKS.jpg` → Fix in PR #862 — siehe `docs/13.05.26/homepage-einsatzgebiet-stadt-links.md`)

## Kontext

PR #862 hat die „Einsatzgebiet"-Section auf der Hauptseite (`HauptseiteClient.tsx` → `NrwSection`) auf die kanonische `STAEDTE` aus `src/app/kfz-gutachter/staedte.ts` umgestellt — die Stadt-Chips sind jetzt echte `<Link>`s zu `/kfz-gutachter/<slug>`.

Dadurch sind aber **drei NRW-Städte aus der ursprünglichen Hauptseiten-Liste verschwunden**, weil sie *keinen* `Stadt`-Datensatz in `staedte.ts` haben und damit keine Landingpage:

- **Münster** (~320 Tsd. Einwohner, NRW-Westfalen)
- **Krefeld** (~230 Tsd., NRW-Niederrhein)
- **Duisburg** (~500 Tsd., NRW-Ruhrgebiet — eigentlich top-10 NRW-Stadt, sollte unbedingt eine Landingpage haben)

→ Ticket: in `src/app/kfz-gutachter/staedte.ts` `STAEDTE`-Array um diese 3 Einträge ergänzen, mit allen Pflichtfeldern des `Stadt`-Types. `generateStaticParams` (in `[stadt]/page.tsx`) generiert dann automatisch die Pages; `sitemap.ts` listet sie auch automatisch (iteriert über `STAEDTE`); die Hauptseiten-Section zeigt + verlinkt sie wieder (`NrwSection` filtert `bundesland === 'Nordrhein-Westfalen'`).

## Was pro Stadt recherchiert/eingetragen werden muss

Pro Stadt — die Felder des `Stadt`-Types (siehe `src/app/kfz-gutachter/staedte.ts`):

```ts
{
  slug: string                  // URL-Slug, ohne Umlaute (lowercase, ASCII-ä→ae etc.)
  name: string                  // Anzeigename mit Umlauten
  bundesland: 'Nordrhein-Westfalen'
  plzPrefix: string             // z.B. "48" oder "47" — siehe https://www.deutschepost.de/de/p/postleitzahlen.html
  bevoelkerung: string          // z.B. "320 Tsd." (formatiert wie die anderen Einträge)
  lat: number                   // ~4 Nachkommastellen, Stadtmitte (z.B. Google Maps abfragen)
  lng: number
  lokal: {
    landgericht: string         // "Landgericht <Stadt>" — siehe https://www.justiz.nrw/JM/justiz_a_z/landgerichte.php
    amtsgericht: string         // "Amtsgericht <Stadt>"
    kammer: string              // "Rechtsanwaltskammer Hamm" (Westfalen) oder "… Düsseldorf"/"Köln" (Rheinland)
  }
  bvskHonorarSpanne: string     // z.B. "600–2.300 €" — analog zu den anderen mittelgroßen NRW-Städten
  partnerSVs: number            // echte Zahl der Partner-SVs in der Region (ggf. aus dem CRM/DB)
  h1Anker: string               // "in Münster" / "in Krefeld" / "in Duisburg" (Dativ)
}
```

### Vorschlagswerte (zu verifizieren)

| Feld | Münster | Krefeld | Duisburg |
|---|---|---|---|
| `slug` | `'muenster'` | `'krefeld'` | `'duisburg'` |
| `name` | `'Münster'` | `'Krefeld'` | `'Duisburg'` |
| `plzPrefix` | `'48'` | `'47'` | `'47'` |
| `bevoelkerung` | `'320 Tsd.'` | `'230 Tsd.'` | `'500 Tsd.'` |
| `lat` (≈) | `51.9607` | `51.3388` | `51.4344` |
| `lng` (≈) | `7.6261` | `6.5853` | `6.7623` |
| `landgericht` | `'Landgericht Münster'` | `'Landgericht Krefeld'` | `'Landgericht Duisburg'` |
| `amtsgericht` | `'Amtsgericht Münster'` | `'Amtsgericht Krefeld'` | `'Amtsgericht Duisburg'` |
| `kammer` | `'Rechtsanwaltskammer Hamm'` (Westfalen) | `'Rechtsanwaltskammer Düsseldorf'` | `'Rechtsanwaltskammer Düsseldorf'` |
| `bvskHonorarSpanne` | `'600–2.300 €'` | `'600–2.300 €'` | `'600–2.300 €'` |
| `partnerSVs` | aus CRM | aus CRM | aus CRM |
| `h1Anker` | `'in Münster'` | `'in Krefeld'` | `'in Duisburg'` |

## Definition of Done

- [ ] `STAEDTE`-Array in `src/app/kfz-gutachter/staedte.ts` um 3 Einträge ergänzt (in Welle-2-Block, alphabetisch oder nach Bevölkerung)
- [ ] Werte aus der Vorschlagstabelle gegen Quellen verifiziert (Justiz-NRW für Land-/Amtsgericht; CRM für `partnerSVs`)
- [ ] `npm run build` grün (statische Generierung der 3 neuen Pages)
- [ ] `/kfz-gutachter/muenster` / `/krefeld` / `/duisburg` lokal abrufbar — Inhalt sieht nach Welle-2-Template aus
- [ ] In `app/sitemap.ts` automatisch enthalten (iteriert über `STAEDTE` — keine Code-Änderung nötig, nur verifizieren)
- [ ] Auf der Hauptseite („Einsatzgebiet"-Section) erscheinen die 3 Städte wieder als Chip mit Link

## Aufwand

~30–45 min: Daten-Recherche (5–10 min pro Stadt) + die 3 Einträge ergänzen + Build + Smoke. Keine neuen Komponenten, kein neuer Code — nur Daten.
