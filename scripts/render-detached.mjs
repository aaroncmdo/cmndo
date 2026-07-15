#!/usr/bin/env node
// Detached Render-Worker (Marketing). Rendert EINEN Job in einem eigenen Prozess, der
// einen Web-App-Deploy-Restart (`pm2 restart claimondo-v2`) UEBERLEBT — deshalb spawnt der
// Web-Prozess dies mit {detached:true}.unref() statt inline zu rendern.
//
// Aufruf: node scripts/render-detached.mjs <jobId> <propsFile>
// Der Web-Prozess macht die schnelle Vorbereitung (TTS/Visuals/Audio-Upload/Props) und
// schreibt die Render-Props nach <propsFile>; dieser Prozess macht den langen Teil:
// bundle + renderMedia (+ Live-Progress) -> Video-Upload -> status=video_fertig.
//
// Supabase via REST (fetch, node20): @supabase/supabase-js ist ins App-Bundle gebacken und
// liegt NICHT in node_modules — @remotion/* dagegen schon (serverExternalPackages). Env
// (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) wird vom Web-Prozess vererbt.
import { bundle } from '@remotion/bundler'
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer'
import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const jobId = process.argv[2]
const propsFile = process.argv[3]
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'marketing-content'
const MIN_MB = Number(process.env.MARKETING_RENDER_MIN_RAM_MB ?? 650)

/** Job-Update via PostgREST (non-critical -> nie den Render brechen). */
async function patchJob(patch) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/marketing_content_jobs?id=eq.${jobId}`, {
      method: 'PATCH',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...patch, aktualisiert_am: new Date().toISOString() }),
    })
  } catch {
    /* ignore */
  }
}

/** Verfuegbarer RAM in MB (Linux /proc/meminfo). null -> nicht ermittelbar. */
async function availableRamMb() {
  try {
    const m = (await readFile('/proc/meminfo', 'utf8')).match(/^MemAvailable:\s+(\d+)\s+kB/m)
    return m ? Math.floor(Number(m[1]) / 1024) : null
  } catch {
    return null
  }
}

/** Backstop-RAM-Gate (der Worker hat schon vorgecheckt; hier gegen Zwischen-Abfall). */
async function waitForRam() {
  let avail = await availableRamMb()
  if (avail === null || avail >= MIN_MB) return
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 12_000)) // max ~8 min
    avail = await availableRamMb()
    if (avail === null || avail >= MIN_MB) return
  }
  throw new Error(`Zu wenig RAM fuer Render: nur ${avail}MB frei (<${MIN_MB}MB)`)
}

async function main() {
  if (!jobId || !propsFile) throw new Error('Aufruf: render-detached.mjs <jobId> <propsFile>')
  if (!SUPA_URL || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen')
  const props = JSON.parse(await readFile(propsFile, 'utf8'))

  await waitForRam()
  await ensureBrowser()
  const serveUrl = await bundle({ entryPoint: join(process.cwd(), 'src', 'remotion', 'index.tsx') })
  const composition = await selectComposition({ serveUrl, id: 'ContentClip', inputProps: props })

  const out = join(tmpdir(), `mkclip-${randomUUID()}.mp4`)
  let lastPct = 35
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    inputProps: props,
    concurrency: 1,
    onProgress: ({ progress }) => {
      const p = Math.min(90, Math.max(35, Math.round(35 + 55 * progress)))
      if (p - lastPct >= 3) {
        lastPct = p
        void patchJob({ render_fortschritt: p, render_phase: 'video' })
      }
    },
  })
  await patchJob({ render_fortschritt: 92, render_phase: 'upload' })

  const videoBuf = await readFile(out)
  const up = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${jobId}/video.mp4`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
    body: videoBuf,
  })
  if (!up.ok) throw new Error(`Video-Upload REST ${up.status}: ${await up.text()}`)
  const videoUrl = `${SUPA_URL}/storage/v1/object/public/${BUCKET}/${jobId}/video.mp4`

  await patchJob({
    status: 'video_fertig',
    video_url: videoUrl,
    dauer_sekunden: Math.round((props.durationInFrames ?? 900) / 30),
    render_fortschritt: 100,
    render_phase: 'fertig',
  })
  await unlink(out).catch(() => {})
  await unlink(propsFile).catch(() => {})
}

main().catch(async (err) => {
  await patchJob({ status: 'fehler', fehler_text: err instanceof Error ? err.message : String(err) })
  await unlink(propsFile).catch(() => {})
  process.exit(1)
})
