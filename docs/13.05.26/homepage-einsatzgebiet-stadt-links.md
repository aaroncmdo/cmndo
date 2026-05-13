# Smoke-Fix: Homepage „Einsatzgebiet"-Section verlinkt jetzt die Stadt-Landingpages

**Stand:** 13.05.2026 · **Auslöser:** Smoke-Audit-Screenshot `docs/12.05.2026/Smoke audits/BACKLINKS.jpg` — „wo sind die ganzen Subpages hiervon hin?" (die 14 Stadt-Chips der „Überall in NRW"-Section).

## Befund

**Die Subpages existieren** — `/kfz-gutachter/<stadt>` ist eine dynamische Route (`src/app/kfz-gutachter/[stadt]/page.tsx`) mit `generateStaticParams` über `src/app/kfz-gutachter/staedte.ts` (`STAEDTE`-Array: ~17 NRW-Städte + 5 bundesweite Großstädte, jede mit `slug`/`name`/`bvskHonorarSpanne`/`partnerSVs`/Landgericht/Amtsgericht/Kammer/…). Sie sind statisch generiert, in `src/app/sitemap.ts` gelistet (`${SITE_URL}/kfz-gutachter/${s.slug}`), vom `/kfz-gutachter`-Index verlinkt, und `/kfz-gutachter` ist in der `LandingTopbar`-Nav.

**Aber:** Die „Einsatzgebiet"-Section auf der Hauptseite (`HauptseiteClient.tsx`, Section 10, `NrwSection`) hatte ihre **eigene hartgecodete 14-Städte-Liste** und renderte sie als **tote `<div>`-Chips mit `cursor-default`** — kein einziger Link zu `/kfz-gutachter/<slug>`. `git log -S "kfz-gutachter" -- HauptseiteClient.tsx` war leer → die Hauptseite hat **nie** auf die lokalen Subpages verlinkt. → SEO/internes Linking: die Hauptseite ist der wertvollste interne Link-Hub, aber sie reichte keine Crawl-Pfade / kein Link-Equity an die Stadt-Subpages durch (genau der Punkt, den der „BACKLINKS"-Screenshot aufwarf).

Nebenbefund: die alte Hauptseiten-Liste enthielt **Münster, Krefeld, Duisburg** — die haben *keine* `/kfz-gutachter/<stadt>`-Seite (nicht in `staedte.ts`). Umgekehrt hat `staedte.ts` Oberhausen/Paderborn/Hagen/Solingen/Bergisch Gladbach/Remscheid, die die Hauptseite nicht zeigte.

## Fix (frontend-design + seo-geo-Skill)

`HauptseiteClient.tsx` → `NrwSection`:
- Hartgecodete `STAEDTE`-Liste raus, stattdessen die kanonische `STAEDTE` aus `@/app/kfz-gutachter/staedte` importiert, gefiltert auf `bundesland === 'Nordrhein-Westfalen'` (`NRW_STAEDTE`).
- Die Chips sind jetzt `<Link href={\`/kfz-gutachter/${s.slug}\`} prefetch={false}>` statt `<div cursor-default>` — gleiche visuelle Chip-Optik (rounded-full, MapPin-Icon, navy/glass), nur jetzt echte Links. `prefetch={false}` damit nicht 17 Link-Prefetches auf der Homepage feuern.
- Zusätzlicher „Alle Standorte →"-Chip (Link zu `/kfz-gutachter`, der den ganzen Index inkl. der bundesweiten Großstädte zeigt) — als klarer Einstieg in den Standort-Hub.
- Damit zeigt die Section nur noch Städte, die wirklich eine Landingpage haben → keine 404-Chips mehr.

`npm run build` grün, `tsc --noEmit` grün. 1-File-Change (`HauptseiteClient.tsx`), rein additiv.

## Offen (optional, Follow-up)

- **Münster / Krefeld / Duisburg** zu `src/app/kfz-gutachter/staedte.ts` ergänzen (jede braucht den vollen `Stadt`-Datensatz: PLZ-Prefix, Bevölkerung, lat/lng, Landgericht/Amtsgericht/Kammer, BVSK-Honorarspanne, `partnerSVs`, `h1Anker`) — dann erscheinen sie wieder in der Hauptseiten-Section und kriegen eine SEO-Landingpage. Eigenes Ticket (Daten-Recherche pro Stadt).
- Die rechte Spalte der Section („NRW Einsatzkarte") ist noch ein gestreifter Platzhalter mit `ShieldWatermark` — eine echte (statische) NRW-Karte mit den Standort-Pins wäre der nächste Schritt (separat).
