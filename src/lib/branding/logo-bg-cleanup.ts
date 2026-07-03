// 2026-07-02: Client-seitiger, GEGUARDETER Logo-Background-Remover.
//
// Problem: @imgly/background-removal (isnet) ist ein Salient-Object-Segmentierer
// und schneidet bei Text-/Wortmarken-/mehrteiligen Logos regelmaessig zu viel weg
// -> das Logo wird loechrig/transparent. imgly hat KEINEN Threshold-Knopf, der das
// entschaerft (Config kennt nur model/output/rescale/device).
//
// Loesung: imgly laufen lassen, dann DETERMINISTISCH messen wieviel vom
// geschaetzten Logo-Vordergrund ueberlebt hat (logo-bg-detect.ts). Hat imgly zu
// viel gefressen -> Ergebnis verwerfen, Original zurueckgeben. Der Server-Chroma-
// Key (server-bg-remove.ts) raeumt dann soliden Hintergrund deterministisch —
// der Fall, den imgly ueberhaupt erst falsch macht.
//
// Browser-only (nutzt createImageBitmap/canvas). Wird nur aus 'use client'-
// Komponenten dynamisch importiert.

import {
  decideImglyOvercut,
  estimateForegroundReference,
  opaqueRatio,
} from './logo-bg-detect'

export type LogoCleanupMethod = 'imgly' | 'original' | 'skipped'
export type LogoCleanupResult = {
  /** Die hochzuladende Datei — entweder imgly-bereinigt oder das unveraenderte Original. */
  file: File
  method: LogoCleanupMethod
  /** Diagnose-Grund (fuer Logs / sanfte UI-Hinweise). */
  reason: string
}

/** Vektor-Logos (SVG) + Mini-Files ueberspringen — keine sinnvolle Rasterreinigung. */
const TINY_BYTES = 5 * 1024
/** Messaufloesung deckeln (Ratios sind skalen-invariant) — spart Speicher/Zeit bei grossen Logos. */
const MEASURE_MAX_DIM = 512

async function toImageData(src: Blob, maxDim = MEASURE_MAX_DIM): Promise<ImageData> {
  const bmp = await createImageBitmap(src)
  try {
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('2d-Context nicht verfuegbar')
    // Nearest-Neighbor -> harte FG/BG-Kante bleibt erhalten (bessere Ratio-Schaetzung).
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bmp, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  } finally {
    bmp.close?.()
  }
}

/**
 * Entfernt den Logo-Hintergrund via imgly — verwirft das Ergebnis aber, wenn
 * imgly zu viel weggeschnitten hat (Over-Cut-Guard). Wirft NIE: im Zweifel wird
 * das Original zurueckgegeben, damit der Upload-Flow nie blockiert.
 */
export async function removeLogoBackgroundGuarded(file: File): Promise<LogoCleanupResult> {
  if (file.type === 'image/svg+xml') return { file, method: 'skipped', reason: 'vector' }
  if (file.size < TINY_BYTES) return { file, method: 'skipped', reason: 'tiny' }

  // 1) Retention-Referenz aus dem ORIGINAL messen (3-Wege: alpha / solid-bg / none).
  let foregroundRatioBefore: number | null = null
  try {
    const before = await toImageData(file)
    foregroundRatioBefore = estimateForegroundReference(before.data, before.width, before.height, 4).ref
  } catch {
    // Messfehler -> konservativ null (kein Ratio-Urteil, nur Floor greift spaeter).
    foregroundRatioBefore = null
  }

  // 2) imgly laufen lassen.
  let cleanedBlob: Blob
  try {
    const { removeBackground } = await import('@imgly/background-removal')
    cleanedBlob = await removeBackground(file)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { file, method: 'original', reason: `imgly-failed: ${msg.slice(0, 100)}` }
  }

  // 3) Ergebnis messen + Over-Cut-Guard.
  try {
    const after = await toImageData(cleanedBlob)
    const opaqueRatioAfter = opaqueRatio(after.data, after.width, after.height, 4)
    const verdict = decideImglyOvercut({ foregroundRatioBefore, opaqueRatioAfter })
    if (verdict.overcut) {
      // imgly hat das Logo zerstoert -> Original behalten (Server-Chroma-Key raeumt soliden BG).
      return { file, method: 'original', reason: `overcut: ${verdict.reason}` }
    }
  } catch {
    // Ergebnis nicht messbar -> imgly trotzdem akzeptieren (kein Gegenbeweis).
  }

  const cleanedFile = new File(
    [cleanedBlob],
    file.name.replace(/\.[^.]+$/, '') + '-clean.png',
    { type: 'image/png' },
  )
  return { file: cleanedFile, method: 'imgly', reason: 'ok' }
}
