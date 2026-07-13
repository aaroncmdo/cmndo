import { writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * TTS-Adapter: ElevenLabs PRIMAER, OSS-Piper FALLBACK (validierter PoC-Port).
 * Bei ElevenLabs-Fehler (z.B. Free-Tier-402) faellt es automatisch auf lokales
 * Piper zurueck; beim Go-Live schaltet der Creator-Plan ElevenLabs OHNE Code-Aenderung frei.
 * Server-only Modul (Node child_process/fs) - laeuft im Render-Orchestrator.
 */

const EL_MODEL = 'eleven_multilingual_v2'
const DEFAULT_VOICE = 'HNYELfQMgCeL9N0RGyxo'

export interface WordTiming {
  word: string
  start: number
  end: number
}
export interface TtsResult {
  audioPath: string
  words: WordTiming[]
  engine: 'elevenlabs' | 'piper'
}
interface Alignment {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

// outBase = Pfad OHNE Endung; jede Engine haengt ihre Endung an (.mp3 bzw. .wav).
export async function synthesize(text: string, outBase: string): Promise<TtsResult> {
  try {
    return await elevenLabs(text, outBase)
  } catch {
    return await piper(text, outBase)
  }
}

async function elevenLabs(text: string, outBase: string): Promise<TtsResult> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY fehlt')
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: EL_MODEL, output_format: 'mp3_44100_128' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const data = (await res.json()) as { audio_base64: string; alignment: Alignment }
  const audioPath = `${outBase}.mp3`
  await writeFile(audioPath, Buffer.from(data.audio_base64, 'base64'))
  return { audioPath, words: charsToWords(data.alignment), engine: 'elevenlabs' }
}

// ElevenLabs Character-Alignment -> Wort-Timings (Split an Whitespace)
export function charsToWords(a: Alignment): WordTiming[] {
  const words: WordTiming[] = []
  let cur: WordTiming | null = null
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

// Piper (OSS, lokal): WAV + GESCHAETZTE Wort-Timings (kein echtes Alignment)
async function piper(text: string, outBase: string): Promise<TtsResult> {
  const bin = process.env.PIPER_BIN || 'piper'
  const model = process.env.PIPER_MODEL
  if (!model || !existsSync(model)) {
    throw new Error(`PIPER_MODEL nicht gefunden (${model ?? 'nicht gesetzt'}) - Piper einrichten`)
  }
  const audioPath = `${outBase}.wav`
  await runPiper(bin, model, text, audioPath)
  const secs = await wavDurationSeconds(audioPath)
  return { audioPath, words: estimateWords(text, secs), engine: 'piper' }
}

function runPiper(bin: string, model: string, text: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
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

export async function wavDurationSeconds(path: string): Promise<number> {
  const buf = await readFile(path)
  const byteRate = buf.readUInt32LE(28)
  const dataIdx = buf.indexOf(Buffer.from('data'))
  const dataSize = dataIdx >= 0 ? buf.readUInt32LE(dataIdx + 4) : buf.length - 44
  return dataSize / (byteRate || 44100)
}

export function estimateWords(text: string, totalSecs: number): WordTiming[] {
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
