// AAR-939 · Monika-A-Flow · PURE: Typing-Indicator-Dauer ~ Textlaenge, geclamped.
// Nicolas-UX (N4): deutlich laenger als zuvor (war 35ms/Zeichen, clamp 500-1200) —
// Monika tippt jetzt spuerbar, bevor die Antwort kommt (~1,2-2,8s).
export function typingDurationMs(text: string): number {
  return Math.min(2800, Math.max(1200, text.length * 55))
}
