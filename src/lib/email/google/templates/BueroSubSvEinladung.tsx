import { EmailLayout, Heading, Paragraph, InfoTable, Button, Divider } from './layout'

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
    <EmailLayout preview={`Vertrag für ${props.bueroName} unterzeichnet — nächster Schritt: Anzahlung`}>
      <Heading>Vielen Dank für deine Unterschrift!</Heading>

      <Paragraph>
        Hallo {props.vorname ?? 'Partner'},
      </Paragraph>
      <Paragraph>
        vielen Dank für die Unterzeichnung. Im Anhang findest du das Vertragsdokument
        für dein Büro <strong>{props.bueroName}</strong>.
      </Paragraph>

      <Divider />

      <Paragraph>
        <strong>Nächster Schritt:</strong> Bitte leiste die zentrale Anzahlung über den
        Stripe-Checkout im Büro-Onboarding. Sobald die Zahlung eingegangen ist, werden
        alle Standorte freigeschaltet.
      </Paragraph>

      {props.initialPassword && (
        <InfoTable rows={[
          ['Büro', props.bueroName],
          ['Initiales Passwort', props.initialPassword],
        ]} />
      )}

      <Button href={props.portalUrl}>Zum Büro-Onboarding</Button>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
