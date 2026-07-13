# Marketing Content-Studio — PoC (Teil A)

Standalone-Spike: erzeugt aus einem Thema EIN gebrandetes, voll-animiertes 9:16-Kurzvideo (`out.mp4`).
Pipeline: **Claude** (Skript + Visual-Plan) → **ElevenLabs** (Voiceover + Wort-Timings) → **Pexels** (B-Roll) → **Remotion** (Render).

Beruehrt die App NICHT. Zum Ausprobieren + Justieren, VOR dem produktiven Bau (Teil B).

## Setup
1. `cp .env.example .env` und Keys eintragen:
   - `ANTHROPIC_API_KEY` (Claude) — evtl. schon in eurer App-Env
   - `ELEVENLABS_API_KEY` (Voice-ID ist schon gesetzt: `HNYELfQMgCeL9N0RGyxo`)
   - `PEXELS_API_KEY` (gratis: https://www.pexels.com/api/)
2. `npm install`  (Node 20+)

## Ausprobieren
```
npm run gen                  # Standardthema (Autounfall-Ratgeber)
npm run gen "<thema>" ad     # eigenes Thema, Format: ratgeber | ad
npm run render               # -> out.mp4
```
`out.mp4` ansehen und beurteilen: Untertitel-Sync · B-Roll-Relevanz · "durchgehend bewegt" · Marken-Feel · Stimme.
Befunde -> `FINDINGS.md` (dann justieren wir Prompt/Timing/Stil).

## Hinweise
- Fonts: System-Sans (Fallback). Inter o.ae. spaeter via `@remotion/google-fonts`.
- Farben = PoC-Hex (Claimondo Navy/Akzent/Creme); in Teil B kommen die echten `design-tokens`.
- Alles in `.work/` + `out.mp4` ist wegwerfbar (gitignored).
- Modell = `claude-opus-4-8`. Falls Anthropic eine neuere Sonnet-Version meldet, in `lib/script.mjs` eintragen.
