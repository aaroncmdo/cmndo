// AAR-419: Status-Farb-Anker für generateStatus().
// Die Hues dieser Anker bleiben semantisch (grün/gelb/rot/blau) — nur
// Saturation wird an die Primary-Farbe des Themes harmonisiert.
//
// Ziel: Ein gedämpftes Pastell-Logo bekommt nicht plötzlich knallige
// Status-Tags, und ein neonfarbenes Logo keine stumpfen.

export const STATUS_COLOR_ANCHORS = {
  success: '#10B981', // Emerald 500
  warning: '#F59E0B', // Amber 500
  danger: '#EF4444',  // Red 500
  info: '#3B82F6',    // Blue 500
} as const

export type StatusColorKey = keyof typeof STATUS_COLOR_ANCHORS
