// 2026-05-14: Dynamische Theme-Schemata aus den extrahierten Logo-Farben.
//
// Aaron-Brief: „diese schemata müssen auf die farben des logos angepasst
// werden". Statt 6 fixe KFZ-Themes anzubieten, generieren wir 5 verschiedene
// "Look"-Variationen derselben Logo-Palette — der User klickt einen Style,
// die Logo-Farben werden in das gewählte Stil-Pattern eingesetzt.
//
// Inputs: extrahierte primary (knalligste Farbe), secondary, accent.
// Outputs: 5 BrandPreset-artige Cards mit unterschiedlichen Rollen-Zuweisungen
// der gleichen Hex-Werte. Beim Click wird themeFromLegacy(primary, secondary)
// aufgerufen → komplettes Theme inkl. abgeleiteter sidebarBg/primaryHover/etc.

import type { BrandPreset } from './theme-presets'

type ExtractedColors = {
  primary: string
  secondary: string
  accent: string
}

/**
 * Erzeugt 5 Theme-Variationen aus den Logo-Farben.
 * Jede Variation tauscht die Rollen der 3 Hex-Werte anders — verschiedene
 * "Looks" desselben Brands.
 */
export function generateLogoPresets(colors: ExtractedColors): BrandPreset[] {
  const { primary, secondary, accent } = colors

  return [
    {
      id: 'logo_signature',
      label: 'Signatur-Look',
      description: 'Die knalligste Logo-Farbe als Brand-Primary. Sidebar bekommt dieselbe Farbe sehr dunkel als Tönung.',
      primary,
      secondary,
      accent,
      fontPairId: 'racing_5',
      fontCategory: 'racing',
    },
    {
      id: 'logo_inverted',
      label: 'Invertiert',
      description: 'Sekundärfarbe dominiert — Primärfarbe wird zum lauten Akzent. Für ruhigeren Look.',
      primary: secondary,
      secondary: primary,
      accent,
      fontPairId: 'racing_2',
      fontCategory: 'racing',
    },
    {
      id: 'logo_bold',
      label: 'Bold Statement',
      description: 'Primary als Sidebar + Buttons, knalliger Akzent für CTAs. Maximaler Brand-Impact.',
      primary,
      secondary: accent,
      accent: secondary,
      fontPairId: 'racing_3',
      fontCategory: 'racing',
    },
    {
      id: 'logo_industrial',
      label: 'Industrial',
      description: 'Schmale Schrift, breite Anwendung. Logo-Farben in technischem Werkstatt-Look.',
      primary,
      secondary,
      accent,
      fontPairId: 'racing_4',
      fontCategory: 'racing',
    },
    {
      id: 'logo_subtle',
      label: 'Dezent',
      description: 'Logo-Farben sparsam eingesetzt — runder, freundlicher Lese-Fluss.',
      primary,
      secondary,
      accent,
      fontPairId: 'kanoo_2',
      fontCategory: 'kanoo',
    },
  ]
}
