import { bundle } from '@remotion/bundler'
import { selectComposition, renderMedia, ensureBrowser } from '@remotion/renderer'
import { join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { ContentClipProps } from '../../remotion/types'
import { waitForRam } from './ram-gate'

/**
 * Rendert die ContentClip-Composition headless zu einem mp4-Buffer.
 * Server-only (Node + Headless-Chromium). Der Bundle wird gecached (einmal pro Prozess).
 * Isoliert: buendelt src/remotion/index.tsx separat (nicht via Next-Webpack).
 */

let cachedServeUrl: string | null = null

async function getServeUrl(): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl
  const entryPoint = join(process.cwd(), 'src', 'remotion', 'index.tsx')
  cachedServeUrl = await bundle({ entryPoint })
  return cachedServeUrl
}

export async function renderClip(props: ContentClipProps): Promise<Buffer> {
  // RAM-Gate: der Render (rspack-bundle + Chromium) darf keinen Nachbar-Prozess OOM-killen.
  // Wartet auf ein sicheres RAM-Fenster; bricht mit klarer Meldung ab statt zu crashen.
  // Schwelle via ENV tunebar (VPS ohne Redeploy). Nicht-Linux -> Gate inaktiv.
  const minMb = Number(process.env.MARKETING_RENDER_MIN_RAM_MB ?? 650)
  await waitForRam({
    minMb,
    onWait: (avail, waited) =>
      console.warn(
        `[marketing] Render wartet auf RAM: ${avail}MB frei (<${minMb}MB benoetigt), gewartet ${Math.round(waited / 1000)}s`,
      ),
  })
  await ensureBrowser()
  const serveUrl = await getServeUrl()
  const inputProps = props as unknown as Record<string, unknown>
  const composition = await selectComposition({ serveUrl, id: 'ContentClip', inputProps })
  const outputLocation = join(tmpdir(), `mkclip-${randomUUID()}.mp4`)
  try {
    // concurrency: 1 -> nur EIN Chromium-Tab gleichzeitig, deckelt die Render-RAM-Spitze.
    await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation, inputProps, concurrency: 1 })
    return await readFile(outputLocation)
  } finally {
    await unlink(outputLocation).catch(() => {})
  }
}
