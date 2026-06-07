# Monika A-Flow Phase 3 — Sound-Smoke (06.06.2026)

Self-contained Playwright (`scripts/_monika-p3-smoke.mjs`, nicht committet). Chromium mit
`--autoplay-policy=no-user-gesture-required --mute-audio` (AudioContext laeuft ohne Block, nichts toent
hoerbar). Server serviert zusaetzlich `/embed/sounds/*.mp3`. **EXIT 0, keine Page-Errors.**

## Verifiziert
- **MP3-Assets erreichbar:** `monika-incoming.mp3` → 200 (78576 bytes), `monika-sent.mp3` → 200 (16128 bytes).
- **Mute-Button im Header (01):** default **🔊** (Sound an) neben ✕, fuegt sich in den navy Header.
- **Mute toggelt:** Klick → **🔇**.
- **Mute persistiert (02):** Reload (= Resume, Desktop auto-open) → Header weiter **🔇** (localStorage). Resume
  stellt zugleich die Greeting-History wieder her.
- **Voller Flow ohne Page-Errors (03):** Haftpflicht → Auffahrunfall → Unverschuldet → Morgen → Vormittag →
  Kontaktform → Absenden → Gutschein. AudioContext-Pfad (unlock/incoming/sent) fehlerfrei.

## Build / Tests
`build:embed` 50.3 KB raw / **18.1 KB gz** (Budget < 30). vitest store/sound (+Phase-1/2) grün.
`typecheck:embed` grün.

## Hinweis
Hoerbarkeit ist headless nicht pruefbar — der Smoke verifiziert den **fehlerfreien Audio-Pfad** + **Asset-
Fetchbarkeit** + **Mute-UX**. Manuelle Hoerprobe = Aarons Staging-Test (incoming bei Monika-Nachricht,
sent bei Chip/Submit). Autoplay-Etikette: Teaser stumm, Sound erst nach FAB-Tap (Geste entsperrt AudioContext).
