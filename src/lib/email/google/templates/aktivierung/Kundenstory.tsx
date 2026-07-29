// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt-Onboarding-Aktivierungs-Drip — Mail 4: Kundenstory / Referenz-Zitat
// einer anderen Werkstatt.

import { EmailShell, Hero, Card, Paragraph, Button, Callout, Footer } from '../../../components'
import { email } from '../../../tokens'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'

type Props = { copy: CopyFor<'kundenstory'>; merge: WerkstattMergeVars }

export function subject(copy: CopyFor<'kundenstory'>, merge: WerkstattMergeVars): string {
  return `So profitieren andere Werkstätten von Claimondo, ${merge.werkstattName}`
}

export function KundenstoryEmail({ copy, merge }: Props) {
  return (
    <EmailShell preview={subject(copy, merge)}>
      <Hero logoUrl={null} headline={copy.headline} />
      <Card>
        <Paragraph>Hallo {merge.werkstattName},</Paragraph>
        <Paragraph>{copy.intro}</Paragraph>

        <Callout>
          <em>„{copy.zitat}"</em>
        </Callout>

        {copy.schluss.map((s, i) => <Paragraph key={i}>{s}</Paragraph>)}
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
