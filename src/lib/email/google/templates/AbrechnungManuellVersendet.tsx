import { EmailLayout, Heading, Paragraph, InfoTable, Divider } from './layout'

// Admin-Action: Abrechnung manuell an Empfaenger versendet / Storno-Bestaetigung

type Props = {
  empfaengerVorname: string | null
  abrechnungsNr: string
  betragBrutto: number
  faelligAm?: string | null   // optional — nicht bei Storno
  stornoGrund?: string | null // gesetzt bei Storno-Bestaetigung
  stornoNr?: string | null    // Storno-Rechnungsnummer
  istStorno?: boolean
  wirdErstattet?: boolean
}

export function subject(p: Props) {
  if (p.istStorno) {
    return `Storno: Rechnung ${p.abrechnungsNr} wurde storniert`
  }
  return `Claimondo Abrechnung ${p.abrechnungsNr}`
}

function fmtEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR brutto'
}

export function AbrechnungManuellVersendetEmail(props: Props) {
  if (props.istStorno) {
    return (
      <EmailLayout preview={`Rechnung ${props.abrechnungsNr} wurde storniert`}>
        <Heading>Rechnung storniert</Heading>

        <Paragraph>
          Hallo {props.empfaengerVorname ?? ''},
        </Paragraph>
        <Paragraph>
          die Rechnung <strong>{props.abrechnungsNr}</strong> wurde storniert.
        </Paragraph>

        {props.stornoGrund && (
          <InfoTable rows={[
            ['Rechnungsnummer', props.abrechnungsNr],
            ['Storno-Grund', props.stornoGrund],
            ...(props.stornoNr ? [['Storno-Rechnungsnummer', props.stornoNr]] as [string, string][] : []),
          ]} />
        )}

        <Divider />

        {props.wirdErstattet && (
          <Paragraph>
            Der bereits gezahlte Betrag wird erstattet.
          </Paragraph>
        )}

        <Paragraph>
          Bei Fragen wende dich an <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>

        <Paragraph>Dein Claimondo-Team</Paragraph>
      </EmailLayout>
    )
  }

  return (
    <EmailLayout preview={`Abrechnung ${props.abrechnungsNr} — ${fmtEuro(props.betragBrutto)}`}>
      <Heading>Abrechnung {props.abrechnungsNr}</Heading>

      <Paragraph>
        Hallo {props.empfaengerVorname ?? ''},
      </Paragraph>
      <Paragraph>
        im Anhang bzw. über dein Portal steht deine Abrechnung bereit.
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungsNr],
        ['Betrag (brutto)', fmtEuro(props.betragBrutto)],
        ...(props.faelligAm ? [['Fällig am', props.faelligAm]] as [string, string][] : []),
      ]} />

      <Divider />

      <Paragraph>
        Bei Fragen wende dich an <strong>aaron.sprafke@claimondo.de</strong>.
      </Paragraph>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
