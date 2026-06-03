// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Note, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL } from './layout'
import { Link } from '@react-email/components'

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
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
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
    <EmailShell preview={`Erinnerung Monatsabrechnung ${props.abrechnungs_nr} fällig ${tageText}`}>
      <MailHeader />
      <Card>
        <Heading>{greeting}</Heading>
        <Paragraph>
          kurze Erinnerung: deine Monatsabrechnung <strong>{props.abrechnungs_nr}</strong> ist <strong>{tageText}</strong> fällig.
          Wir ziehen den Betrag automatisch von deiner hinterlegten Zahlungsmethode ein.
        </Paragraph>

        <Heading>Details</Heading>
        <InfoRow label="Rechnungsnummer" value={props.abrechnungs_nr} />
        <InfoRow label="Fällig am" value={formatDate(props.faellig_am)} />
        <InfoRow label="Endbetrag (brutto)" value={formatEuro(props.summe_brutto)} />

        <Paragraph>
          Bitte stelle sicher dass dein hinterlegtes Zahlungsmittel ausreichend gedeckt ist.
          Bei Rückfragen erreichst du uns unter <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>
        <Note>
          Diese Mail wurde automatisch versendet. Bei einer fehlgeschlagenen Lastschrift erhältst du eine separate Benachrichtigung.
        </Note>
        <Note>
          <Link href={`${APP_URL}/gutachter/abrechnung`} style={{ color: email.color.ondo }}>Zur Abrechnungs-Übersicht im Portal</Link>
        </Note>
      </Card>
      <Footer />
    </EmailShell>
  )
}
