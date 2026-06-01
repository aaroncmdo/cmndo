// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Section, Img, Text } from '@react-email/components'
import { email } from '../tokens'

/** Schlanker Marken-Header für Tier-2/3-Mails (heller Hintergrund, kein Auto-Hero):
 *  zentrierte Wortmarke (oder Brand-Logo) + Gold-Akzent. Tier 1 nutzt stattdessen Hero. */
export function MailHeader({ logoUrl = null, logoText = 'Claimondo' }: { logoUrl?: string | null; logoText?: string }) {
  return (
    <Section style={{ textAlign: 'center' as const, padding: `${email.space(2)} 0 ${email.space(4)}` }}>
      {logoUrl
        ? <Img src={logoUrl} alt={logoText} height={22} style={{ height: 22, width: 'auto', display: 'block', margin: '0 auto' }} />
        : <Text style={{ margin: 0, fontSize: 18, fontWeight: 800, color: email.color.navy }}>{logoText}</Text>}
      <div style={{ height: 3, width: 44, backgroundColor: email.color.gold, borderRadius: 2, margin: `${email.space(3)} auto 0` }} />
    </Section>
  )
}
