// PoC-Orchestrator: Skript -> Voiceover -> B-Roll -> props.json  (dann `npm run render`)
import 'dotenv/config'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { generateScript } from './lib/script.mjs'
import { synthesize } from './lib/tts.mjs'
import { fetchBroll } from './lib/broll.mjs'

const FPS = 30
const THEMA = process.argv[2] || 'Was tun direkt nach einem Autounfall?'
const FORMAT = process.argv[3] || 'ratgeber'

await mkdir('./.work', { recursive: true })

console.log(`1/4 Skript … ("${THEMA}", ${FORMAT})`)
const script = await generateScript(THEMA, FORMAT)
await writeFile('./.work/script.json', JSON.stringify(script, null, 2))

console.log('2/4 Voiceover (ElevenLabs -> Fallback Piper) …')
const fullText = script.segmente.map((s) => s.text).join(' ')
const { audioPath, words, engine } = await synthesize(fullText, './.work/voice')
console.log(`   TTS-Engine: ${engine}`)

console.log('3/4 B-Roll (Pexels) …')
const segments = []
let wi = 0
for (const seg of script.segmente) {
  const n = Math.max(1, seg.text.split(/\s+/).filter(Boolean).length)
  const segWords = words.slice(wi, wi + n)
  wi += n
  const start = segWords[0]?.start ?? 0
  const end = segWords.at(-1)?.end ?? start + 2
  let brollPath = null
  // PoC-Resolver: 'stock' UND 'marke' holen Stock (Marken-Bibliothek kommt in Teil B;
  // bis dahin faellt 'marke' auf Stock zurueck -> spiegelt die Resolver-Kette Marke->Stock->Grafik).
  if ((seg.visual?.typ === 'stock' || seg.visual?.typ === 'marke') && seg.visual?.queries?.length) {
    const p = await fetchBroll(seg.visual.queries)
    if (p) {
      const dest = `./.work/${basename(p)}`
      await copyFile(p, dest)
      brollPath = basename(p)
    }
  }
  segments.push({
    on_screen_text: seg.on_screen_text || '',
    startFrame: Math.round(start * FPS),
    endFrame: Math.round(end * FPS),
    words: segWords.map((w) => ({ word: w.word, start: w.start - start, end: w.end - start })),
    brollPath,
  })
}

const totalSecs = (words.at(-1)?.end ?? 30) + 0.8
await writeFile(
  './.work/props.json',
  JSON.stringify({ segments, audioPath: audioPath.split(/[\\/]/).pop(), durationInFrames: Math.ceil(totalSecs * FPS) }, null, 2),
)

console.log('4/4 Fertig. Jetzt rendern:  npm run render   → out.mp4')
console.log('---')
console.log('Caption:', script.caption)
console.log('Hashtags:', (script.hashtags || []).join(' '))
if (script.disclaimer) console.log('Disclaimer:', script.disclaimer)
