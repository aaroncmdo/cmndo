import type { SupabaseClient } from '@supabase/supabase-js'
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { ContentScriptSchema, type ContentScript } from './schema'
import type { ResolvedVisual } from './visual-resolver'
import type { ContentClipProps } from '../../remotion/types'
import { generiereSkript } from './generate-script'
import { synthesize } from './tts'
import { resolveVisual, pexelsStockFetcher } from './visual-resolver'
import { resolveMusik } from './music-resolver'
import { brandLibrary } from '../../remotion/brand-library/registry'
import { buildRenderProps } from './build-render-props'
import { checkGuardrails } from './guardrails'
import { renderClip as defaultRenderClip } from './render-clip'
import { RENDER_PHASES, videoRenderPct } from './render-progress'

/**
 * Render-Orchestrator, ZWEIPHASIG fuer das Script-Review-Gate:
 *   Phase A generiereJobSkript: Guardrails -> Skript -> speichern (status=skript_generiert).
 *   [Admin prueft/editiert das Skript, gibt frei]
 *   Phase B rendereJob: Voiceover -> Visuals -> Props (+Musik) -> Storage -> Render (status=video_fertig).
 * verarbeiteJob = A dann B (voller Durchlauf, z.B. Auto-Modus / Tests).
 * Jede Phase isoliert: Fehler -> status=fehler + fehler_text (Result-Object, kein throw nach aussen).
 * Deps injizierbar (Tests mocken Skript/TTS/Visuals/Render). Asynchron aufzurufen (nicht im Web-Request blockieren).
 */

export interface OrchestratorDeps {
  generiereSkript: typeof generiereSkript
  synthesize: typeof synthesize
  resolveVisualsFor: (script: ContentScript) => Promise<ResolvedVisual[]>
  renderClip: (props: ContentClipProps, onProgress?: (frac: number) => void) => Promise<Buffer>
}

const realDeps: OrchestratorDeps = {
  generiereSkript,
  synthesize,
  resolveVisualsFor: (script) =>
    Promise.all(script.segmente.map((s) => resolveVisual(s.visual, brandLibrary, pexelsStockFetcher))),
  renderClip: defaultRenderClip,
}

const BUCKET = 'marketing-content'

function setter(supabase: SupabaseClient, jobId: string) {
  return (patch: Record<string, unknown>) =>
    supabase
      .from('marketing_content_jobs')
      .update({ ...patch, aktualisiert_am: new Date().toISOString() })
      .eq('id', jobId)
}

/**
 * Phase A: Guardrails + Skript generieren + speichern. Stoppt bei skript_generiert (Review-Gate).
 */
export async function generiereJobSkript(
  jobId: string,
  supabase: SupabaseClient,
  deps: OrchestratorDeps = realDeps,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Guardrails (Kill-Switch + Wochen-Cap) — eigenen Job ausschliessen (kein Off-by-one am Cap-Rand)
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { count } = await supabase
    .from('marketing_content_jobs')
    .select('id', { count: 'exact', head: true })
    .neq('id', jobId)
    .gte('erstellt_am', since)
  const guard = checkGuardrails(count ?? 0)
  if (!guard.ok) return { ok: false, error: guard.error }

  // 2. Job lesen
  const { data: job, error } = await supabase
    .from('marketing_content_jobs')
    .select('id, thema, format')
    .eq('id', jobId)
    .single()
  if (error || !job) return { ok: false, error: 'Job nicht gefunden' }

  const set = setter(supabase, jobId)
  try {
    // 3. Skript -> speichern. Kein Render: der Admin prueft/editiert erst.
    const script = await deps.generiereSkript(job.thema, job.format)
    await set({ status: 'skript_generiert', skript: script, caption: script.caption, hashtags: script.hashtags })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await set({ status: 'fehler', fehler_text: msg })
    return { ok: false, error: msg }
  }
}

/**
 * Phase B: aus dem gespeicherten (ggf. vom Admin editierten) Skript rendern -> video_fertig.
 */
export async function rendereJob(
  jobId: string,
  supabase: SupabaseClient,
  deps: OrchestratorDeps = realDeps,
): Promise<{ ok: boolean; error?: string }> {
  // Job + gespeichertes Skript lesen
  const { data: job, error } = await supabase
    .from('marketing_content_jobs')
    .select('id, skript')
    .eq('id', jobId)
    .single()
  if (error || !job) return { ok: false, error: 'Job nicht gefunden' }
  const parsed = ContentScriptSchema.safeParse(job.skript)
  if (!parsed.success) return { ok: false, error: 'Kein gueltiges Skript zum Rendern' }
  const script = parsed.data

  const set = setter(supabase, jobId)
  // Fortschritt schreiben (kosmetisch fuer den Balken -> darf den Render NIE brechen).
  // aktualisiert_am mit -> dient zugleich als Heartbeat gegen das Reap-Timeout.
  const setProgress = (render_fortschritt: number, render_phase: string) =>
    supabase
      .from('marketing_content_jobs')
      .update({ render_fortschritt, render_phase, aktualisiert_am: new Date().toISOString() })
      .eq('id', jobId)
      .then(
        () => {},
        () => {},
      )
  // Live-Render-% gedrosselt: nur bei >=3% Zuwachs schreiben (~18 Writes/Render statt pro Frame).
  let lastVideoPct: number = RENDER_PHASES.video.pct
  const onRenderProgress = (frac: number) => {
    const pct = videoRenderPct(frac)
    if (pct - lastVideoPct >= 3) {
      lastVideoPct = pct
      void setProgress(pct, 'video')
    }
  }
  try {
    void setProgress(RENDER_PHASES.vorbereitung.pct, 'vorbereitung')
    // 4. Voiceover (ElevenLabs -> Piper Fallback)
    const fullText = script.segmente.map((s) => s.text).join(' ')
    const { audioPath, words } = await deps.synthesize(fullText, join(tmpdir(), `mkjob-${jobId}`))
    await set({ status: 'audio_erzeugt' })
    void setProgress(RENDER_PHASES.voiceover.pct, 'voiceover')

    // 5. Visuals aufloesen (Marke -> Stock -> Grafik)
    const visuals = await deps.resolveVisualsFor(script)
    void setProgress(RENDER_PHASES.visuals.pct, 'visuals')

    // 6. Props + Audio nach Storage (Remotion laedt es beim Render per oeffentlicher URL)
    const props = buildRenderProps(script, words, visuals)
    const audioBuf = await readFile(audioPath)
    const audioKey = `${jobId}/audio${extname(audioPath)}`
    const { error: audioUpErr } = await supabase.storage.from(BUCKET).upload(audioKey, audioBuf, {
      upsert: true,
      contentType: audioPath.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg',
    })
    if (audioUpErr) throw new Error(`Audio-Upload fehlgeschlagen: ${audioUpErr.message}`)
    const audioUrl = supabase.storage.from(BUCKET).getPublicUrl(audioKey).data.publicUrl
    props.audioSrc = audioUrl

    // 6b. Musik-Bett (optional, non-critical): passenden cleared Track als leisen 2. Audio-Layer
    // mitsenden. Fehlt der Track / faellt der Resolve aus -> kein Bett, Render laeuft weiter.
    try {
      props.musicSrc = await resolveMusik(script.musik_stimmung, supabase)
    } catch (e) {
      console.error('[marketing] Musik-Bett uebersprungen', e)
    }

    // 7. Render -> Storage. Zwei Wege:
    //   DETACHED (MARKETING_RENDER_DETACHED=true, prod): der lange Render laeuft in einem
    //   eigenen Prozess, der einen Deploy-Restart des Web-Apps ueberlebt. Der Web-Prozess
    //   macht nur die (schnelle) Vorbereitung oben + spawnt; video_fertig + Video-Upload
    //   uebernimmt der Child (scripts/render-detached.mjs, Supabase via REST).
    if (process.env.MARKETING_RENDER_DETACHED === 'true') {
      void set({ audio_url: audioUrl, kosten_cents: fullText.length }) // Felder, die der Child nicht kennt
      const propsFile = join(tmpdir(), `mkprops-${jobId}-${randomUUID()}.json`)
      await writeFile(propsFile, JSON.stringify(props))
      const child = spawn(
        process.execPath,
        [join(process.cwd(), 'scripts', 'render-detached.mjs'), jobId, propsFile],
        { detached: true, stdio: 'ignore', cwd: process.cwd() },
      )
      child.unref()
      return { ok: true } // Render + video_fertig macht der detached Prozess
    }

    // INLINE (Default / Tests): renderClip im Web-Prozess (stirbt bei Deploy-Restart -> Reap).
    const videoBuf = await deps.renderClip(props, onRenderProgress)
    void setProgress(RENDER_PHASES.upload.pct, 'upload')
    const videoKey = `${jobId}/video.mp4`
    const { error: videoUpErr } = await supabase.storage
      .from(BUCKET)
      .upload(videoKey, videoBuf, { upsert: true, contentType: 'video/mp4' })
    if (videoUpErr) throw new Error(`Video-Upload fehlgeschlagen: ${videoUpErr.message}`)
    const videoUrl = supabase.storage.from(BUCKET).getPublicUrl(videoKey).data.publicUrl

    // 8. Fertig
    await set({
      status: 'video_fertig',
      audio_url: audioUrl,
      video_url: videoUrl,
      dauer_sekunden: Math.round(props.durationInFrames / 30),
      kosten_cents: fullText.length, // TTS-Zeichen als Kosten-/Nutzungs-Proxy
      render_fortschritt: RENDER_PHASES.fertig.pct,
      render_phase: 'fertig',
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await set({ status: 'fehler', fehler_text: msg })
    return { ok: false, error: msg }
  }
}

/**
 * Voller Durchlauf ohne Review-Gate (Auto-Modus / Tests): Skript generieren dann rendern.
 */
export async function verarbeiteJob(
  jobId: string,
  supabase: SupabaseClient,
  deps: OrchestratorDeps = realDeps,
): Promise<{ ok: boolean; error?: string }> {
  const a = await generiereJobSkript(jobId, supabase, deps)
  if (!a.ok) return a
  return rendereJob(jobId, supabase, deps)
}
