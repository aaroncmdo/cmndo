# Stream B.6 — Tool-Page „Unfallskizze" (+ PDF-Vorlage)

**Datum:** 2026-05-23 · **Branch:** `kitta/streamb6-unfallskizze` (off `staging`) · **PR:** gegen `staging`
**Sprint:** LLM-Visibility / GEO (Doc 26 Stream B, Tracking AAR-936)

## Kontext: B.3 wurde bewusst übersprungen
Vor B.6 stand B.3 (4 Schadenspositions-Twin-Pages) an. Befund nach Lesen der Spokes: die
bestehenden `/haftpflicht`-Spokes besetzen die Transaktions-Keywords bereits selbst (z.B.
`nutzungsausfall`-Spoke `primary_keyword` = wörtlich „nutzungsausfall berechnen"). Echte Twins hätten
also genau kannibalisiert → **Aaron-Entscheid: B.3-Twins skippen, direkt B.5/B.6.** B.6 zuerst, weil
komplett neue Fläche (kein Content zielt auf „unfallskizze") = null Kannibalisierung.

## Was gebaut wurde
- **`/unfallskizze`** (Vol 600) — bespoke Tool-Page nach B.1-Muster: Hero (Download-CTA + tel) →
  „Was in eine Unfallskizze gehört"-Checkliste → Schritt-für-Schritt (HowTo) → 8 Best-Practice-Tipps →
  PDF-Download-Block → `ConversionAnchorBlock(cornerstone)` → `SpokeCtaBand`.
- **PDF-Vorlage** `public/downloads/unfallskizze-claimondo-vorlage.pdf` — 1 Seite A4, gebrandet (Navy-
  Header), Felder Unfalldaten / Fahrzeug A+B / großes Skizzenfeld mit Nordpfeil + Legende / Zeugen /
  Footer „kein Schuldeingeständnis". Generiert mit reportlab (Helvetica/WinAnsi → Umlaute/§/€ korrekt;
  Pfeile als Linien gezeichnet, da Arrow-Glyphs in der Built-in-Font fehlen).
- **JSON-LD:** `howToSchema` (6 Schritte) + `faqPageSchema` (5) + `breadcrumbsSchema`. HowTo statt
  serviceSchema, weil Anleitungs-/Tool-Seite (GEO: HowTo = hohe Citation-Wahrscheinlichkeit).

## Statische PDF durch die Middleware (proxy.ts matcher)
Der proxy-`matcher` exkludiert Asset-Endungen (svg/png/…/js/json), aber **nicht `.pdf`** → ein
`/downloads/*.pdf`-Request wäre durch `updateSession` gelaufen → 307 → /login für anon. Fix: **`pdf`
zum matcher-Exclusion-Katalog hinzugefügt** (statische Download-Vorlagen gehören nie hinter den
Auth-Guard, gleiche Logik wie die anderen Assets). Empirisch bestätigt: `GET /downloads/unfallskizze-
claimondo-vorlage.pdf` → 200, `content-type: application/pdf`. Die Page selbst: `/unfallskizze` in
proxy MARKETING_PREFIXES + middleware publicPaths + sitemap.

## Verifikation
- `tsc --noEmit`: **0** · `check:token-audit`: **0 / 1693**
- `next build`: kompiliert bis 296/312; **Exit rot NUR an `/gutachter-partner`** (Export-Timeout >60 s =
  Prod-DB-Contention bei 4 aktiven Parallel-Sessions, **dokumentierter Flake**, nicht angefasst — CI baut
  isoliert grün, vgl. B.1-Commit). `/unfallskizze` ist `ƒ` (nicht prerendered) → vom Export-Step ohnehin
  nicht betroffen.
- Dev-Smoke (`next dev` :3210): `/unfallskizze` **HTTP 200** (kein 307) · PDF **200 / application/pdf / 3023 B**
- **PDF visuell gerendert** (PyMuPDF→PNG): Layout sauber, **Umlaute (ä/ö/ü/ß), § und € als echte Glyphen**
  (keine Boxen), Nordpfeil korrekt.
- Page-Screenshot (Playwright full-page): gebrandet, B.1-konsistent, alle Sektionen + Download-CTAs.

## Offen / nächste B-Streams
- **B.5** Cornerstone `/unfall-was-tun-als-geschaedigter` (5.000-Wort-Pillar) — größter Brocken; braucht
  vorher eine Kannibalisierungs-Prüfung gegen die bestehenden Cornerstones (`/kfz-haftpflicht-schaden`,
  `/ratgeber`) + echte Copy-Tiefe. Damit ist Stream B (außer B.5) abgeschlossen: B.1/B.2/B.4/B.6 live/PR.
