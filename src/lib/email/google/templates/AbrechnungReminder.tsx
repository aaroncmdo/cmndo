import { EmailLayout, Heading, Paragraph, InfoTable, Divider, APP_URL } from './layout'
import { Text } from '@react-email/components'

// KFZ-149 Hund-D: Erinnerungs-Mail an SVs deren Monatsabrechnung in den
// naechsten 3 Tagen faellig wird. Der eigentliche Lastschrift-Einzug laeuft
// im separaten abrechnung-einzug Cron sobald faellig_am erreicht ist.

type Props = {
  vorname: string | null
  nachname: string | null
  abrechnungs_nr: string
  summe_brutto: number
  faellig_am: string  // 'YYYY-MM-DD'
  tage_bis_faellig: number
}

export function subject(p: Props) {
  return `Erinnerung: Monatsabrechnung ${p.abrechnungs_nr} fällig am ${formatDate(p.faellig_am)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

export function AbrechnungReminderEmail(props: Props) {
  const greeting = props.vorname ? `Hallo ${props.vorname},` : 'Hallo,'
  const tageText = props.tage_bis_faellig <= 0
    ? 'heute'
    : props.tage_bis_faellig === 1
    ? 'morgen'
    : `in ${props.tage_bis_faellig} Tagen`

  return (
    <EmailLayout preview={`Erinnerung Monatsabrechnung ${props.abrechnungs_nr} fällig ${tageText}`}>
      <Heading>{greeting}</Heading>
      <Paragraph>
        kurze Erinnerung: deine Monatsabrechnung <strong>{props.abrechnungs_nr}</strong> ist <strong>{tageText}</strong> fällig.
        Wir ziehen den Betrag automatisch von deiner hinterlegten Zahlungsmethode ein.
      </Paragraph>

      <Divider />
      <Heading>Details</Heading>
      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungs_nr],
        ['Fällig am', formatDate(props.faellig_am)],
        ['Endbetrag (brutto)', formatEuro(props.summe_brutto)],
      ]} />

      <Divider />
      <Paragraph>
        Bitte stelle sicher dass dein hinterlegtes Zahlungsmittel ausreichend gedeckt ist.
        Bei Rückfragen erreichst du uns unter <strong>aaron.sprafke@claimondo.de</strong>.
      </Paragraph>
      <Text style={{ color: '#6b7280', fontSize: 12, margin: '16px 0 0', fontStyle: 'italic' }}>
        Diese Mail wurde automatisch versendet. Bei einer fehlgeschlagenen Lastschrift erhältst du eine separate Benachrichtigung.
      </Text>
      <Text style={{ color: '#6b7280', fontSize: 11, margin: '8px 0 0' }}>
        <a href={`${APP_URL}/gutachter/abrechnung`} style={{ color: '#4573A2' }}>Zur Abrechnungs-Übersicht im Portal</a>
      </Text>
    </EmailLayout>
  )
}
