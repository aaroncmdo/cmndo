import { EmailLayout, Heading, Paragraph, InfoTable, Divider } from './layout'

// Buero-Verwalter Benachrichtigung ueber Sub-SV Sammelabrechnung

type Props = {
  verwalterVorname: string | null
  bueroName: string
  svName: string
  abrechnungsNr: string
  betragBrutto: number
  faelligAm: string     // lokalisiertes Datum
  anzahlPositionen?: number
  anzahlSubSvs?: number
  orgTyp?: 'buero' | 'akademie'
}

export function subject(p: Props) {
  const label = p.orgTyp === 'akademie' ? 'Akademie' : 'Büro'
  return `Claimondo Sammelabrechnung — ${p.abrechnungsNr} (${label} ${p.bueroName})`
}

function fmtEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR brutto'
}

export function BueroVerwalterAbrechnungInfoEmail(props: Props) {
  const isAkademie = props.orgTyp === 'akademie'
  const label = isAkademie ? 'Akademie' : 'Büro'

  return (
    <EmailLayout preview={`Sammelabrechnung ${props.abrechnungsNr} — ${props.bueroName}`}>
      <Heading>Sammelabrechnung {label} {props.bueroName}</Heading>

      <Paragraph>
        Hallo {props.verwalterVorname ?? props.svName},
      </Paragraph>
      <Paragraph>
        die Sammelabrechnung für {isAkademie ? 'deine Akademie' : 'dein Büro'}{' '}
        <strong>{props.bueroName}</strong> ist erstellt.
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungsNr],
        ...(props.anzahlPositionen != null && props.anzahlSubSvs != null
          ? [['Positionen', `${props.anzahlPositionen} (über ${props.anzahlSubSvs} Sub-SVs)`]] as [string, string][]
          : []),
        ['Endbetrag', fmtEuro(props.betragBrutto)],
        ['Fällig am', props.faelligAm],
      ]} />

      <Divider />

      <Paragraph>
        Der Betrag wird am <strong>{props.faelligAm}</strong> automatisch von der
        hinterlegten {isAkademie ? 'Akademie' : 'Büro'}-Zahlungsmethode eingezogen.
      </Paragraph>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
