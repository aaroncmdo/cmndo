import { EmailLayout, Heading, Paragraph, Divider } from './layout'

// Reklamation: Frist automatisch abgelaufen — Benachrichtigung an SV

type Props = {
  vorname: string | null
}

export function subject(_p: Props) {
  return 'Reklamation abgelehnt — Frist überschritten'
}

export function ReklamationFristAbgelaufenEmail(props: Props) {
  return (
    <EmailLayout preview="Deine Reklamation wurde automatisch abgelehnt">
      <Heading>Reklamation abgelehnt</Heading>

      <Paragraph>
        Hallo {props.vorname ?? 'Partner'},
      </Paragraph>
      <Paragraph>
        deine Reklamation wurde automatisch abgelehnt, da die 5-Werktage-Frist
        überschritten wurde.
      </Paragraph>

      <Divider />

      <Paragraph>
        Bei Fragen wende dich bitte an <strong>aaron.sprafke@claimondo.de</strong>.
      </Paragraph>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
