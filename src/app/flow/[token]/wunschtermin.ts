import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

/**
 * Wandelt einen optionalen Wunschtermin-Wert aus dem WunschterminPicker
 * (Berlin-Wall-Clock "YYYY-MM-DDTHH:MM" oder "") in ein UTC-ISO fuer lead.wunschtermin.
 * Leer/ungueltig -> null (defensiv, wirft nie -> keine 500 in der Server-Action).
 */
export function resolveWunschterminIso(
  wunschterminLokal: string | null | undefined,
): string | null {
  if (!wunschterminLokal || typeof wunschterminLokal !== 'string') return null
  try {
    return berlinWallClockToUtc(wunschterminLokal)
  } catch {
    return null
  }
}
