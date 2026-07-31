// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt-Onboarding-Aktivierungs-Drip — Mail 2: Nutzen von Claimondo (4 Bloecke).

import { Text } from '@react-email/components'
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../../components'
import { email } from '../../../tokens'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'

type Props = { copy: CopyFor<'nutzen'>; merge: WerkstattMergeVars }

export function subject(copy: CopyFor<'nutzen'>, merge: WerkstattMergeVars): string {
  return `Das bringt dir Claimondo, ${merge.werkstattName}`
}

export function NutzenEmail({ copy, merge }: Props) {
  return (
    <EmailShell preview={subject(copy, merge)}>
      <Hero logoUrl={null} headline={copy.headline} />
      <Card>
        <Paragraph>Hallo {merge.werkstattName},</Paragraph>

        {copy.bloecke.map((b, i) => (
          <div key={i} style={{ margin: `${email.space(3)} 0` }}>
            <Text style={{ color: email.color.navy, fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{b.titel}</Text>
            <Paragraph>{b.text}</Paragraph>
          </div>
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
