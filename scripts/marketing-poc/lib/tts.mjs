// ElevenLabs: Text -> mp3 + Wort-Timings (aus Character-Alignment)
import { writeFile } from 'node:fs/promises'

const MODEL = 'eleven_multilingual_v2'

export async function synthesize(text, outPath) {
  // DE-Stimme: env-Override moeglich; Default = die vom Nutzer gewaehlte Stimme.
  const voice = process.env.ELEVENLABS_VOICE_ID || 'HNYELfQMgCeL9N0RGyxo'
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, output_format: 'mp3_44100_128' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  // { audio_base64, alignment: { characters[], character_start_times_seconds[], character_end_times_seconds[] } }
  const data = await res.json()
  await writeFile(outPath, Buffer.from(data.audio_base64, 'base64'))
  return { audioPath: outPath, words: charsToWords(data.alignment) }
}

// Character-Alignment -> Wort-Timings (Split an Whitespace)
function charsToWords(a) {
  const words = []
  let cur = null
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i]
    if (ch.trim() === '') {
      if (cur) {
        words.push(cur)
        cur = null
      }
      continue
    }
    if (!cur) cur = { word: '', start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] }
    cur.word += ch
    cur.end = a.character_end_times_seconds[i]
  }
  if (cur) words.push(cur)
  return words
}
