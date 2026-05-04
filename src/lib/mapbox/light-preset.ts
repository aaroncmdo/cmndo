// Uhrzeitabhängige Mapbox-Standard-Style Light-Presets.
//
// Mapbox Standard-Style hat 4 vordefinierte Beleuchtungs-Presets:
//   • dawn  — Morgendämmerung (warmes Orange, lange Schatten)
//   • day   — Tag (hell, klarer Kontrast)
//   • dusk  — Abenddämmerung (warmes Rot/Lila)
//   • night — Nacht (dunkler Hintergrund, Lichter beleuchtet)
//
// Wir wählen das Preset basierend auf der lokalen Stunde des Nutzers.
// Grobe Saisonalität wird ignoriert — die Mapbox-Presets sind selbst
// stilistisch genug abstrahiert, dass der Übergang sanft wirkt.

export type MapboxLightPreset = 'dawn' | 'day' | 'dusk' | 'night'

/**
 * Mapped local hour (0-23) auf den passenden Light-Preset.
 *   05:00–06:59 → dawn
 *   07:00–17:59 → day
 *   18:00–20:59 → dusk
 *   21:00–04:59 → night
 *
 * Optional `at` für deterministisches Testen.
 */
export function getMapboxLightPreset(at: Date = new Date()): MapboxLightPreset {
  const h = at.getHours()
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 18) return 'day'
  if (h >= 18 && h < 21) return 'dusk'
  return 'night'
}
