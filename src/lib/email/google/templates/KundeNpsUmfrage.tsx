// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'
import { type EmailBrand } from './layout'

// GEO-P2 SP2: Post-Abschluss-NPS-Einladung an den Kunden (Service-Feedback, kein Marketing).
type Props = {
  vorname: string
  claimNummer: string | null
  npsUrl: string
  optOutUrl: string
  brand?: EmailBrand
}

export function subject(_p: Props): string {
  return 'Wie zufrieden waren Sie mit der Abwicklung?'
}

export function KundeNpsUmfrageEmail(props: Props) {
  const anrede = props.vorname ? `Hallo ${props.vorname},` : 'Hallo,'
  const fallRef = props.claimNummer ? ` (Vorgang ${props.claimNummer})` : ''
  return (
    <EmailShell preview="Ihre Meinung zu unserer Schadenabwicklung" dark>
      <Hero
        logoUrl={props.brand?.logoUrl ?? null}
        logoText={props.brand?.firmenname ?? undefined}
        headline={anrede}
      />
      <Card>
        <Paragraph>
          Ihr Schadenfall{fallRef} ist abgeschlossen. Damit wir uns weiter verbessern können:
          Wie zufrieden waren Sie mit der Abwicklung durch uns?
        </Paragraph>
        <Paragraph>
          Die Bewertung dauert weniger als eine Minute — auf einer Skala von 0 bis 10.
        </Paragraph>
        <Button href={props.npsUrl} bg={props.brand?.primary}>Jetzt bewerten</Button>
        <Paragraph>
          Dies ist eine Bitte um <strong>Service-Feedback</strong>, keine Werbung. Wenn Sie
          keine Feedback-Anfragen mehr erhalten möchten,{' '}
          <a href={props.optOutUrl} style={{ color: email.color.ondo }}>hier abmelden</a>.
        </Paragraph>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
