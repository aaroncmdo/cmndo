// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt-Onboarding-Aktivierungs-Drip — Mail 1: Willkommen im Werkstatt-Netzwerk.

import { Text } from '@react-email/components'
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../../components'
import { email } from '../../../tokens'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'

type Props = { copy: CopyFor<'willkommen'>; merge: WerkstattMergeVars }

export function subject(copy: CopyFor<'willkommen'>, merge: WerkstattMergeVars): string {
  return `Willkommen bei Claimondo, ${merge.werkstattName}!`
}

export function WillkommenEmail({ copy, merge }: Props) {
  return (
    <EmailShell preview={subject(copy, merge)}>
      <Hero logoUrl={null} headline={copy.headline} />
      <Card>
        <Paragraph>Hallo {merge.werkstattName},</Paragraph>
        {copy.absaetze.map((a, i) => <Paragraph key={i}>{a}</Paragraph>)}

        <Text style={{ color: email.color.navy, fontSize: 13, fontWeight: 700, margin: `${email.space(4)} 0 12px`, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
          So läuft es ab
        </Text>
        {copy.so_laeufts.map((step, i) => (
          <Text key={i} style={{ color: email.color.textBody, fontSize: 14, margin: '6px 0', lineHeight: '20px' }}>
            <span style={{ color: email.color.ondo, fontWeight: 700, marginRight: 10 }}>{i + 1}.</span>{step}
          </Text>
        ))}

        <Button href={merge.portalLink}>{copy.cta_label}</Button>

        <Paragraph>
          Bei Fragen anrufen: {merge.ansprechpartner} ist für Sie da unter{' '}
          <a href={`tel:${merge.tel}`} style={{ color: email.color.ondo }}>{merge.tel}</a>.
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
