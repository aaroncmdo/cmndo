// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Footer } from '../../components'

// Buero-Onboarding: Willkommens-Mail nach Vertrag-Unterzeichnung durch Buero-Inhaber

type Props = {
  vorname: string | null
  bueroName: string
  portalUrl: string
  initialPassword?: string | null
}

export function subject(p: Props) {
  return `Vertrag unterzeichnet — ${p.bueroName}`
}

export function BueroSubSvEinladungEmail(props: Props) {
  return (
    <EmailShell preview={`Vertrag für ${props.bueroName} unterzeichnet — nächster Schritt: Anzahlung`}>
      <MailHeader />
      <Card>
        <Heading>Vielen Dank für deine Unterschrift!</Heading>

        <Paragraph>
          Hallo {props.vorname ?? 'Partner'},
        </Paragraph>
        <Paragraph>
          vielen Dank für die Unterzeichnung. Im Anhang findest du das Vertragsdokument
          für dein Büro <strong>{props.bueroName}</strong>.
        </Paragraph>

        <Paragraph>
          <strong>Nächster Schritt:</strong> Bitte leiste die zentrale Anzahlung über den
          Stripe-Checkout im Büro-Onboarding. Sobald die Zahlung eingegangen ist, werden
          alle Standorte freigeschaltet.
        </Paragraph>

        {props.initialPassword && (
          <>
            <InfoRow label="Büro" value={props.bueroName} />
            <InfoRow label="Initiales Passwort" value={props.initialPassword} />
          </>
        )}

        <Button href={props.portalUrl}>Zum Büro-Onboarding</Button>

        <Paragraph>Dein Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
