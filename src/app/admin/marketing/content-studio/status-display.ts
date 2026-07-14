// Anzeige-Mapping fuer den Job-Lifecycle-Status. Labels (frei erlaubt) + semantische
// StatusBadge-Tones (keine rohen Tailwind-Farbklassen -> Status-Registry-Gate n/a).
export const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Wird erstellt',
  skript_generiert: 'Review nötig',
  audio_erzeugt: 'Wird gerendert',
  video_fertig: 'Fertig',
  fehler: 'Fehler',
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const STATUS_TONE: Record<string, BadgeTone> = {
  entwurf: 'neutral',
  skript_generiert: 'warning', // Review nötig -> hebt sich als To-do ab
  audio_erzeugt: 'info',
  video_fertig: 'success',
  fehler: 'danger',
}
