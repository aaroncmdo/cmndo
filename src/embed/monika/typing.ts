// AAR-939 · Monika-A-Flow · PURE: Typing-Indicator-Dauer ~ Textlaenge, geclamped.
export function typingDurationMs(text: string): number {
  return Math.min(1200, Math.max(500, text.length * 35))
}
