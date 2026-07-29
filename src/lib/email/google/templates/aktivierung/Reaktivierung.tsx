// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt-Onboarding-Aktivierungs-Drip — Mail 6: Reaktivierung inaktiver Werkstaetten.

import { Text } from '@react-email/components'
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../../components'
import { email } from '../../../tokens'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'

type Props = { copy: CopyFor<'reaktivierung'>; merge: WerkstattMergeVars }

export function subject(copy: CopyFor<'reaktivierung'>, merge: WerkstattMergeVars): string {
  return `Noch dabei, ${merge.werkstattName}?`
}

export function ReaktivierungEmail({ copy, merge }: Props) {
  return (
    <EmailShell preview={subject(copy, merge)}>
      <Hero logoUrl={null} headline={copy.headline} />
      <Card>
        <Paragraph>Hallo {merge.werkstattName},</Paragraph>
        <Paragraph>{copy.intro}</Paragraph>

        {copy.punkte.map((p, i) => (
          <Text key={i} style={{ color: email.color.textBody, fontSize: 14, margin: '6px 0', lineHeight: '20px' }}>
            <span style={{ color: email.color.ondo, fontWeight: 700, marginRight: 10 }}>{i + 1}.</span>{p}
          </Text>
        ))}

        <Paragraph>{copy.schluss}</Paragraph>
        <Button href={merge.portalLink}>{copy.cta_label}</Button>

        <Paragraph>
          Fragen? {merge.ansprechpartner} hilft dir gerne weiter unter{' '}
          <a href={`tel:${merge.tel}`} style={{ color: email.color.ondo }}>{merge.tel}</a>.
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
