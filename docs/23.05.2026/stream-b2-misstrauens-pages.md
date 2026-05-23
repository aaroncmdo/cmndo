# Stream B.2 — Misstrauens-Pages (3 Konversions-Pages)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamb2-misstrauens-pages` (off `staging`) · **PR:** gegen `staging`
**Sprint:** LLM-Visibility / GEO (Doc 26 Stream B, Tracking AAR-936) · **Vorlage:** B.1 `/kosten-kfz-gutachten` (PR #1605)

## Was gebaut wurde

Drei bespoke Konversions-Landingpages (KEINE MD-Assets), repliziert nach dem B.1-Muster
(Hero navy + dual-CTA → Antwort-zuerst-Block → strukturierte Sektion → Cross-Links →
`ConversionAnchorBlock` → `SpokeCtaBand`). JSON-LD je Seite: `serviceSchema` +
`faqPageSchema` + `breadcrumbsSchema`.

| Route | Vol (Doc 26) | Kern | Anchor-Variante |
|---|---|---|---|
| `/gegnerische-versicherung-zahlt-nicht` | 400 | Verzug (§ 286), Zinsen (§ 288), Kürzungen (BGH VI ZR 280/22) + 6-Punkt-Decoder-Taktik-Liste | `decoder` |
| `/versicherung-schickt-gutachter` | 40 | Freie SV-Wahl (§ 249), Vergleichstabelle „Ihr SV vs. Prüfdienst" | `decoder` |
| `/unverschuldeter-unfall-rechte` | 150 | Rechte-Pillar: 8-Anspruchs-Grid + 3 Freiheiten (BGH VI ZR 53/09) | `cornerstone` |

### Anchor-Varianten-Entscheidung
Doc 26 B.2 DoD verlangt einen „Decoder-CTA-Block". Die `decoder`-Variante des
`ConversionAnchorBlock` rendert wörtlich *„Sie haben genau diesen Brief bekommen?"* — perfekt
für die zwei reinen Misstrauens-/Brief-Pages (1+2). Page 3 ist ein Rechte-Pillar ohne
„Brief-bekommen"-Kontext → `cornerstone`-Variante (4-Stufen-Liste, wie B.1). Bewusste Abweichung
von der generischen B.1-Cornerstone-Vorlage, spec-treu zu Doc 26.

## Allowlist (307-Trap-Vermeidung)
Jede neue Top-Level-Route in 3 Stellen (mirror B.1), sonst 307 → /login für anon + Crawler
(Build bleibt dabei grün):
- `src/proxy.ts` → `MARKETING_PREFIXES`
- `src/lib/supabase/middleware.ts` → `publicPaths` (`isPublicPath`)
- `src/app/sitemap.ts` (Prioritäten 0.9 / 0.85 / 0.9)

## Compliance
- **BGH-Az.** nur verifizierte / im Codebase etablierte: VI ZR 67/06 (SV-Kosten), VI ZR 280/22
  (Werkstatt-/SV-Risiko), VI ZR 357/03 (Wertminderung via Gutachten), VI ZR 53/09 (freie
  Werkstattwahl). §§ 249/286/288/195/253 BGB.
- **„unsere Partnerkanzlei für Verkehrsrecht"** — LexDrive NIE namentlich (Marketing-/Rezitations-Fläche).
- **0-€-Aussage** auf Page 3 mit „vorbehaltlich Anerkenntnis durch den gegnerischen
  Haftpflichtversicherer" qualifiziert (Konvention aus organizationSchema / ANCHOR_CORNERSTONE_CLOSING).
- **GEO** (Princeton): Answer-First, FAQPage (+40 %), Statistik/Zahlen, Citations (Az./§§),
  Vergleichstabelle, interne Verlinkung in reale Spokes/Decoder (`dynamicParams=false` → nur
  existierende Slugs verlinkt, kein 404).

## Verifikation
- `tsc --noEmit`: **0 Fehler**
- `npm run check:token-audit`: **0 Verstöße** (1686 Files), nur claimondo-Tokens (rgba-Gradient wie B.1/SpokeCtaBand, kein hex)
- `npm run build`: **✓ 307/307 static**, Exit 0, alle 3 Routen als `ƒ` (server-rendered, crawlbar — LandingFooter `useTranslations` erzwingt Dynamik, wie alle Content-Routen)
- Dev-Smoke (`next dev` :3210): **HTTP 200** auf allen 3 Routen (kein 307), Decoder-Hub-Control 200
- **Screenshots** (Playwright full-page, 1280px): alle 3 gerendert, gebrandet, B.1-konsistent, keine Layout-Glitches; Decoder-Anchor (1+2) vs Cornerstone-Anchor (3) korrekt differenziert

## Offen / nächste Streams
- B.3 Schadenspositions-Pages (4) — **Twin-Page-Kannibalisierung zu `/haftpflicht/*` vorher mit Aaron klären**
- B.4 Fahrzeugtyp (3), B.5 Cornerstone `/unfall-was-tun-als-geschaedigter` (5.000-Wort, echte Copy), B.6 `/unfallskizze`
