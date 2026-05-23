# Stream B.5 — Cornerstone-Pillar „Unfall — was tun als Geschädigter" (+ /ratgeber-Konsolidierung)

**Datum:** 2026-05-24 · **Branch:** `kitta/streamb5-unfall-was-tun` (off `staging`) · **PR:** gegen `staging`
**Sprint:** LLM-Visibility / GEO (Doc 26 Stream B, Tracking AAR-936) · letzter offener B-Stream

## Kannibalisierungs-Check zuerst (Pflicht nach B.3-Lesson)
Vor dem Bau gegen die bestehenden Cornerstones geprüft. Befund: `/ratgeber` besetzt die „was tun"-Intention
bereits — `secondary_keyword` = „was tun nach autounfall", H1 = „Was du nach einem Verkehrsunfall wirklich
wissen willst". Eine separate B.5-Page würde `/ratgeber` kannibalisieren. **Aaron-Entscheid (3 Optionen
vorgelegt): B.5 als primären Pillar BAUEN + `/ratgeber` per `rel=canonical` darauf konsolidieren** (bleibt
emotionaler Persona-Begleiter, Ranking-Signal bündelt sich auf B.5).

## Was gebaut wurde
- **`/unfall-was-tun-als-geschaedigter`** (Vol 500, gegen HUK-Position #7) — bespoke Pillar nach B.1-Muster,
  als **Hub** konzipiert: Hero → „Das Wichtigste in 30 Sekunden" → **Sofortmaßnahmen** (7 Schritte, HowTo) →
  **6 Unfalltypen** (Cross-Link auf Szenario-Spokes auffahrunfall/vorfahrt-rechts-vor-links/linksabbieger/
  spurwechsel/parkplatz/rotlicht) → **Ansprüche** (Cross-Link `/unverschuldeter-unfall-rechte` [B.2] +
  `/kfz-haftpflicht-schaden`) → **„Was die Versicherung verschweigt"** (Cross-Link Decoder + `/versicherung-
  schickt-gutachter` + `/gegnerische-versicherung-zahlt-nicht` [B.2]) → 6 FAQ → `ConversionAnchorBlock(cornerstone)`
  → `SpokeCtaBand`.
- JSON-LD: `articleSchema` (citation: § 249 BGB / § 115 VVG / § 7 StVG / § 9 StVO / BGH VI ZR 235/13) +
  `howToSchema` (Sofortmaßnahmen) + `faqPageSchema` (6) + `breadcrumbsSchema`.

## Konsolidierung /ratgeber → B.5
`app/ratgeber/page.tsx` `generateMetadata`: `alternates.canonical` von `/ratgeber` → `/unfall-was-tun-als-
geschaedigter`. (Der Cornerstone-Canonical ist HARDCODED in der Route, NICHT im MD-Frontmatter.) `/ratgeber`
rendert unverändert weiter (Persona-Guide), zeigt sein Ranking-Signal aber auf den Pillar. **Empirisch
verifiziert:** `GET /ratgeber` → `<link rel="canonical" href="…/unfall-was-tun-als-geschaedigter">`; B.5
self-canonical korrekt. Hinweis: `/ratgeber` bleibt vorerst in der Sitemap (auto via getCornerstones) —
Canonical ist für Google autoritativ; sauberes Entfernen optional als Folge-Hygiene.

## Allowlist
`/unfall-was-tun-als-geschaedigter` in proxy MARKETING_PREFIXES + middleware publicPaths + sitemap (Priority
0.95 = Pillar-Klasse). Cross-Links nur auf reale Spokes/Routen (`dynamicParams=false`).

## Verifikation
- `tsc --noEmit`: **0** · `check:token-audit`: **0 / 1693**
- `next build`: **Exit 0** (diesmal ohne /gutachter-partner-Flake — DB-Last ließ nach), Route als `ƒ`
- Dev-Smoke (`next dev` :3210): `/unfall-was-tun-als-geschaedigter` **200**, `/ratgeber` **200** (rendert weiter),
  `/ratgeber`-Canonical → B.5 **bestätigt**, B.5 self-canonical bestätigt
- Page-Screenshot (Playwright full-page): vollständiger Pillar, alle Sektionen, gebrandet, B.1-konsistent,
  keine Glitches.

## Stream-B ABGESCHLOSSEN
B.1 (#1605) + B.2 (#1610) + B.4 (#1615) gemergt/live · B.6 (#1619, /unfallskizze) PR offen · **B.5 (dieser PR)**.
B.3 (Schadenspositions-Twins) bewusst gestrichen (Kannibalisierung — Spokes besetzen die Keywords). Damit ist
die komplette Doc-26-Stream-B-Render-Strecke gebaut.
