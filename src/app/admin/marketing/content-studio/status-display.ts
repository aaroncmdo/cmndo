// Anzeige-Mapping fuer den Job-Lifecycle-Status. Labels (frei erlaubt) + semantische
// StatusBadge-Tones (keine rohen Tailwind-Farbklassen -> Status-Registry-Gate n/a).
export const STATUS_LABEL: Record<string, string> = {
  entwurf: 'Entwurf',
  skript_generiert: 'Skript',
  audio_erzeugt: 'Voiceover',
  video_fertig: 'Fertig',
  fehler: 'Fehler',
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const STATUS_TONE: Record<string, BadgeTone> = {
  entwurf: 'neutral',
  skript_generiert: 'info',
  audio_erzeugt: 'info',
  video_fertig: 'success',
  fehler: 'danger',
}
