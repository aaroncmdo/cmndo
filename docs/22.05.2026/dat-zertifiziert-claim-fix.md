# Marketing-Claim-Fix: "DAT-zertifiziert" -> "zertifiziert" + DAT-Experts-Zugang

**Datum:** 2026-05-22
**Branch:** `kitta/dat-claim-wording-fix` (PR gegen `staging`)
**Trigger:** Aaron — auf der kfzgutachter.claimondo.de-Landeseite (Hero) entdeckt:
es darf nicht "DAT-zertifizierte Gutachter" heissen (impliziert faelschlich eine
Zertifizierung *durch* die DAT). Korrekt: "Zertifizierte Gutachter" + die DAT-Beziehung
ist "Exklusiver Zugang zum DAT Experts-Netzwerk" (Zugang/Mitgliedschaft, keine Zertifizierung).
Scope auf Aaron-Wunsch: **alle Marketing-Seiten** (nicht nur die kfzgutachter-LP).

## Transformations-Regel (konsistent ueber alle Sprachen)

1. **Falsche Zertifizierungs-Behauptung entfernen:** `DAT-zertifiziert*` /
   `DAT-Expert-zertifiziert*` (und die uebersetzten Varianten) -> Qualifizierer `DAT-`/
   `DAT-Expert-` streichen -> nur `zertifiziert*`. Satzanfaenge wurden wieder gross
   geschrieben (Zertifizierte / Certified / Sertifikalı / Сертифицированная).
2. **Hero-Bullet-Listen** bekommen zusaetzlich den Eintrag
   **"Exklusiver Zugang zum DAT Experts-Netzwerk"** (kfzgutachter-LP-Hero mit `Award`-Icon,
   HauptseitePremium, kfz-gutachter/[stadt], llms-full Trust-Bullets-Spiegel).

### Bewusst NICHT angefasst (legitime DAT-Referenzen, keine Zert-Behauptung)

- Hero-Badge "DAT-Sachverständigen-Netzwerk · bundesweit erreichbar" (HauptseitePremium) —
  Aaron waehlte Bullet-Platzierung, nicht Badge.
- "oeffentliches DAT-Verzeichnis" / "public DAT directory" / "dat.de/sachverstaendige" —
  Quellen-Angabe, faktisch haltbar, keine Zertifizierungs-Behauptung.
- "DAT-Gutachter", "DAT-Standard", "DAT-Kalkulationssystem",
  "DAT (Deutsche Automobil Treuhand)"-Erklaerung (FAQ), `dat_badge: "DAT Expert Partner"`
  (i18n, alle Locales), ueber-uns-Titel "DAT Expert Partner-Netzwerk".

## Betroffene Dateien (22)

**Marketing-Seiten / Komponenten (DE-UI):**
- `src/components/landing/HauptseitePremium.tsx` (Haupt-Hero: Bullet-Split + Add, 4 Prosa)
- `src/components/landing/HauptseiteClient.tsx` (Dead-Code, 0 Consumer — der Vollstaendigkeit halber mitgezogen)
- `src/app/kfzgutachter-lp/page.tsx` (Ads-LP, Ursprung des Reports: Hero-Bullet-Split + Add + `Award`-Import, 4 weitere Stellen)
- `src/app/kfz-gutachter/page.tsx` (5), `src/app/kfz-gutachter/[stadt]/page.tsx` (Hero-Bullet + 5)
- `src/app/vorteile/page.tsx`, `src/app/ueber-uns/page.tsx` (3), `src/app/wie-es-funktioniert/page.tsx`
- `src/app/gutachter-finden/page.tsx` (3), `src/app/gutachter-finden/GutachterFinderMapClient.tsx` (Map-Popup)
- `src/app/dispatch/leads/[id]/_sidebar/SidebarStubs.tsx` (Einwand-Antwort, kundensichtbar)

**SEO / Maschinen-Texte:**
- `src/app/opengraph-image.tsx`, `src/lib/seo/jsonld.ts`
- `src/app/llms.txt/route.ts` (2), `src/app/llms-full.txt/route.ts` (6, inkl. Trust-Bullets-Spiegel)

**i18n (je 4 Keys: description / p2 / p3 / sub):**
- `src/i18n/messages/{de,en,ar,pl,ru,tr}.json`

## Verifikation

- `npx tsc --noEmit` -> **gruen** (exit 0). `Award`-Import + 5. Bullet-Element typsicher.
- Alle 6 i18n-JSON-Dateien per `JSON.parse` validiert -> valide.
- Grep nach `DAT-zertifizier|DAT-certified|DAT-Expert-[Zz]ertifizier|DAT-sertifikalı|DAT-сертифиц`
  ueber `src/` -> **0 Treffer** (Cert-Behauptung restlos entfernt).
- Voller `npm run build` lokal nicht gefahren (isolierter Worktree ohne eigene node_modules;
  Connection-Pool durch parallele Sessions belastet) -> gating CI-Build auf dem PR + Staging-Smoke decken das ab.

## Offen / Follow-up

- **Staging-Smoke mit Screenshot** nach Merge gegen `app.staging.claimondo.de`:
  kfzgutachter-LP-Hero + Hauptseite-Hero — speziell der 5. Bullet im 2-Spalten-Grid
  (wird 2-2-1; langes Label "Exklusiver Zugang…" umbricht in der Zelle — laut Markup unkritisch,
  visuell bestaetigen). Sprach-Umschaltung (en/pl/ru/tr/ar) auf ueber-uns optional.
- **Nicht-DE-Locales (ar/pl/ru/tr)** wurden mechanisch korrigiert (Cert-Qualifizierer entfernt);
  ein muttersprachlicher Review ist nice-to-have, inhaltlich aber nur eine Streichung.
- **Bewusst offen gelassen** (kein Teil dieses Fixes, ggf. separat entscheiden): KPI-Stat-Pattern
  `{ wert: 'DAT', label: 'zertifiziertes Partner-Netzwerk' }` (mehrere Seiten) — rendert "DAT"
  als Stat-Wert neben "zertifiziertes … Netzwerk". Keine woertliche "DAT-zertifiziert"-Behauptung,
  aber thematisch verwandt; bewusst nicht angefasst.
