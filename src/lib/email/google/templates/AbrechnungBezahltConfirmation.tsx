// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Note, Footer } from '../../components'
import { APP_URL } from './layout'
import { Link } from '@react-email/components'

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
    <EmailShell preview={`Zahlung ${fmtEuro(props.summe_brutto)} eingegangen — ${props.abrechnungs_nr}`}>
      <MailHeader />
      <Card>
        <Heading>{greeting}</Heading>
        <Paragraph>
          deine Zahlung für die Monatsabrechnung <strong>{props.abrechnungs_nr}</strong> ist eingegangen.
          Vielen Dank!
        </Paragraph>

        <Heading>Details</Heading>
        <InfoRow label="Rechnungsnummer" value={props.abrechnungs_nr} />
        <InfoRow label="Betrag" value={fmtEuro(props.summe_brutto)} />
        <InfoRow label="Bezahlt am" value={fmtDate(props.bezahlt_am)} />
        {props.stripe_payment_intent_id ? (
          <InfoRow label="Zahlungs-Referenz" value={props.stripe_payment_intent_id} />
        ) : null}

        <Paragraph>
          Du kannst diese Bestätigung als Beleg für deine Buchhaltung aufbewahren.
          Die offizielle Rechnung mit allen Positionen findest du jederzeit in deinem Portal.
        </Paragraph>
        {props.manuell && (
          <Note>(Diese Zahlung wurde via manuellem Retry vom Claimondo-Team angestossen.)</Note>
        )}
        <Note>
          <Link href={`${APP_URL}/gutachter/abrechnung`} style={{ color: '#4573A2' }}>Zur Abrechnungs-Übersicht im Portal</Link>
        </Note>
      </Card>
      <Footer />
    </EmailShell>
  )
}
