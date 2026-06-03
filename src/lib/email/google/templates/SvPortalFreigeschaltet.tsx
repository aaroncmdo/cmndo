// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, Button, Footer } from '../../components'
import { APP_URL } from './layout'

// SV-Onboarding: Bestaetigungs-Mail nach Vertrag-Unterzeichnung (Willkommen)

type Props = {
  vorname: string | null
  portalUrl?: string
}

export function subject(_p: Props) {
  return 'Willkommen bei Claimondo — deine Vertragsunterlagen'
}

export function SvPortalFreigeschaltetEmail(props: Props) {
  // AAR-371: Legacy-Pfad /gutachter/onboarding leitet zwar noch per Redirect
  // auf /gutachter/willkommen, aber im Mail-Default direkt auf den aktuellen
  // Flow zeigen — spart einen Redirect und ist semantisch korrekter.
  const url = props.portalUrl ?? `${APP_URL}/gutachter/willkommen`

  return (
    <EmailShell preview="Vertragsunterlagen & nächster Schritt: Anzahlung">
      <MailHeader />
      <Card>
        <Heading>Willkommen bei Claimondo!</Heading>

        <Paragraph>
          Hallo {props.vorname ?? 'Partner'},
        </Paragraph>
        <Paragraph>
          vielen Dank für die Unterzeichnung der Nutzungsbedingungen. Im Anhang findest du
          dein unterschriebenes Vertragsdokument zur Aufbewahrung.
        </Paragraph>
        <Paragraph>
          Dein Portal-Zugang wird freigeschaltet sobald die Anzahlung eingegangen ist.
        </Paragraph>

        <Paragraph>
          <strong>Nächster Schritt:</strong> Bitte leiste die Anzahlung über den
          Stripe-Checkout in deinem Onboarding-Bereich.
        </Paragraph>

        <Button href={url}>Zum Onboarding-Bereich</Button>

        <Paragraph>
          Bei Fragen stehen wir dir jederzeit zur Verfügung.
        </Paragraph>

        <Paragraph>Dein Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
