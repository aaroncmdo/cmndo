// Token-Audit-Skip: Email-Tokens für react-email/Resend (rendern ohne Tailwind/CSS-Vars).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

/** Eine Quelle für alle Email-Styles. Keine Ad-hoc-Hexes/Größen in Templates. */
export const email = {
  color: {
    navy: '#0D1B3E',
    shield: '#1E3A5F',
    ondo: '#4573A2',
    lightBlue: '#7BA3CC',
    gold: '#C9A84C',
    goldOnLight: '#B68A2E',
    cream: '#F5F1E8',
    creamBorder: '#ece5d6',
    surface: '#f8f9fb',
    border: '#eef0f4',
    textBody: '#374151',
    textMuted: '#6b7280',
    success: '#1E7A46',
    footerDark: '#0a1429',
    /** Footer-/Sekundaertext auf dunklem Grund (Tier-1-onDark + Dark-Mode). */
    footerOnDark: '#8aa0bd',
    white: '#ffffff',
  },
  /** Spacing-Skala: step * 4px. space(4) => '16px'. */
  space: (step: number): string => `${step * 4}px`,
  radius: { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 } as const,
  font: {
    stack: "Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontSize: 28, fontWeight: 800, lineHeight: '1.12', letterSpacing: '-0.6px' },
    h2: { fontSize: 20, fontWeight: 700, lineHeight: '28px' },
    label: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1.2px' },
    body: { fontSize: 14, lineHeight: '22px' },
  },
  maxWidth: 600,
} as const
