#!/usr/bin/env node
// 2026-05-08: Pre-Generation der wiederkehrenden TTS-Anweisungen.
//
// Idee: 90 % der Voice-Ansagen im Feldmodus sind feste Phrasen
// („Achtung Blitzer in 200 Metern", „Sie haben Ihr Ziel erreicht", …).
// Statt sie pro Fahrt live durch den ElevenLabs-Server-Proxy zu jagen,
// generieren wir sie EINMAL beim Build, deployen die MP3s als statische
// Assets unter `public/tts/<sha1>.mp3` und liefern sie Vercel-CDN-cached
// aus.
//
// Vorteile:
//   • Null Quota-Verbrauch für Standard-Phrasen (≈ 99 % aller Calls)
//   • Null Latenz beim Abspielen (statisches Asset, keine API-Roundtrip)
//   • Resilience: ElevenLabs-Outage betrifft nur dynamische Anweisungen
//     (Maneuver mit Straßennamen) — der Rest spielt weiter
//   • Konsistenz: Standard-Phrasen klingen IMMER identisch (gleicher
//     Voice-Hash, kein Pitch-/Rhythmus-Drift zwischen ElevenLabs-Builds)
//
// Aufruf:
//   ELEVENLABS_API_KEY=… node scripts/pregenerate-tts.mjs
//   ELEVENLABS_API_KEY=… ELEVENLABS_VOICE=z1EhmmPwF0ENGYE8dBE6 node …
//
// Output:
//   public/tts/<sha1>.mp3       — pro Phrase eine MP3
//   public/tts/manifest.json    — { text → filename }
//
// Im Client: src/lib/mapbox/elevenlabs-tts.ts checkt zuerst das Manifest
// (das in den Bundle ge-importiert wird), spielt das statische File
// statt der API-Anfrage. Cache-Treffer = static MP3 = sub-50ms Playback.

import { createHash } from 'node:crypto'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const API_KEY = process.env.ELEVENLABS_API_KEY
const VOICE = process.env.ELEVENLABS_VOICE ?? 'z1EhmmPwF0ENGYE8dBE6'
const MODEL = 'eleven_multilingual_v2'

if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY fehlt. Aufruf:')
  console.error('  ELEVENLABS_API_KEY=sk_… node scripts/pregenerate-tts.mjs')
  process.exit(1)
}

// Standard-Phrasen-Katalog. Halbwegs vollständig für den heutigen
// Feldmodus-Voice-Path. Weitere Phrasen einfach hier ergänzen — der
// Hash-File-Pfad bleibt stabil (sha1 vom Text).
const PHRASES = [
  // Ankunft
  'Sie haben Ihr Ziel erreicht',
  'Das Ziel befindet sich auf der rechten Seite',
  'Das Ziel befindet sich auf der linken Seite',
  'In Kürze Ankunft',

  // Blitzer
  'Achtung, Blitzer in 500 Metern',
  'Achtung, Blitzer in 200 Metern',
  'Achtung, mobiler Blitzer in 500 Metern',
  'Achtung, mobiler Blitzer in 200 Metern',

  // Maneuver
  'Rechts abbiegen',
  'Links abbiegen',
  'Geradeaus weiter',
  'In 100 Metern rechts abbiegen',
  'In 200 Metern rechts abbiegen',
  'In 500 Metern rechts abbiegen',
  'In 100 Metern links abbiegen',
  'In 200 Metern links abbiegen',
  'In 500 Metern links abbiegen',
  'In 200 Metern geradeaus',
  'In 500 Metern geradeaus',

  // Auffahrt / Ausfahrt
  'Auf die Autobahn auffahren',
  'Bei der nächsten Ausfahrt abfahren',
  'Bei der zweiten Ausfahrt rechts',
  'Bei der ersten Ausfahrt rechts',

  // Reroute / Statusmeldungen
  'Neue Route wird berechnet',
  'Schnellere Route gefunden',
  'Hindernis voraus',
  'Stau voraus',
  'Sie sind unterwegs',
  'Tagesmodus gestartet',
  'Tagesmodus pausiert',
]

const OUT_DIR = join('public', 'tts')

function hashText(text) {
  return createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16)
}

async function generateOne(text) {
  const filename = `${hashText(text)}.mp3`
  const filepath = join(OUT_DIR, filename)

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} für „${text}": ${body.slice(0, 200)}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  await writeFile(filepath, buffer)
  return { text, filename, bytes: buffer.byteLength }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const manifest = {}
  let totalBytes = 0
  let success = 0
  let failed = 0

  console.log(`Generiere ${PHRASES.length} Phrasen mit Voice ${VOICE}…\n`)

  for (const text of PHRASES) {
    try {
      const result = await generateOne(text)
      manifest[text] = result.filename
      totalBytes += result.bytes
      success++
      console.log(`  ✓ ${text} → ${result.filename} (${(result.bytes / 1024).toFixed(1)} KB)`)
    } catch (err) {
      failed++
      console.error(`  ✗ ${text} — ${err.message}`)
    }
  }

  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(
      {
        voice: VOICE,
        model: MODEL,
        generatedAt: new Date().toISOString(),
        entries: manifest,
      },
      null,
      2,
    ),
  )

  console.log(
    `\n${success}/${PHRASES.length} Phrasen erzeugt (${(totalBytes / 1024).toFixed(0)} KB total). ` +
      (failed > 0 ? `${failed} fehlgeschlagen.` : 'Alles ok.'),
  )
  console.log(`Manifest: ${join(OUT_DIR, 'manifest.json')}`)
  console.log('Commit das public/tts/-Verzeichnis ins Repo. Vercel-CDN serviert es ab Deploy.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
