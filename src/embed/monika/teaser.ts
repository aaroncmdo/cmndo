// AAR-939 · Monika-A-Flow · PURE Teaser-Logik (Scroll-Tiefe + Beat-State-Machine).
// Schwellen/Timing/Seiten-Logik liegt im Caller (DOM, app.tsx); hier nur testbare Entscheidungen.

export function scrollDepthRatio(scrollY: number, scrollHeight: number, innerHeight: number): number {
  const denom = scrollHeight - innerHeight
  if (denom <= 0) return 1 // nicht scrollbar → gilt als „tief" (Caller nutzt Zeit-Fallback)
  return Math.min(1, Math.max(0, scrollY / denom))
}

export function isScrollable(scrollHeight: number, innerHeight: number): boolean {
  return scrollHeight - innerHeight > 0
}

export interface TeaserSession {
  beatsShown: number
  dismissed: boolean
  engaged: boolean
  completed: boolean
}

/** Welcher Beat als naechstes? null = keiner. */
export function nextBeat(s: TeaserSession): 1 | 2 | null {
  if (s.dismissed || s.engaged || s.completed) return null
  if (s.beatsShown === 0) return 1
  if (s.beatsShown === 1) return 2
  return null
}

export const BEAT_TEXT: Record<1 | 2, string> = {
  1: 'Hi, grüße Sie! 👋',
  2: 'Kein Stress, lassen Sie sich Zeit. 😊 Ich helfe bei Unfall, Gutachten oder Wertgutachten — tippen Sie einfach an.',
}
