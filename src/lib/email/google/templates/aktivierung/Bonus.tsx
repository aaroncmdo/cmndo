// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt-Onboarding-Aktivierungs-Drip — Mail 5: Aktivierungs-Bonus.

import { EmailShell, Hero, Card, Paragraph, Button, Note, Footer } from '../../../components'
import { email } from '../../../tokens'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'

type Props = { copy: CopyFor<'bonus'>; merge: WerkstattMergeVars }

export function subject(copy: CopyFor<'bonus'>, merge: WerkstattMergeVars): string {
  return `Dein Bonus wartet, ${merge.werkstattName}`
}

export function BonusEmail({ copy, merge }: Props) {
  return (
    <EmailShell preview={subject(copy, merge)}>
      <Hero logoUrl={null} headline={copy.headline} />
      <Card>
        <Paragraph>Hallo {merge.werkstattName},</Paragraph>
        {copy.absaetze.map((a, i) => <Paragraph key={i}>{a}</Paragraph>)}

        <Button href={merge.portalLink}>{copy.cta_label}</Button>

        <Paragraph>
          Fragen? {merge.ansprechpartner} hilft dir gerne weiter unter{' '}
          <a href={`tel:${merge.tel}`} style={{ color: email.color.ondo }}>{merge.tel}</a>.
        </Paragraph>

        <Note>{copy.fussnote}</Note>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
