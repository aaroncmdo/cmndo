// 2026-05-14: Kuratierte Brand-Presets für SVs ohne Logo oder mit unkonkretem
// Logo. Werden im Onboarding (LogoUploadStep) + im Branding-Editor als Cards
// angeboten. User klickt eine Preset-Card → Theme wird direkt gespeichert,
// die globale Brand-Transition fadet die Sidebar/Pills auf das neue Set.
//
// Jede Preset definiert: primary, secondary, accent + empfohlene Font-Pair.
// Theme-Generation (primaryHover/Active/Soft, sidebarBg etc.) übernimmt der
// generateTheme()-Pfad aus theme.ts.

import type { FontCategory } from './fonts'

export type BrandPreset = {
  id: string
  label: string
  description: string
  /** Hex der drei Kern-Farben. Hover/Active/Soft werden auto-derived. */
  primary: string
  secondary: string
  accent: string
  /** Empfohlene Font-Pair-ID aus FONT_PAIRS. */
  fontPairId: string
  /** Kategorie nur für Filter-Pills im UI. */
  fontCategory: FontCategory
}

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'classic_anthrazit_gold',
    label: 'Klassisch Anthrazit/Gold',
    description: 'Werkstatt-Klassiker — dunkles Anthrazit mit gelbem Akzent. Wie KARpro.',
    primary: '#1F2937',
    secondary: '#F5C800',
    accent: '#9CA3AF',
    fontPairId: 'racing_4',
    fontCategory: 'racing',
  },
  {
    id: 'werkstatt_blau',
    label: 'Werkstatt-Blau',
    description: 'Tiefblaues Hauptgewerk mit warmem Orange — Premium-Werkstatt-Look.',
    primary: '#1E3A5F',
    secondary: '#FF8A00',
    accent: '#94A3B8',
    fontPairId: 'racing_5',
    fontCategory: 'racing',
  },
  {
    id: 'premium_schwarz_silber',
    label: 'Premium Schwarz/Silber',
    description: 'Schwarz mit Silber-Akzent — exklusiver Sachverständigen-Look.',
    primary: '#0F0F12',
    secondary: '#9CA3AF',
    accent: '#D4D4D8',
    fontPairId: 'racing_2',
    fontCategory: 'racing',
  },
  {
    id: 'sportlich_rot',
    label: 'Sportlich Rot/Schwarz',
    description: 'Kräftiges Rot auf Anthrazit — Motorsport-Energie.',
    primary: '#C41E3A',
    secondary: '#1F2937',
    accent: '#FCA5A5',
    fontPairId: 'racing_5',
    fontCategory: 'racing',
  },
  {
    id: 'industrie_grau_orange',
    label: 'Industrie Grau/Orange',
    description: 'Mittelgrau mit warmem Orange — robust und industriell.',
    primary: '#4A4A4A',
    secondary: '#FF6B35',
    accent: '#D6D3D1',
    fontPairId: 'racing_6',
    fontCategory: 'racing',
  },
  {
    id: 'claimondo_default',
    label: 'Claimondo Klassisch',
    description: 'Navy mit Ondo-Blau — das Standard-Claimondo-Look ohne eigenes Branding.',
    primary: '#0D1B3E',
    secondary: '#4573A2',
    accent: '#7BA3CC',
    fontPairId: 'kanoo_1',
    fontCategory: 'kanoo',
  },
]
