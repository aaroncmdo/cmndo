// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { Section, Img, Text } from '@react-email/components'
import type { ReactNode } from 'react'
import { email } from '../tokens'

export function Hero({
  logoUrl, headline, subline, children,
}: { logoUrl: string | null; headline: string; subline?: string; children?: ReactNode }) {
  return (
    <Section style={{ padding: `${email.space(2)} ${email.space(2)} ${email.space(4)}`, textAlign: 'center' as const }}>
      <span style={{ display: 'inline-block', backgroundColor: email.color.white, borderRadius: email.radius.pill, padding: '9px 16px' }}>
        {logoUrl
          ? <Img src={logoUrl} alt="Claimondo" height={20} style={{ height: 20, width: 'auto', display: 'block' }} />
          : <Text style={{ margin: 0, fontSize: 17, fontWeight: 800, color: email.color.navy }}>Claimondo</Text>}
      </span>
      <div style={{ height: 3, width: 52, backgroundColor: email.color.gold, borderRadius: 2, margin: `${email.space(4)} auto ${email.space(3)}` }} />
      <Text style={{ color: email.color.white, margin: 0, ...email.font.h1, textShadow: '0 2px 14px rgba(0,0,0,.45)' }}>{headline}</Text>
      {subline && <Text style={{ color: '#eaf1f8', margin: `${email.space(2)} auto 0`, maxWidth: 380, ...email.font.body, textShadow: '0 1px 10px rgba(0,0,0,.5)' }}>{subline}</Text>}
      {children}
    </Section>
  )
}
