// TTS-Adapter: ElevenLabs PRIMAER, OSS-Piper FALLBACK.
// -> jetzt gratis validierbar (ElevenLabs-402 faellt auf Piper zurueck),
//    beim Go-Live schaltet der Creator-Plan ElevenLabs frei OHNE Code-Aenderung.
import { writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const EL_MODEL = 'eleven_multilingual_v2'

// outBase = Pfad OHNE Endung (z.B. './.work/voice'); jede Engine haengt ihre Endung an.
export async function synthesize(text, outBase) {
  try {
    const r = await elevenLabs(text, outBase)
    console.log('[tts] ElevenLabs OK')
    return r
  } catch (err) {
    console.warn(`[tts] ElevenLabs nicht verfuegbar (${String(err.message).slice(0, 90)}) -> Fallback Piper (OSS)`)
    return await piper(text, outBase)
  }
}

async function elevenLabs(text, outBase) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt')
  const voice = process.env.ELEVENLABS_VOICE_ID || 'HNYELfQMgCeL9N0RGyxo'
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: EL_MODEL, output_format: 'mp3_44100_128' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const data = await res.json()
  const audioPath = `${outBase}.mp3`
  await writeFile(audioPath, Buffer.from(data.audio_base64, 'base64'))
  return { audioPath, words: charsToWords(data.alignment), engine: 'elevenlabs' }
}

// --- ElevenLabs: Character-Alignment -> Wort-Timings ---
function charsToWords(a) {
  const words = []
  let cur = null
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i]
    if (ch.trim() === '') {
      if (cur) { words.push(cur); cur = null }
      continue
    }
    if (!cur) cur = { word: '', start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] }
    cur.word += ch
    cur.end = a.character_end_times_seconds[i]
  }
  if (cur) words.push(cur)
  return words
}

// --- Piper (OSS, lokal): WAV + GESCHAETZTE Wort-Timings (kein echtes Alignment) ---
async function piper(text, outBase) {
  const bin = process.env.PIPER_BIN || 'piper'
  const model = process.env.PIPER_MODEL
  if (!model || !existsSync(model)) {
    throw new Error(`PIPER_MODEL nicht gefunden (${model || 'nicht gesetzt'}) — setup-piper.mjs ausfuehren`)
  }
  const audioPath = `${outBase}.wav`
  await runPiper(bin, model, text, audioPath)
  const secs = await wavDurationSeconds(audioPath)
  return { audioPath, words: estimateWords(text, secs), engine: 'piper' }
}

function runPiper(bin, model, text, outPath) {
  return new Promise((resolve, reject) => {
    // Args-Reihenfolge deckt sowohl rhasspy-piper (--model/--output_file) als auch
    // Kurzflags (-m/-f) ab; per env PIPER_ARGS ueberschreibbar.
    const args = process.env.PIPER_ARGS
      ? process.env.PIPER_ARGS.split(' ').map((a) => a.replace('{model}', model).replace('{out}', outPath))
      : ['-m', model, '-f', outPath]
    const p = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`piper exit ${code}: ${err.slice(0, 160)}`))))
    p.stdin.write(text)
    p.stdin.end()
  })
}

async function wavDurationSeconds(path) {
  const buf = await readFile(path)
  const byteRate = buf.readUInt32LE(28) // bytes/sec aus dem fmt-Chunk
  const dataIdx = buf.indexOf(Buffer.from('data'))
  const dataSize = dataIdx >= 0 ? buf.readUInt32LE(dataIdx + 4) : buf.length - 44
  return dataSize / (byteRate || 44100)
}

function estimateWords(text, totalSecs) {
  const raw = text.split(/\s+/).filter(Boolean)
  const weights = raw.map((w) => w.length + 1)
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  let t = 0
  return raw.map((w, i) => {
    const start = t
    t += (weights[i] / sum) * totalSecs
    return { word: w, start, end: t }
  })
}
