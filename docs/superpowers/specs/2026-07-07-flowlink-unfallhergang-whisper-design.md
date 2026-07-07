# Whisper-Sprachdiktat für den Unfallhergang im FlowLink

**Datum:** 2026-07-07
**Branch:** `kitta/flowlink-unfallhergang-whisper` (off `origin/staging`)
**Kontext:** Aaron: „in den flowlink bei der feststellung beim unfallhergang whisper nutzen, damit
der kunde den unfallhergang ausführlich einsprechen kann. es soll wort für wort gerendert werden
und nach abschluss dann editierbar sein." Gewählter Ansatz (Aaron 07.07.): **Groq-Whisper gechunkt**
(semi-live, ein Verarbeiter, DSGVO-konsistent) mit **rolling re-transcribe** (kein Wortverlust).

## Ziel
Im FlowLink (`/flow/[token]`), Feststellung-Schritt `hergang`, Feld `unfallhergang`: der Kunde
spricht den Unfallhergang ein (statt tippen). Der Text erscheint **häppchenweise während des
Sprechens** (Live-Vorschau), landet nach dem Stopp **verbatim in der editierbaren Textarea** und
wird über den bestehenden Speicherpfad in `leads.unfallhergang` gesichert. Tippen bleibt jederzeit
möglich — Voice ist additiv.

## Ist-Zustand (reuse)
- **Groq-Whisper existiert:** `src/app/api/support/voice-transcribe/route.ts` (Groq
  `whisper-large-v3-turbo`, FormData-Audio → `{text}`). Auth = Login + Rolle (inkl. `kunde`).
- **Recorder-Hook:** `src/components/support/useVoiceRecorder.ts` (MediaRecorder, chunksRef,
  60s-Auto-Stop, MIME-Detection).
- **Feld:** `unfallhergang` = `TextareaField` (`src/components/onboarding/fields/TextareaField.tsx`),
  gerendert über `FieldRenderer` in `FlowFeststellungStep` (`'use client'`), gespeichert via
  `speichereFeststellungFlow` (`self-service-feststellung-actions.ts`) → `leads.unfallhergang`.
- **Lücke 1:** der Support-Endpoint verlangt **Login** — FlowLink-Kunden sind **anonym**
  (Magic-Link-Token). → neuer token-authentifizierter Endpoint nötig.
- **Lücke 2:** kein Live-/Chunk-Diktat, kein Voice-Button im FlowLink.

## Architektur

### 1. Shared Helper — `src/lib/ai/transcribe.ts` (neu)
`transcribeAudio(audio: Blob, language='de'): Promise<Result>` — kapselt den Groq-Call (extrahiert
aus dem Support-Endpoint, byte-gleiche Logik). Result:
`{ ok: true; transcript } | { ok: false; status; error }` (429/502/422/500 gemappt). Der bestehende
Support-Endpoint wird auf diesen Helper umgestellt (DRY, identisches Verhalten).

### 2. Endpoint — `src/app/api/flow/voice-transcribe/route.ts` (neu)
`POST` mit FormData `{ audio, token, language? }`. **Token-Auth statt Login:** Token in `flow_links`
nachschlagen (wie `speichereFeststellungFlow` es tut) → gültig ⇒ erlaubt, sonst 401/403. Audio-Cap
10 MB. Ruft `transcribeAudio()` → gibt `{ success, transcript }` zurück. **Kein Audio wird
gespeichert.** `runtime='nodejs'`, `dynamic='force-dynamic'`. Groq = derselbe Verarbeiter wie heute
für Kunden-Sprachnotizen → kein neuer Drittanbieter (DSGVO-konsistent).

### 3. Hook — `src/components/onboarding/fields/useChunkedDictation.ts` (neu)
Erweitert das `useVoiceRecorder`-Muster:
- `start(token)`: `getUserMedia` → `MediaRecorder.start(1000)` (1s-Timeslice) → `ondataavailable`
  akkumuliert Chunks.
- **Rolling re-transcribe:** `setInterval` alle **~7 s** — Snapshot der bisherigen Chunks →
  `new Blob([...chunks])` (gültiges webm-Präfix, **kein Wortverlust an Grenzen**) → POST an
  `/api/flow/voice-transcribe` → `setLiveTranscript(transcript)`.
- `stop()`: Intervall stoppen → `recorder.stop()` → **finaler** Transcript des Gesamt-Audios →
  Rückgabe (maßgeblicher verbatim Text).
- Rückgabe: `isRecording`, `isTranscribing`, `liveTranscript`, `error`, `isSupported`, `start`,
  `stop`. 60s-Auto-Stop bleibt.
- **Kosten-Trade-off:** rolling re-transcribe lädt das wachsende Audio wiederholt hoch (quadratisch).
  Für typische Diktate (30–120 s, Groq turbo billig/schnell) unkritisch; bei sehr langen Aufnahmen
  wird die Live-Update-Frequenz reduziert (Degradation), der finale Transcript bleibt korrekt.

### 4. Component — `src/components/onboarding/fields/VoiceDictation.tsx` (neu, `'use client'`)
Props: `{ token, onFinalTranscript, disabled? }`. Rendert einen 🎤-Button
(Aufnahme starten/stoppen), während der Aufnahme einen **Recording-Indikator + Live-Vorschau**
(`liveTranscript`), beim Stopp Ruf `onFinalTranscript(text)`. Nutzt `useChunkedDictation`.
Fehler-States (Mic verweigert / Transkription fehlgeschlagen / 429) freundlich, blockieren das
Tippen nie. Kurzer Hinweis „Sprachaufnahme wird nur zur Transkription verarbeitet, nicht gespeichert".
`isSupported=false` (kein MediaRecorder) → Button gar nicht rendern (nur Textarea).

### 5. UI-Wiring
`TextareaField` bekommt eine optionale `voiceDictation?: { token: string }`-Prop → rendert
`<VoiceDictation token onFinalTranscript={(t) => onChange(appendText(value, t))} />` unter der
Textarea. **Append** (nie überschreiben) an bestehenden Text. Der Flag/Token wird für das
`hergang`-Feld durchgereicht: `feststellung-steps.ts` (Step-Flag `voiceDictation: true`) →
`FlowFeststellungStep` (hat den Token) → `FieldRenderer` → `TextareaField`.

## Data-Flow
Mic → MediaRecorder (Client, 1s-Chunks) → alle ~7 s POST Audio → `/api/flow/voice-transcribe`
(token-gated) → Groq → Transcript → Live-Vorschau. Stopp → finaler Transcript → **Append in die
editierbare Textarea** → bestehende `speichereFeststellungFlow`-Action → `leads.unfallhergang`.

## Error-Handling
Mic verweigert/nicht vorhanden → Button versteckt/deaktiviert, Textarea weiter tippbar. Transkription
fehlgeschlagen/429/502/422 → freundliche Meldung, Aufnahme verwerfbar/wiederholbar, Tippen bleibt.
Token ungültig → Endpoint 401/403 (Client zeigt „Diktat nicht verfügbar, bitte tippen").

## Testing
- `transcribeAudio` — vitest, `fetch` gemockt: ok / 429 / 502 / 422 / fehlender Key.
- `/api/flow/voice-transcribe` — vitest: Token-Validierung (gültig/ungültig), Audio-Cap, Delegation
  an `transcribeAudio`.
- `appendText`-Util (pure) — vitest.
- **CI-Build (Pflicht-Check)** deckt Typen/Route-Validator ab (App ist — anders als Marketing —
  CI-build-gegatet).
- Prod-Smoke: FlowLink-Feststellung rendert den 🎤-Button; Endpoint token-gated (401 ohne Token).
  Voller Mic-E2E ist mit Playwright-Fake-Audio möglich, aber optional (Aufwand).

## Out of Scope
- Claude-Struktur-Extraktion aus dem Transcript (Unfallhergang ist Freitext — YAGNI).
- Echtes Wort-für-Wort-Streaming via Browser-SpeechRecognition (bewusst verworfen: Google als neuer
  Verarbeiter für Kunden-Audio, DSGVO; Firefox-Lücke).
- Waveform-Visualisierung (nice-to-have, nicht MVP).
- Voice in anderen Feldern (nur `unfallhergang`).
