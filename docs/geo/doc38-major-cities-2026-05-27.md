# Doc 38 — Major-City Hub-Rollout (Hamburg/Berlin/München) — 2026-05-27

Spec-P6 des `marketing-strategy/strategy/38-HYPERLOCAL-IMPLEMENTIERUNGSPLAN.md`
(Hub-Rollout Major-Cities). **Köln war bereits gemergt** → die 3 offenen Städte
**Hamburg, Berlin, München** ergänzt. `HYPERLOCAL_DATA` hat damit 7 Hubs
(Köln, Düsseldorf, Wuppertal, Bonn, Hamburg, Berlin, München).

> **Branch-Hinweis:** Dieser Branch `kitta/doc38-hub-major` ist off **`origin/staging`** gebaut.
> Grund: Der lokale `kitta/doc38-p6-wuppertal-spokes` (auf dem zunächst gearbeitet wurde) ist
> 42k Zeilen **hinter** staging und hat **keine Merge-Base** (Squash-Divergenz) → unmergeable.
> staging hat die komplette Doc-38-Infrastruktur (HYPERLOCAL_DATA + 4 NRW-Hubs) bereits gemergt,
> daher wurde die 3-Städte-Ergänzung sauber auf staging neu aufgesetzt.

## Architektur — rein additiv, keine Consumer-Änderung
`getHubCities()` / `isHubCity()` iterieren `HYPERLOCAL_DATA` generisch → neue Stadt fließt automatisch in:
- **Stadt-Page** `[stadt]/page.tsx`: Hero-Anker, Einsatzgebiet, Topografie, Unfallzahl, Hotspots+Quelle, Hauptachsen, öffentliche Stellen, lokale FAQ.
- **JSON-LD**: `faqPageSchema(buildStadtFaq(s))` (FAQPage inkl. lokaler FAQ) + `areaServed` (City-Array + plzListe `?? []`).
- **sitemap.ts**: Prio 0.9 + `weekly` + Hreflang-Alternates.
- **llms.txt**: Hub-Block + `totalAssets`-Zähler.
- **llms-full.txt**: Voll-Dump pro Hub.

## Datenherkunft + Verifikation
Recherche je Stadt via paralleler Agenten (quellenbelegt), **Hochrisiko-Fakten manuell verifiziert** (WebSearch/WebFetch):

| Stadt | Unfallzahl (verifiziert) | Zulassungsstelle (verifiziert) | KZ |
|---|---|---|---|
| Hamburg | 64.310 (2025), 21 Tote — Polizei HH 2025 | LBV, Ausschläger Weg 100 · 040 42858-0 | HH |
| Berlin | 137.373 (2025, +3,0 %), 37 Tote — Polizei Berlin | LABO, Jüterboger Str. 3 · 030 90269-3300 | B |
| München | 42.122 (2024) — Stat. Amt München | KVR, Eichstätter Str. 2 · 089 233-96090 | M |

**Korrekturen an Agenten-Rohdaten:** Berlin Innsbrucker-Platz „166"-Dublette entfernt; München `Neubiberg-Perlach`
+ `Habach` + Dublette `Gräfelfing` raus; Hamburg `Sternschanze` (→ Altona), implausibles „täglich 4–6 Kollisionen" entschärft.
`plzListe` bei allen 3 weggelassen (nicht zuverlässig recherchierbar; optional, Consumer `?? []`-geguarded).
UWG: keine Werkstatt-/Abschlepp-„Partner". Stale „NRW-Hub"-Prosa generalisiert (Hubs jetzt bundesweit):
llms.txt + llms-full.txt + 3 Kommentare.

## Verifikation (2026-05-27, auf äquivalenter Infrastruktur)
- **Build**: `next build` — TypeScript grün (3,1 min), Static-Gen erzeugt alle `[stadt]`-Seiten.
  Einzige Build-Failure: `/gutachter-partner` SSG-Timeout (>60 s) — **vorbestehend**, Live-Warteliste-DB-Fetch,
  env-spezifisch (DB-Connection-Limits im Worktree); **nicht** von dieser Änderung berührt. CI-Build = PR-Gate.
- **Render (dev, curl+grep, spec §11)**: alle 3 Pages HTTP 200, je 6+ stadtspezifische Eigennamen,
  `FAQPage`-Schema vorhanden. llms.txt: Hub-Block mit allen 3 + Hotspots. sitemap: 0.9/weekly/Hreflang
  für die 3 (Gegenprobe Dortmund: 0.85/monthly, keine Hreflang).

## Geänderte Dateien
- `src/app/kfz-gutachter/staedte.ts` — 3 HYPERLOCAL_DATA-Einträge + Kommentar-Generalisierung.
- `src/app/llms.txt/route.ts` — „NRW-Hub-Cities" → „Hub-Cities".
- `src/app/llms-full.txt/route.ts` — NRW-Prosa + Quellen generalisiert.

## Parallel (separater PR)
- docx `02_Datenschutzerklaerung_DSGVO_Claimondo_v2.docx` → **PR #1830** (Branch `kitta/datenschutz-docx`, off staging).
- 4 geo-Docs `docs/geo/*-2026-05-24.md` waren bereits gemergt (#1679/#1760).
