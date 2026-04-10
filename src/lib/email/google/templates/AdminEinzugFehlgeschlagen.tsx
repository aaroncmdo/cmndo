import { EmailLayout, Heading, Paragraph, InfoTable, Button, Divider, APP_URL } from './layout'

// Admin-Alert: Lastschrift-Einzug fehlgeschlagen

type Props = {
  abrechnungsNr: string
  empfaengerName: string | null
  betragBrutto: number
  fehlerGrund: string
}

export function subject(p: Props) {
  return `[Claimondo] Lastschrift-Einzug fehlgeschlagen: ${p.abrechnungsNr}`
}

function fmtEuro(n: number): string {
  return n.toFixed(2) + ' EUR'
}

export function AdminEinzugFehlgeschlagenEmail(props: Props) {
  return (
    <EmailLayout preview={`Einzug fehlgeschlagen: ${props.abrechnungsNr}`}>
      <Heading>Lastschrift-Einzug fehlgeschlagen</Heading>

      <Paragraph>
        Hallo Aaron,
      </Paragraph>
      <Paragraph>
        der automatische Lastschrift-Einzug für eine SV-Monatsabrechnung ist fehlgeschlagen:
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungsNr],
        ['Empfänger', props.empfaengerName ?? '—'],
        ['Betrag', fmtEuro(props.betragBrutto)],
        ['Fehler', props.fehlerGrund],
      ]} />

      <Divider />

      <Button href={`${APP_URL}/admin/abrechnungen`}>
        Zum Admin-Panel: Abrechnungen
      </Button>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
