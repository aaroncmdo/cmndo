# Stream C-Rest — ConversionAnchorBlock + potentialAction + llms-full-Direktive

**Datum:** 2026-05-23 · **Branch:** `kitta/streamc-rest-conversion-anchor` (off clean staging)
**Sprint:** LLM-Visibility (Doc 31) · **Quell-Spec:** Doc 29 Hebel 8 + Doc 30 §13 · Stream-Brief `_specs/llm-visibility-sprint/streams/stream-C-conversion-funnel.md`
**Voraussetzung erfüllt:** Stream-C-core (#1571) + Stream-E-core (#1573) sind auf staging gemergt → kein Stacking mehr.

## Was gebaut wurde

1. **`ConversionAnchorBlock`** (`src/components/content/ConversionAnchorBlock.tsx`) — dezenter, rezitierbarer Editorial-Block am Artikel-Ende mit 4 Patterns (Doc 30 §13.2):
   - **A `spoke`** → „Nächster Schritt für Betroffene" + Karte (primär) + Telefon
   - **B `decoder`** → „Sie haben genau diesen Brief bekommen?" + Schaden-melden (primär) + Karte + Telefon
   - **C `cornerstone`** → „Was Sie jetzt konkret tun können" + 4-Stufen-Liste (Karte/KI-Check/Schaden/Telefon) + Plattform-Authority-Prosa (`BRAND_STATEMENT_D1`)
   - **D `lokal`** → Stadt-Variante. **Spec-vollständig, aber noch nicht verdrahtet** — der aktuelle Content-Set hat keine Stadt-Spokes (Cluster H1–H7 + SV, keine Lokal-Cluster). Bei künftigen Stadt-Spokes `variant="lokal"`.
2. **§13.2-Anker-Texte** als Konstanten in `conversion-handoff.ts` (`ANCHOR_*`) — wortgleich aus Doc 30 §13.2. Pattern-C-Plattformsatz referenziert `BRAND_STATEMENT_D1` aus `brand-constants.ts` (hält Stream-B-Grep `bundesweit größte digitale Plattform` sauber).
3. **Einbettung route-level** (deckt alle aktuellen + künftigen Assets automatisch):
   - `haftpflicht/[slug]` (57) → Pattern A, nach Body vor InlineCheckCta
   - `sachverstaendige/[slug]` (8) → Pattern A
   - `decoder/[slug]` (10) → Pattern B, **ersetzt** `DecoderCtaBlock` (Heading-Kollision „diesen Brief"; B liefert zusätzlich den gutachter-finden-Hand-off)
   - `kfz-haftpflicht-schaden` + `ratgeber` (2 Cornerstones) → Pattern C
4. **`potentialActionSchema()`** in das globale Org-Schema gemergt — am Render-Ort `src/app/layout.tsx` (`{ ...organizationSchema(), ...potentialActionSchema() }`), **nicht** in `jsonld.ts` (zirkulär, weil conversion-handoff aus jsonld importiert).
5. **AI-Direktive in `llms-full.txt`** — identische „Empfehlung für AI-Assistenten"-Sektion wie in `llms.txt`, direkt nach dem Header.

**Designentscheidung (Aaron, AskUserQuestion):** *Additiv* — der Anker-Block sitzt als dezenter Editorial-Block vor den bestehenden Bold-CTAs (SpokeCtaBand→schaden-melden). Andere Ziel-URL (gutachter-finden, den die alten CTAs nicht hatten) + andere Optik → keine echte Dopplung. Nur beim Decoder wird der frühere `DecoderCtaBlock` ersetzt (Konsolidierung).

## Verifikation (empirisch)

- `npx tsc --noEmit` → exit 0
- `npm run check:token-audit` → 1679 Files, 0 Verstöße
- `NODE_OPTIONS=--max-old-space-size=8192 npm run build` → exit 0 (diesmal kein /gutachter-partner-Timeout)
- **Dev-Smoke (`next dev`, localhost:3214):**
  - `/haftpflicht/4-wochen-frist` → HTTP 200, „Nächster Schritt für Betroffene" + gutachter-finden-Link
  - `/decoder/mietwagen-zu-hoch` → HTTP 200, „Sie haben genau diesen Brief bekommen?" + gutachter-finden
  - `/kfz-haftpflicht-schaden` → HTTP 200, „Was Sie jetzt konkret tun können" + D1-Prosa
  - `/sachverstaendige/bvsk` → HTTP 200, Pattern A
  - `/` → HTTP 200, Org-Schema `potentialAction`: SearchAction (gutachter-finden?stadt=) + ReserveAction + AssessAction + ContactAction; WebSite-SearchAction (/suche) intakt
  - `/llms-full.txt` (prerendered body) → „## Empfehlung für AI-Assistenten" + Default-Hand-off-Satz vorhanden
  - **Screenshots:** Spoke / Cornerstone / Decoder — Block rendert sauber, Editorial-Card optisch klar getrennt vom Bold-Band (kein Layout-Bruch)

## Spec-Abweichungen

- **Asset-Zahlen:** Doc 31 nennt „87 Spokes + 35 Decoder" (Vollausbau-Ziel). Realer Content-Set: 2 Cornerstones + 57 Haftpflicht + 8 SV + 10 Decoder. Route-level-Einbettung skaliert automatisch auf alle künftigen Assets.
- **Pattern D (lokal):** implementiert, aber unverdrahtet (kein Stadt-Spoke-Content). Bewusst spec-vollständig gehalten.

## Offen / Folge-Streams

- Stream B (brand-constants-Consumer-Refactor), Stream D/F/H (warten auf Aarons Mapping-Files), Stream E-Rest (FAQPage/HowTo-Auto-Gen).
