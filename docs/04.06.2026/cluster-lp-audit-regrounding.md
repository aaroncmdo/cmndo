# Cluster-LP Audit Re-Grounding — SOLL-Mock vs IST-Live (2026-06-04)

## TL;DR
Das Audit `COMPLETE_AUDIT_LIVE_PART4_VISUAL` meldete „13 systematische Bugs" als Deploy-Rückstand auf den 3 Cluster-LPs (Wuppertal/Düsseldorf/Bonn). **Verifikation gegen den aktuellen Source ergab: Live == Source.** Die meisten Findings waren **Mock-vs-Live-Drift oder Cache-Artefakte** (False-Positives), **kein** Deploy-Gap. Real waren nur **3 Code-Lücken (S4/S6/S7)** — gefixt + live deployed (PR #2409). Ein blinder Redeploy hätte **nichts** gefixt (wäre ein No-Op gewesen).

## Methodik-Fehler des Audits
- Audit-Baseline: **SOLL = statischer HTML-Mock** (`preview-complete_v3-praxis-v2.html`) vs **IST = Live-Site**.
- Daraus „Live hinkt dem Mock nach" geschlossen. Falsch: die Live-**React**-App ≠ der **statische Mock** by design (andere Element-Counts, eigene Reimplementierung, responsive 1-Logo statt 3-Img-Swap usw.).
- Korrekte Baseline = **Live-gerendertes HTML vs aktueller Source-Code**, nicht vs Mock.

## Verifikation (wie geprüft)
1. **Source-Diff:** 11 audit-relevante Files (HeroSection, EinsatzgebietSection, NetzwerkSection, FinalCta, ReviewsSection, RatgeberSection, LandingPage, cluster.ts, content.ts, schema.ts, globals.css) — **alle byte-identisch** zwischen Live-VPS (`/var/www/kfz-unfallgutachter-{city}-app`) und Source-Branch, über **alle 3 Cluster**.
2. **Live-HTML-Probe** (curl gegen die 3 Domains): Schema-`@type`s, Section-Anker, Hero-Sub-Texte, Solingen-Spoke-Daten.

## Per-Finding-Verdikt
| Audit | Verdikt | Beleg |
|---|---|---|
| **S1** Hero-Sub lang | **Design-Entscheidung** (Live==Source, langer DAT-Text rendert) → Aaron: **lang lassen** | curl: lang+kurz beide vorhanden |
| **S2** `--header-bg-tint` leer | **Mock-Artefakt** — Var existiert im Source gar nicht, nichts konsumiert sie | grep: 0 Treffer |
| **S3** Logo 3→2 | **Zählrauschen** — 1 responsives Logo statt 3 Img-Swaps | Header.tsx |
| **S4** Schema 3 statt 5 | **REAL** — Live emittierte nur AutomotiveBusiness/FAQPage/BreadcrumbList | curl @types |
| **S5** Ratgeber-Section | **Bewusst im App** (Mock veraltet) → Aaron: **behalten** + Mock nachziehen | LandingPage:49 |
| **S6** `#netzwerk` fehlt | **REAL** — 0× `id="netzwerk"` im Live-HTML | curl |
| **S7** `#final-cta` fehlt | **REAL** — 0× `id="final-cta"` im Live-HTML | curl |
| **S8** Eyebrow-Space | Minor/kosmetisch | — |
| **S9/S10/S12** Element-Counts | **Zählrauschen** React vs Mock (S10: h3 0→5 = App ist *besser* indexierbar) | — |
| **S11** Mini-Stadtteil-Icons | **Design-Choice** (Text-Pills `einsatz-pills` statt Img-Icons) | EinsatzgebietSection |
| **B1/B2** Solingen zeigt Wuppertal-Daten | **Audit-Artefakt/Cache** — Solingen-Seite ist Solingen-primär (80× Solingen vs 24× Wuppertal), `city.main`-Guard aktiv, `seoTextFor` per-City, **keine** Wuppertal-Stadtteil-Liste | curl `/lp/solingen` |
| **DUS-X1** Petrol | **Entscheidung** — `#0B3D6E` (Live==Source) vs Spec `#1E2A38` → Aaron: **#0B3D6E behalten** (Rhein-Identität stärker), Spec nachziehen | globals.css |
| **B4** Widukindstraße-Hub | **Feature** (nie gebaut), kein Bug → eigenes Ticket | 404 |

## Gefixt + LIVE (04.06) — PR #2409
- **S6** `<section id="netzwerk">`, **S7** `<section id="final-cta">`, **S4** `serviceSchema` + `personSchema` (Person-Namen Amet/Jens/Stefan — rechtlich abgesegnet, nur Vornamen + Firma im Impressum). Home emittiert jetzt **5 JSON-LD-Blocks** statt 3.
- **Deploy:** source-only SFTP der geänderten Files + `npm run build && pm2 reload` (a11y-Flow, build-fail⇒kein-reload⇒Live-safe), sequenziell über die 3 Apps. Gegen Live-HTML verifiziert (alle 3 Domains HTTP 200, Service + Person + beide Anker).

## Lehre (für künftige Audits)
1. **Bei „Mock-SOLL vs Live-IST"-Audits IMMER gegen den aktuellen Source verifizieren**, bevor man „Deploy-Gap" schließt oder redeployt. Sonst riskiert man einen No-Op-Prod-Deploy + falsche „gefixt"-Meldung.
2. **Element-Count-Diffs** zwischen React-App und statischem Mock sind **strukturelles Rauschen**, kein Bug-Signal.
3. **„Live zeigt X" kann Cache sein** — gegen gerendertes Live-HTML *und* Source prüfen, nicht gegen einen Screenshot/Mock von gestern.
4. Echte Bugs sind die **semantischen** (fehlende Schema-Types, fehlende Anker, falsche Daten). Die stecken dann meist im **Source** (Code-Fix), nicht im Deploy.
5. Der statische Master-Mock driftet zwangsläufig von der lebenden App weg → er ist eine **Design-Referenz, keine Audit-Baseline**.
