# Marketing Content-Studio — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Admin erzeugt unter `/admin/marketing` aus *Thema + Format* automatisch ein fertiges, gebrandetes, durchgehend animiertes 9:16-Kurzvideo (Ratgeber/Ad) und laedt es herunter — komplett in-house (Remotion + Claude + ElevenLabs + Pexels), headless-faehig fuer spaetere Cron-Automatik.

**Architecture:** Zwei Teile. **Teil A (PoC-Spike, standalone in `scripts/marketing-poc/`):** eine lauffaehige Pipeline, die *einen* echten deutschen Clip rendert — zum Ausprobieren und Justieren, ohne die App anzufassen. **Teil B (Produktion, TDD):** die validierte Pipeline wird in `src/app/admin/marketing/` + `src/remotion/` + Supabase gehoben (DB-Job-Lifecycle, Visual-Resolver mit Marken-Bibliothek, Admin-UI, Guardrails). Dazwischen ein **Entscheidungs-Gate** (Qualitaet beurteilen → Spec/Plan anpassen).

**Tech Stack:** Remotion 4 (`@remotion/cli`, `@remotion/bundler`, `@remotion/renderer`), React 19, `@anthropic-ai/sdk` (Claude Opus), ElevenLabs REST (`/with-timestamps`), Pexels REST, Next.js 16 App Router, Supabase (Postgres + Storage), Zod, Vitest, Playwright.

## Global Constraints

_(Aus der Spec; gelten implizit fuer JEDE Task.)_

- Ort: `src/app/admin/marketing/`, URL `https://app.claimondo.de/admin/marketing`, nur **Admin-Rolle**.
- Video: **1080×1920 (9:16)**, faceless (kein Mensch/Avatar), **jeder Frame gefuellt + in Bewegung**.
- Skript-/Visual-Plan-Modell: **`claude-opus-4-8`** (bei Bau pruefen, ob neuere Sonnet-Version verfuegbar; dann die).
- TTS: **ElevenLabs**, Multilingual, deutsche Stimme, env `ELEVENLABS_API_KEY`.
- B-Roll: **Pexels**, env `PEXELS_API_KEY`; Visual-Resolver-Prioritaet **Marken-Bibliothek → Stock → generische Grafik**.
- Design-Tokens: `src/lib/design-tokens.ts` (Claimondo). Keine Inline-Hex fuer Markenfarben.
- Guardrails: env `MARKETING_MAX_CLIPS_PER_WEEK` (default 20), `MARKETING_STUDIO_ENABLED` (default true).
- Server-Actions: Result-Object `{ ok; error? }`, **kein** throw (AGENTS.md). Non-kritische Sends in try/catch.
- **DDL nur via Supabase-Plugin** (`apply_migration`, Regel 2, inkl. Version-Tracking + Migration-File). **Kein** raw `execute_sql`-DDL.
- **Kein Direct-Push auf `main`** (Regel 1) — PR gegen `staging`.
- **Frontend-Umlaute Pflicht**: alle UI-Strings echte `ä/ö/ü/ß`.
- **Komponenten-Set**: `@/components/primitives/*` + `@/components/shared/*` (DataTable, StatusBadge, forms). Keine handgerollten Buttons/Cards/Tables.
- Remotion **isoliert vom Next-Client-Bundle** (nur Server/Render-Zeit).
- `ist_ki_generiert=true` an jedem Job (fuer spaetere KI-Kennzeichnung).
- 7-Punkte-Audit vor jedem Commit; Commit-Body enthaelt Audit-Block.

---

# TEIL A — PoC-Spike (standalone, lauffaehig)

> Ziel: **eine `out.mp4`** aus einem hartkodierten Thema, damit Nicolas/Aaron Qualitaet + „durchgehend bewegt" beurteilen koennen. Lebt komplett in `scripts/marketing-poc/` (eigenes `package.json`), beruehrt die App **nicht**, wird von keinem Ratchet gescannt. Nach dem Gate wird der Code in Teil B gehaertet (mit Tests) — hier zaehlt Lauffaehigkeit, nicht TDD.

### Task A0: PoC-Geruest + Keys + Deps

**Files:**
- Create: `scripts/marketing-poc/package.json`
- Create: `scripts/marketing-poc/.env.example`
- Create: `scripts/marketing-poc/README.md`
- Create: `scripts/marketing-poc/.gitignore`

**Interfaces:**
- Produces: ein Node-ESM-Projekt (Node 20+), in dem A1–A5 laufen. Env-Keys: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `ELEVENLABS_VOICE_ID`.

- [ ] **Step 1: package.json anlegen**

```json
{
  "name": "marketing-poc",
  "private": true,
  "type": "module",
  "scripts": {
    "gen": "node run.mjs",
    "render": "remotion render remotion/index.mjs ContentClip out.mp4 --props=./.work/props.json"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@remotion/bundler": "4.0.*",
    "@remotion/cli": "4.0.*",
    "@remotion/renderer": "4.0.*",
    "dotenv": "^16.4.5",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "remotion": "4.0.*"
  }
}
```

- [ ] **Step 2: .env.example + .gitignore**

`.env.example`:
```
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
PEXELS_API_KEY=...
# Deutsche Stimme aus https://elevenlabs.io/app/voice-library (Multilingual-faehig). Default = eine neutrale DE-Stimme.
ELEVENLABS_VOICE_ID=
```
`.gitignore`:
```
node_modules
.env
.work/
out.mp4
```

- [ ] **Step 3: README mit Run-Anleitung** (Keys eintragen → `npm i` → `npm run gen` → `npm run render` → `out.mp4` ansehen). Pexels-Key gratis: https://www.pexels.com/api/. ElevenLabs-Key habt ihr bereits.

- [ ] **Step 4: Install + Smoke**

Run: `cd scripts/marketing-poc && npm install && npx remotion versions`
Expected: Remotion-Version 4.0.x, keine Peer-Fehler (React 19 wird von Remotion 4 unterstuetzt).

- [ ] **Step 5: Commit**
```bash
git add scripts/marketing-poc/package.json scripts/marketing-poc/.env.example scripts/marketing-poc/.gitignore scripts/marketing-poc/README.md
git commit -m "chore(marketing-poc): scaffold standalone PoC harness"
```

---

### Task A1: Claude — Skript + Visual-Plan

**Files:**
- Create: `scripts/marketing-poc/lib/script.mjs`

**Interfaces:**
- Produces: `async function generateScript(thema, format) -> ScriptJSON`
  ```
  ScriptJSON = { hook, segmente: [{ text, on_screen_text, visual: { typ: 'marke'|'stock'|'grafik', tags?: string[], queries?: string[] } }], caption, hashtags: string[], disclaimer? }
  ```

- [ ] **Step 1: Generator implementieren** (Tool-Use erzwingt sauberes JSON)

```js
// scripts/marketing-poc/lib/script.mjs
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TOOL = {
  name: 'liefere_clip',
  description: 'Liefert Skript + Visual-Plan fuer einen 9:16-Kurzclip.',
  input_schema: {
    type: 'object',
    required: ['hook', 'segmente', 'caption', 'hashtags'],
    properties: {
      hook: { type: 'string', description: 'Aufmerksamkeits-Hook, 1 Satz.' },
      segmente: {
        type: 'array', minItems: 3, maxItems: 7,
        items: {
          type: 'object', required: ['text', 'visual'],
          properties: {
            text: { type: 'string', description: 'Gesprochener Satz (Voiceover).' },
            on_screen_text: { type: 'string', description: 'Kurzes Overlay (max 5 Woerter).' },
            visual: {
              type: 'object', required: ['typ'],
              properties: {
                typ: { type: 'string', enum: ['marke', 'stock', 'grafik'] },
                tags: { type: 'array', items: { type: 'string' } },
                queries: { type: 'array', items: { type: 'string' }, description: 'Konkrete ENGLISCHE Pexels-Suchbegriffe, visuell eindeutig.' },
              },
            },
          },
        },
      },
      caption: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } },
      disclaimer: { type: 'string' },
    },
  },
}

const SYSTEM = `Du schreibst deutsche Kurzvideo-Skripte fuer Claimondo (KFZ-Gutachter / Unfallschaden-Abwicklung).
Regeln:
- Ziel-Dauer 30-60s: 3-6 kurze, gesprochene Saetze.
- KEINE Rechtsberatung. Bei Versicherungs-/Rechtsthemen vorsichtig-allgemein formulieren + kurzen Disclaimer setzen.
- Vertrauensvoller, klarer Ton (kein Clickbait-Trash).
- Visual-Plan pro Segment: konkrete physische Szene -> typ 'stock' mit 2-3 ENGLISCHEN, visuell eindeutigen queries.
  Abstrakter Begriff (Frist, Anspruch, Prozent) -> typ 'grafik'. Ikonisch/gebrandet (Warndreieck, Kennzeichen, Logo) -> typ 'marke' mit tags.
- on_screen_text: knackiges Overlay, max 5 Woerter.`

export async function generateScript(thema, format) {
  const modus = format === 'ad' ? 'Werbeclip mit klarem Call-to-Action am Ende.' : 'Ratgeber-Clip, aufklaerend, Mehrwert zuerst.'
  const res = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: 'liefere_clip' },
    messages: [{ role: 'user', content: `Thema: "${thema}". Format: ${modus}` }],
  })
  const call = res.content.find((c) => c.type === 'tool_use')
  if (!call) throw new Error('Kein tool_use in Claude-Antwort')
  return call.input
}
```

- [ ] **Step 2: Ad-hoc-Run**

Run: `cd scripts/marketing-poc && node -e "import('./lib/script.mjs').then(m=>m.generateScript('Was tun direkt nach einem Autounfall?','ratgeber')).then(r=>console.log(JSON.stringify(r,null,2)))"`
Expected: valides JSON mit 3-6 Segmenten, je `visual.typ`, deutsche Saetze, englische Queries bei `stock`.
_Verify:_ Modell-ID `claude-opus-4-8` aktiv; falls Anthropic eine neuere Sonnet meldet, dort eintragen.

- [ ] **Step 3: Commit** `git commit -am "feat(marketing-poc): Claude script + visual-plan generator"`

---

### Task A2: ElevenLabs — Voiceover + Wort-Timings

**Files:**
- Create: `scripts/marketing-poc/lib/tts.mjs`

**Interfaces:**
- Produces: `async function synthesize(text, outPath) -> { audioPath, words: [{ word, start, end }] }` (Zeiten in Sekunden).

- [ ] **Step 1: TTS + Character-Alignment → Wort-Timings**

```js
// scripts/marketing-poc/lib/tts.mjs
import { writeFile } from 'node:fs/promises'

const MODEL = 'eleven_multilingual_v2'

export async function synthesize(text, outPath) {
  const voice = process.env.ELEVENLABS_VOICE_ID
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, output_format: 'mp3_44100_128' }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
  const data = await res.json() // { audio_base64, alignment: { characters, character_start_times_seconds, character_end_times_seconds } }
  await writeFile(outPath, Buffer.from(data.audio_base64, 'base64'))
  return { audioPath: outPath, words: charsToWords(data.alignment) }
}

// Character-Alignment -> Wort-Timings (Split an Leerzeichen)
function charsToWords(a) {
  const words = []
  let cur = null
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i]
    if (ch.trim() === '') { if (cur) { words.push(cur); cur = null } continue }
    if (!cur) cur = { word: '', start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] }
    cur.word += ch
    cur.end = a.character_end_times_seconds[i]
  }
  if (cur) words.push(cur)
  return words
}
```

- [ ] **Step 2: Ad-hoc-Run** (ELEVENLABS_VOICE_ID muss gesetzt sein)

Run: `cd scripts/marketing-poc && node -e "import('./lib/tts.mjs').then(m=>m.synthesize('Nach einem Unfall zaehlt jede Minute.','./.work/voice.mp3')).then(r=>console.log(r.words.slice(0,5)))"`
Expected: `.work/voice.mp3` abspielbar (deutsche Stimme), `words` mit plausiblen start/end (Sekunden).
_Verify:_ Response-Feldnamen der `/with-timestamps`-Route gegen aktuelle Doku (https://elevenlabs.io/docs) — erwartete Form `{ audio_base64, alignment: { characters[], character_start_times_seconds[], character_end_times_seconds[] } }`.

- [ ] **Step 3: Commit** `git commit -am "feat(marketing-poc): ElevenLabs TTS with word timings"`

---

### Task A3: Pexels — B-Roll je Segment

**Files:**
- Create: `scripts/marketing-poc/lib/broll.mjs`

**Interfaces:**
- Produces: `async function fetchBroll(queries) -> string|null` (lokaler Pfad zu heruntergeladenem Portrait-Clip, oder null).

- [ ] **Step 1: Pexels-Suche (Portrait) + Download**

```js
// scripts/marketing-poc/lib/broll.mjs
import { writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export async function fetchBroll(queries = []) {
  for (const q of queries) {
    const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=1`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } })
    if (!res.ok) continue
    const data = await res.json()
    const vid = data.videos?.[0]
    if (!vid) continue
    // portrait-taugliche Datei mit hoechster Aufloesung <= 1080 Breite bevorzugen
    const file = vid.video_files.filter(f => f.height >= f.width).sort((a,b)=>b.height-a.height)[0] || vid.video_files[0]
    if (!file) continue
    await mkdir('./.work/broll', { recursive: true })
    const path = `./.work/broll/${createHash('md5').update(file.link).digest('hex')}.mp4`
    const bin = Buffer.from(await (await fetch(file.link)).arrayBuffer())
    await writeFile(path, bin)
    return path
  }
  return null
}
```

- [ ] **Step 2: Ad-hoc-Run**

Run: `cd scripts/marketing-poc && node -e "import('./lib/broll.mjs').then(m=>m.fetchBroll(['car accident damage','car crash'])).then(console.log)"`
Expected: Pfad zu einer heruntergeladenen Portrait-`.mp4` in `.work/broll/`.
_Verify:_ Pexels-Response-Form (`videos[].video_files[].link/width/height`) gegen https://www.pexels.com/api/documentation/#videos-search.

- [ ] **Step 3: Commit** `git commit -am "feat(marketing-poc): Pexels portrait b-roll fetch"`

---

### Task A4: Remotion-Composition (voll animiert)

**Files:**
- Create: `scripts/marketing-poc/remotion/index.mjs`
- Create: `scripts/marketing-poc/remotion/ContentClip.jsx`
- Create: `scripts/marketing-poc/remotion.config.mjs`

**Interfaces:**
- Consumes: Props `{ segments: [{ on_screen_text, words:[{word,start,end}], brollPath|null }], audioPath, brand }` und rendert 1080×1920.
- Produces: registrierte Composition `ContentClip`.

- [ ] **Step 1: Composition — B-Roll-Ebene + kinetische Untertitel + animierter BG + Bumper**

```jsx
// scripts/marketing-poc/remotion/ContentClip.jsx
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig, interpolate, staticFile } from 'remotion'

const NAVY = '#0D1B3E', ACCENT = '#4573A2', CREAM = '#F5F1E8'

function AnimatedBg() {
  const f = useCurrentFrame()
  const shift = interpolate(f % 240, [0, 240], [0, 30])
  return <AbsoluteFill style={{ background: `radial-gradient(120% 120% at ${20 + shift}% 0%, ${ACCENT}22, ${NAVY})` }} />
}

function KineticCaption({ words }) {
  const f = useCurrentFrame(), { fps } = useVideoConfig()
  const t = f / fps
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', padding: 120 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {words.map((w, i) => {
          const on = t >= w.start && t <= w.end + 0.15
          return <span key={i} style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 64,
            color: on ? CREAM : '#ffffff99', transform: on ? 'scale(1.08)' : 'scale(1)', transition: 'none',
            textShadow: '0 4px 24px #0008' }}>{w.word}</span>
        })}
      </div>
    </AbsoluteFill>
  )
}

function Overlay({ text }) {
  const f = useCurrentFrame()
  const y = interpolate(f, [0, 12], [40, 0], { extrapolateRight: 'clamp' })
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  if (!text) return null
  return <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 200 }}>
    <div style={{ transform: `translateY(${y}px)`, opacity: o, background: NAVY, color: CREAM, padding: '16px 28px',
      borderRadius: 24, fontFamily: 'Inter', fontWeight: 700, fontSize: 44 }}>{text}</div>
  </AbsoluteFill>
}

export function ContentClip({ segments = [], audioPath, brand }) {
  const { fps } = useVideoConfig()
  let cursor = 0
  return (
    <AbsoluteFill>
      <AnimatedBg />
      {segments.map((s, i) => {
        const dur = Math.max(1, Math.round(((s.words.at(-1)?.end ?? 2) - (s.words[0]?.start ?? 0)) * fps))
        const from = cursor; cursor += dur
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {s.brollPath && <OffthreadVideo src={staticFile(s.brollPath)} muted
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />}
            <Overlay text={s.on_screen_text} />
            <KineticCaption words={s.words.map(w => ({ ...w, start: w.start - (s.words[0]?.start ?? 0), end: w.end - (s.words[0]?.start ?? 0) }))} />
          </Sequence>
        )
      })}
      {audioPath && <Audio src={staticFile(audioPath)} />}
    </AbsoluteFill>
  )
}
```

- [ ] **Step 2: Root/Index + calculateMetadata (Dauer aus Audio)**

```jsx
// scripts/marketing-poc/remotion/index.mjs
import { registerRoot, Composition } from 'remotion'
import { getAudioDurationInSeconds } from '@remotion/media-utils'
import { ContentClip } from './ContentClip.jsx'
import { staticFile } from 'remotion'

const Root = () => (
  <Composition id="ContentClip" component={ContentClip} width={1080} height={1920} fps={30}
    durationInFrames={900} defaultProps={{ segments: [], audioPath: null, brand: {} }}
    calculateMetadata={async ({ props }) => {
      const secs = props.audioPath ? await getAudioDurationInSeconds(staticFile(props.audioPath)) : 30
      return { durationInFrames: Math.ceil(secs * 30) + 30 }
    }} />
)
registerRoot(() => <Root />)
```
_(Add `@remotion/media-utils` to deps.)_

- [ ] **Step 3: remotion.config** (staticFile-Root auf `.work/`, damit Audio/B-Roll gefunden werden)

```js
// scripts/marketing-poc/remotion.config.mjs
import { Config } from '@remotion/cli/config'
Config.setPublicDir('./.work')
```

- [ ] **Step 4: Commit** `git commit -am "feat(marketing-poc): Remotion ContentClip composition"`

---

### Task A5: Orchestrator-Skript (wire A1–A4 → out.mp4)

**Files:**
- Create: `scripts/marketing-poc/run.mjs`

**Interfaces:**
- Consumes: A1 `generateScript`, A2 `synthesize`, A3 `fetchBroll`.
- Produces: `.work/props.json` + Aufruf-Anleitung; `npm run render` erzeugt `out.mp4`.

- [ ] **Step 1: Pipeline verdrahten** (Pfade relativ zu `.work/` = publicDir)

```js
// scripts/marketing-poc/run.mjs
import 'dotenv/config'
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { generateScript } from './lib/script.mjs'
import { synthesize } from './lib/tts.mjs'
import { fetchBroll } from './lib/broll.mjs'

const THEMA = process.argv[2] || 'Was tun direkt nach einem Autounfall?'
const FORMAT = process.argv[3] || 'ratgeber'

await mkdir('./.work', { recursive: true })
console.log('1/4 Skript…'); const script = await generateScript(THEMA, FORMAT)
await writeFile('./.work/script.json', JSON.stringify(script, null, 2))

console.log('2/4 Voiceover…'); const fullText = script.segmente.map(s => s.text).join(' ')
const { audioPath, words } = await synthesize(fullText, './.work/voice.mp3')

// Woerter grob den Segmenten zuordnen (sequentiell nach Wortanzahl)
console.log('3/4 B-Roll…'); const segments = []; let wi = 0
for (const seg of script.segmente) {
  const n = seg.text.split(/\s+/).filter(Boolean).length
  const segWords = words.slice(wi, wi + n); wi += n
  let brollPath = null
  if (seg.visual?.typ === 'stock') {
    const p = await fetchBroll(seg.visual.queries || [])
    if (p) { const dest = `./.work/${basename(p)}`; await copyFile(p, dest); brollPath = basename(p) }
  }
  segments.push({ on_screen_text: seg.on_screen_text || '', words: segWords, brollPath })
}

console.log('4/4 props.json…')
await writeFile('./.work/props.json', JSON.stringify({ segments, audioPath: 'voice.mp3', brand: {} }, null, 2))
console.log('Fertig. Jetzt rendern:  npm run render   → out.mp4')
console.log('Caption/Post-Text:', script.caption, script.hashtags?.join(' '))
```

- [ ] **Step 2: Voller Durchlauf**

Run: `cd scripts/marketing-poc && npm run gen && npm run render`
Expected: `out.mp4` (1080×1920), deutsche Stimme, Untertitel wort-synchron hervorgehoben, B-Roll bei Stock-Segmenten, animierter Hintergrund. Render-Zeit auf normalem Rechner < ~2 min fuer ~40s Clip.

- [ ] **Step 3: Commit** `git commit -am "feat(marketing-poc): end-to-end orchestrator -> out.mp4"`

---

### Task A6: Ausprobieren + dokumentieren

- [ ] **Step 1:** `out.mp4` ansehen. Bewerten (Skala 1–5): Untertitel-Sync, B-Roll-Relevanz, „durchgehend bewegt", Marken-Feel, Stimme.
- [ ] **Step 2:** Je Thema/Format 2–3 weitere Durchlaeufe (`node run.mjs "<thema>" ad`) → Streuung der Qualitaet.
- [ ] **Step 3:** Befunde in `scripts/marketing-poc/FINDINGS.md` festhalten (was gut, was justieren: Prompt, Timing-Zuordnung, BG-Stil, Query-Qualitaet).
- [ ] **Step 4: Commit** `git commit -am "docs(marketing-poc): PoC findings"`

---

## ⛳ ENTSCHEIDUNGS-GATE (nach Teil A)

**Nicolas/Aaron schauen `out.mp4` an.** Erst wenn Qualitaet + „durchgehend bewegt" ueberzeugen, geht es in Teil B. Typische Justierungen, die HIER (billig) passieren, nicht spaeter:
- Prompt-Ton / Segment-Laenge / Disclaimer-Formulierung (A1).
- Wort→Segment-Zuordnung praeziser (A5 nutzt heuristische Wortzaehlung; ggf. Segment-weise TTS statt einmal).
- BG-/Caption-Stil, Marken-Bumper, Schriftgroesse (A4).
- Query-Qualitaet / Fallback auf Grafik (A1/A3).

**Output des Gates:** ggf. aktualisierte Spec-Punkte → dann Teil B. **Wenn Qualitaet nicht traegt:** hier neu entscheiden (z.B. mehr Grafik statt Stock, andere Stimme) — VOR jedem App-Aufwand.

---

# TEIL B — Produktion Slice 1 (TDD, erst nach Gate)

> Jede Task: TDD (failing test → fail → impl → pass → commit). Ausfuehrung via `superpowers:subagent-driven-development`. Die validierte PoC-Logik wird gehoben, nicht neu erfunden.

### Task B1: Migration `marketing_content_jobs` (Supabase-Plugin)

**Files:**
- Create: `supabase/migrations/<V>_marketing_content_jobs.sql` (Dateiname == vom Plugin getrackte Version)

**Interfaces:**
- Produces: Tabelle `marketing_content_jobs` (Spalten laut Spec §5), RLS admin-only.

- [ ] **Step 1:** DDL schreiben (Spalten aus Spec §5: id, thema, format CHECK, status CHECK, skript jsonb, caption, hashtags text[], audio_url, video_url, dauer_sekunden, ist_ki_generiert bool default true, kosten_cents, fehler_text, erstellt_von, erstellt_am/aktualisiert_am timestamptz default now()). Naming `erstellt_am`/`aktualisiert_am` gegen Nachbartabellen verifizieren (`list_tables`).
- [ ] **Step 2:** `apply_migration({ name: 'marketing_content_jobs', query: '<DDL inkl. RLS admin-only + policies>' })`.
- [ ] **Step 3:** `list_migrations` → getrackte Version `<V>` ablesen; Migration-File exakt als `supabase/migrations/<V>_marketing_content_jobs.sql` committen (Regel 2, Twin-Drift vermeiden).
- [ ] **Step 4:** `execute_sql` (READ) → `select` auf leere Tabelle bestaetigt Existenz + Spalten. RLS: als anon 0 Zeilen.
- [ ] **Step 5: Commit** File + `git commit -m "feat(marketing): marketing_content_jobs table + RLS"`

### Task B2: Storage-Bucket `marketing-content`

- [ ] **Step 1:** Bucket via Supabase anlegen (public read). **Step 2:** Policy: nur Admin schreibt. **Step 3:** READ-Verify (Bucket existiert). **Step 4: Commit** (Doku/Script).

### Task B3: Zod-Schema (Skript + Visual-Plan)

**Files:** Create `src/lib/marketing/schema.ts`, Test `src/lib/marketing/schema.test.ts`
**Interfaces:** Produces `ScriptSchema` (Zod), Typ `ContentScript` = A1 `ScriptJSON`.
- [ ] Test: gueltiges JSON parst; fehlendes `visual.typ` wirft; unbekannter `typ` wirft. → impl `z.object(...)` (spiegelt A1-TOOL-Schema) → pass → commit.

### Task B4: Skript-Generator Server-Action

**Files:** Create `src/app/admin/marketing/actions.ts` (`'use server'`), Test `src/app/admin/marketing/actions.test.ts`
**Interfaces:** Produces `async function generiereSkript(thema, format): Promise<{ ok:true; data:ContentScript } | { ok:false; error:string }>` — Anthropic-Client gemockt im Test; nutzt A1-Prompt/Tool; validiert mit `ScriptSchema`. Result-Object, kein throw.
- [ ] Test (mock SDK → Tool-Output) → impl (aus A1 gehoben, `claude-opus-4-8`, Zod-validate, Compliance-System-Prompt) → pass → commit.

### Task B5: TTS-Adapter

**Files:** Create `src/lib/marketing/tts.ts` (+ `tts.eleven.ts`), Test `tts.test.ts`
**Interfaces:** Produces `interface TtsAdapter { synthesize(text): Promise<{ audio: Buffer; words: WordTiming[] }> }`, Default-Impl ElevenLabs (aus A2), `WordTiming = { word; start; end }`.
- [ ] Test (fetch gemockt → base64+alignment) prueft `charsToWords`-Mapping → impl → pass → commit.

### Task B6: Visual-Resolver (Marke → Stock → Grafik)

**Files:** Create `src/lib/marketing/visual-resolver.ts`, `src/remotion/brand-library/registry.ts`, Test `visual-resolver.test.ts`
**Interfaces:** Produces `async function resolveVisual(plan: SegmentVisual): Promise<ResolvedVisual>` mit `ResolvedVisual = { kind: 'brand'|'stock'|'graphic'; ref: string }`. Prioritaet: Registry-Tag-Match → Pexels (A3) → `{kind:'graphic'}`. Nie null.
- [ ] Test: `typ:'marke'` mit bekanntem Tag → brand; `typ:'stock'` + gemockt Pexels-Treffer → stock; Pexels leer → graphic-Fallback. → impl → pass → commit.

### Task B7: Remotion-Paket `src/remotion/` + Marken-Bibliothek

**Files:** Create `src/remotion/index.ts`, `src/remotion/ContentClip.tsx`, `src/remotion/brand-library/*` (erste 3–5 Branded-Components: Warndreieck, Kennzeichen-Frame, Zahlen-Motif, Logo-Bumper), `remotion.config.ts`; isoliert vom Client-Bundle (kein Import aus `app/`/Client-Komponenten). Test: `src/remotion/ContentClip.test.tsx` (Props-Rendering headless via `@remotion/renderer` selectComposition auf Fixture).
**Interfaces:** Consumes `ResolvedVisual`, `WordTiming`; Produces Composition `ContentClip` (Claimondo-Tokens statt PoC-Hex). Aus A4 gehoben, Farben aus `design-tokens.ts`.
- [ ] Render-Smoke-Test (kurzes Fixture rendert ohne Crash) → impl → pass → commit.

### Task B8: Render-Orchestrator + Guardrails

**Files:** Create `src/lib/marketing/orchestrator.ts`, Test `orchestrator.test.ts`
**Interfaces:** Produces `async function verarbeiteJob(jobId): Promise<{ ok; error? }>`: liest Job → skript→audio→visuals→`renderMedia`→Storage-Upload→Status/Kosten-Update. Stufen isoliert (Fehler → status=`fehler`+`fehler_text`). Kosten-Cap (`MARKETING_MAX_CLIPS_PER_WEEK`, Zaehler letzte 7 Tage) + Kill-Switch (`MARKETING_STUDIO_ENABLED`) VOR Generierung. Asynchron (nicht im Web-Request blockieren).
- [ ] Tests: Kill-Switch aus → sofort `{ok:false}` ohne Kosten; Cap erreicht → Block; happy path (Stufen gemockt) → status `video_fertig` + `video_url`; TTS-Fehler → status `fehler`. → impl → pass → commit.

### Task B9: Admin-Route + Nav + UI

**Files:** Create `src/app/admin/marketing/page.tsx` (Liste), `NeuerClipForm.tsx`, `[id]/page.tsx` (Detail), `JobStatusBadge.tsx`; Modify Admin-Nav-Registry (+1 Eintrag „Marketing", Admin-Rolle). Test: Vitest fuer Form-Action-Verdrahtung.
**Interfaces:** Consumes `generiereSkript`, `verarbeiteJob`, Job-Reads. Nutzt `shared/DataTable`, `StatusBadge`, `primitives.*`, `forms/*`. UI-Strings mit echten Umlauten.
- [ ] Nav-Eintrag sichtbar (Admin) → Liste rendert Jobs → „Neuer Clip"-Form legt Job an + startet `verarbeiteJob` → Detail zeigt Skript (editierbar), Status, Preview-`<video>`, Download. Je Teil-Step Test/Verify → commit.

### Task B10: Playwright — Erreichbarkeit + Smoke

**Files:** Create `tests/e2e/flows/admin-marketing-smoke.spec.ts`
- [ ] `/admin/marketing` als Admin erreichbar (Nav-Klick) + „Neuer Clip"-Form legt Job an (Generierung gemockt/Kill-Switch-Pfad). Lokal grün → commit.

### Task B11: Ops + Audit-Abschluss

- [ ] VPS-Deploy: Remotion-Systemdeps (Chromium-Libs via `@remotion/renderer` `ensureBrowser`, ffmpeg gebuendelt) im Deploy-Pfad dokumentieren/ergaenzen.
- [ ] `npm run build` grün · alle 4 Token/Component/Knip-Ratchets 0-neu · 7-Punkte-Audit im finalen Commit-Body.
- [ ] PR gegen `staging` (Regel 1), Body mit Audit-Block. **Kein** Direct-Push `main`.

---

## Self-Review (durch den Plan-Autor)

**Spec-Coverage:** §4 U1→B9 · U2→B1/B2 · U3→B4 · U4→B5 · U5→B6 · U6→B7 · U7→B8 · U8→B9 · Testing §13 (PoC→Teil A, Unit→B3–B8, Smoke→B7/B10) · Guardrails §10→B8 · Compliance §15 (`ist_ki_generiert`)→B1 · Cron-Readiness §12 = bewusst Slice 3 (nicht hier). **Keine offene Spec-Anforderung ohne Task.**
**Placeholder-Scan:** keine „TBD/handle errors"-Platzhalter; externe API-Formen mit konkretem Erwartungsschema + Doku-URL als _Verify_ markiert (echte Anweisung, kein Platzhalter).
**Typ-Konsistenz:** `ScriptJSON`(A1) == `ContentScript`(B3) == Rueckgabe `generiereSkript`(B4); `WordTiming`(B5) konsumiert von B7; `ResolvedVisual`(B6) konsumiert von B7/B8; `verarbeiteJob`/`generiereSkript` Result-Object-Shape durchgehend.
