# Stream B.1 — Kosten-Hub `/kosten-kfz-gutachten` (Exemplar)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamb-kosten-hub` (off clean staging)
**Sprint 2 / Doc 26 Stream B** · erste von 12 Konversions-Pages, bewusst als **Exemplar** (Voice/Struktur-Referenz vor Replikation B.2–B.6).

## Was gebaut
Bespoke Konversions-Landingpage `/kosten-kfz-gutachten` (kein MD-Asset, eigene page.tsx):
- **Hero** (navy): H1 „Was kostet ein Kfz-Gutachten — und wer zahlt es?" + Pill (§249 BGB · BVSK · BGH VI ZR 67/06) + dual-CTA (gutachter-finden + Telefon).
- **0-€-Block** (§ 249 BGB / BGH VI ZR 67/06, gegnerischer Versicherer trägt) + 4 Trust-Checks.
- **BVSK-Honorarstufen-Tabelle** (HB I–V Korridore) — **methodisch + Verweis bvsk.de + § 287 ZPO / BGH VI ZR 357/13**, KEIN 1:1-Abdruck (AGENTS.md-Compliance), konsistent mit Spoke `/haftpflicht/sv-kosten`.
- **Kürzungs-Block** (BGH VI ZR 280/22 SV-Risiko) + Decoder-Verlinkung (`/decoder/unser-sachverstaendiger`, `/haftpflicht/sv-kosten`).
- **`ConversionAnchorBlock variant="cornerstone"`** (reuse) + **`SpokeCtaBand`** → gutachter-finden/schaden-melden.
- JSON-LD: `serviceSchema` + `faqPageSchema` (4 Kosten-Q&As) + `breadcrumbsSchema`.
- **Allowlist:** `/kosten-kfz-gutachten` in `middleware.ts` publicPaths + `proxy.ts` MARKETING_PREFIXES (307-Trap vermieden). Sitemap-Eintrag (prio 0.9).

## Verifikation
- `tsc` 0 · `token-audit` 0 (1686 Files) · `next build` **305/305 static pages** (Exit rot nur /gutachter-partner-Timeout = DB-Contention 4 Parallel-Sessions, nicht angefasst).
- Dev-Smoke: `/kosten-kfz-gutachten` → **HTTP 200 (kein 307 → Allowlist greift)**, BVSK-Tabelle/HB I/0-€/bvsk.de/gutachter-finden alle da, JSON-LD 2 Blöcke valide, ConversionAnchor cornerstone present. **Full-Page-Screenshot** geprüft (poliert).

## Replikations-Muster für B.2–B.6 (offen)
Dieselbe Struktur (Hero → Kern-Block → Tabelle/Rechenbeispiel → Kürzungs/Decoder-Block → ConversionAnchorBlock → SpokeCtaBand → serviceSchema+FAQPage+breadcrumb + Allowlist + Sitemap):
- **B.2 Misstrauens (3):** /gegnerische-versicherung-zahlt-nicht, /versicherung-schickt-gutachter, /unverschuldeter-unfall-rechte — Quelle: Decoder + Pillar-B-Spokes.
- **B.3 Schadenspositionen (4):** /kaskoschaden, /wertminderung-nach-unfall, /nutzungsausfall-berechnen, /leihwagen-nach-unfall — **Twin-Page-Kannibalisierung zu bestehenden /haftpflicht/-Spokes mit Aaron klären** (canonical? distinct framing?).
- **B.4 Fahrzeugtyp (3):** /motorrad-gutachter, /lkw-gutachter, /e-auto-gutachter.
- **B.5 Cornerstone:** /unfall-was-tun-als-geschaedigter (5.000-Wort-Pillar — braucht echte Copy).
- **B.6 Tool:** /unfallskizze (PDF-Vorlage + Tipps).
**Jede neue Top-Level-Route MUSS in middleware publicPaths + proxy MARKETING_PREFIXES + sitemap** (sonst 307-Trap, Build bleibt grün).
