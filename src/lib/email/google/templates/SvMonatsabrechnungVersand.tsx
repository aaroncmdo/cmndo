import { EmailLayout, Heading, Paragraph, InfoTable, Divider } from './layout'

// SV Monatsabrechnung erstellt + versendet

type Props = {
  vorname: string | null
  abrechnungsNr: string
  monat: string          // z.B. "04/2026"
  betragBrutto: number
  faelligAm: string      // lokalisiertes Datum, z.B. "14.5.2026"
}

export function subject(p: Props) {
  return `Claimondo Monatsabrechnung ${p.monat} — ${p.abrechnungsNr}`
}

function fmtEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR'
}

export function SvMonatsabrechnungVersandEmail(props: Props) {
  return (
    <EmailLayout preview={`Monatsabrechnung ${props.monat} — ${props.abrechnungsNr}`}>
      <Heading>Monatsabrechnung {props.monat}</Heading>

      <Paragraph>
        Hallo {props.vorname ?? 'Partner'},
      </Paragraph>
      <Paragraph>
        deine Monatsabrechnung für {props.monat} ist erstellt.
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungsNr],
        ['Endbetrag (brutto)', fmtEuro(props.betragBrutto)],
        ['Fällig am', props.faelligAm],
      ]} />

      <Divider />

      <Paragraph>
        Der Betrag wird am <strong>{props.faelligAm}</strong> automatisch von deinem
        hinterlegten Zahlungsmittel eingezogen.
      </Paragraph>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
