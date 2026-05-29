// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Note, Footer } from '../../components'

// KFZ-188: Zahlungsbestaetigung fuer Kanzlei-Monatsabrechnungen

type Props = {
  ansprechpartner: string
  rechnungsnummer: string
  brutto: string
  bezahltAm: string
}

export function subject(p: Props) {
  return `Zahlung eingegangen — Rechnung ${p.rechnungsnummer}`
}

export function KanzleiZahlungBestaetigungEmail(props: Props) {
  return (
    <EmailShell preview={`Zahlung ${props.brutto} eingegangen — ${props.rechnungsnummer}`}>
      <MailHeader />
      <Card>
        <Heading>Zahlung eingegangen — Vielen Dank!</Heading>

        <Paragraph>
          Hallo {props.ansprechpartner},
        </Paragraph>
        <Paragraph>
          Ihre Zahlung für die Rechnung <strong>{props.rechnungsnummer}</strong> ist
          eingegangen. Vielen Dank!
        </Paragraph>

        <InfoRow label="Rechnungsnummer" value={props.rechnungsnummer} />
        <InfoRow label="Bezahlter Betrag (brutto)" value={props.brutto} />
        <InfoRow label="Bezahlt am" value={props.bezahltAm} />

        <Paragraph>
          Diese Bestätigung können Sie als Beleg für Ihre Buchhaltung aufbewahren.
          Bei Rückfragen wenden Sie sich bitte an{' '}
          <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>

        <Note>Mit freundlichen Grüßen, Ihr Claimondo-Team</Note>
      </Card>
      <Footer />
    </EmailShell>
  )
}
