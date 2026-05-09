# Pre-Generated TTS-MP3s

Hier liegen die wiederkehrenden Voice-Ansagen des Feldmodus als statische
MP3s. `manifest.json` mappt Text → Filename.

## Erzeugen / Aktualisieren

```bash
ELEVENLABS_API_KEY=sk_… node scripts/pregenerate-tts.mjs
```

Erzeugt ein `<sha1>.mp3` pro Phrase und schreibt das Manifest.
Liste der Phrasen im Script (`PHRASES`-Array) — neue dort ergänzen
und Script erneut laufen lassen.

## Wann re-run?

- Voice-Wechsel (anderer ElevenLabs-Voice-ID)
- Neue Standard-Phrase im Code (`speakInstruction(...)` mit fixem Text)
- Quality-Tweak (Voice-Settings im Script geändert)

Build kostet einmalig ~30 Calls × 30k Zeichen = ~1k Zeichen Quota.

## Wie greift's?

`src/lib/mapbox/elevenlabs-tts.ts → tryPlayStatic(text)` checkt das
Manifest beim ersten Voice-Call und cached es modulweit. Treffer →
statisches MP3 von `/tts/<filename>` direkt vom Vercel-CDN. Kein
API-Roundtrip, sub-50ms-Playback.

Dynamische Anweisungen (Mapbox-Maneuver mit Straßennamen wie
"In 200 m rechts auf die Hauptstraße") sind nicht im Manifest und
gehen weiter durch den Server-Proxy `/api/elevenlabs/tts`.
