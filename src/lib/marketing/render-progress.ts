// Render-Fortschritt (0-100) fuer den Balken auf der Content-Studio-Detailseite.
// Von Worker (schreibt render_fortschritt/render_phase) UND UI (Label) geteilt.
// Der Video-Render (35..90) ist die lange Phase -> Live-% pro Frame.

export const RENDER_PHASES = {
  vorbereitung: { pct: 5, label: 'Vorbereitung' },
  voiceover: { pct: 25, label: 'Voiceover' },
  visuals: { pct: 35, label: 'Visuals' },
  video: { pct: 35, label: 'Video-Render' }, // 35..90 dynamisch (videoRenderPct)
  upload: { pct: 92, label: 'Upload' },
  fertig: { pct: 100, label: 'Fertig' },
} as const

export type RenderPhase = keyof typeof RENDER_PHASES

const VIDEO_START = 35
const VIDEO_END = 90

/** Mappt den Render-Frame-Fortschritt (0..1) aufs Gesamt-% (35..90), geklemmt auf 0..100. */
export function videoRenderPct(frac: number): number {
  const p = VIDEO_START + (VIDEO_END - VIDEO_START) * frac
  return Math.min(100, Math.max(0, Math.round(p)))
}

/** Anzeige-Label fuer eine Phase (Fallback: roher Wert bzw. „Wird gerendert"). */
export function renderPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return 'Wird gerendert'
  return (RENDER_PHASES as Record<string, { label: string }>)[phase]?.label ?? phase
}
