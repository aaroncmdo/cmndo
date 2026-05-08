import { EmailLayout, Heading, Paragraph, InfoTable, Divider, APP_URL } from './layout'
import { Text } from '@react-email/components'

// KFZ-149 Hund-D Follow-up: Bestaetigungs-Mail nach erfolgreichem Lastschrift-
// Einzug einer SV-Monatsabrechnung. Wird vom abrechnung-einzug Cron + von der
// retryEinzug Server Action im success-Branch versendet.

type Props = {
  vorname: string | null
  abrechnungs_nr: string
  summe_brutto: number
  bezahlt_am: string  // ISO timestamp
  stripe_payment_intent_id?: string | null
  manuell?: boolean   // true wenn von retryEinzug ausgeloest
}

export function subject(p: Props) {
  return `Zahlung eingegangen — Monatsabrechnung ${p.abrechnungs_nr}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

export function AbrechnungBezahltConfirmationEmail(props: Props) {
  const greeting = props.vorname ? `Hallo ${props.vorname},` : 'Hallo,'

  return (
    <EmailLayout preview={`Zahlung ${fmtEuro(props.summe_brutto)} eingegangen — ${props.abrechnungs_nr}`}>
      <Heading>{greeting}</Heading>
      <Paragraph>
        deine Zahlung für die Monatsabrechnung <strong>{props.abrechnungs_nr}</strong> ist eingegangen.
        Vielen Dank!
      </Paragraph>

      <Divider />
      <Heading>Details</Heading>
      <InfoTable rows={[
        ['Rechnungsnummer', props.abrechnungs_nr],
        ['Betrag', fmtEuro(props.summe_brutto)],
        ['Bezahlt am', fmtDate(props.bezahlt_am)],
        ...(props.stripe_payment_intent_id ? [['Zahlungs-Referenz', props.stripe_payment_intent_id]] as [string, string][] : []),
      ]} />

      <Divider />
      <Paragraph>
        Du kannst diese Bestätigung als Beleg für deine Buchhaltung aufbewahren.
        Die offizielle Rechnung mit allen Positionen findest du jederzeit in deinem Portal.
      </Paragraph>
      {props.manuell && (
        <Text style={{ color: '#6b7280', fontSize: 12, margin: '8px 0', fontStyle: 'italic' }}>
          (Diese Zahlung wurde via manuellem Retry vom Claimondo-Team angestossen.)
        </Text>
      )}
      <Text style={{ color: '#6b7280', fontSize: 11, margin: '16px 0 0' }}>
        <a href={`${APP_URL}/gutachter/abrechnung`} style={{ color: '#4573A2' }}>Zur Abrechnungs-Übersicht im Portal</a>
      </Text>
    </EmailLayout>
  )
}
