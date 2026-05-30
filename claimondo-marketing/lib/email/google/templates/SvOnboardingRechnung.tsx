// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, Divider, InfoTable, APP_URL } from './layout'

/**
 * AAR-401: Setup-Anzahlungs-Rechnung mit 3 PDF-Anhängen
 * (Rechnung + Kooperationsvertrag + Nutzungsbedingungen).
 *
 * Ersetzt im Stripe-Webhook die bisherige AnzahlungEingegangenEmail.
 */

type Typ = 'solo' | 'buero' | 'akademie'

type Props = {
  vorname: string | null
  typ: Typ
  orgName?: string | null
  rechnungs_nr: string
  rechnungs_datum: string      // "17.04.2026"
  paket?: string | null         // "standard" | "pro" | "premium" | "individuell"
  brutto: string                // "1.785,00 €"
  portalUrl?: string | null
}

export function subject(p: Props) {
  return `Ihre Claimondo-Anzahlungsrechnung ${p.rechnungs_nr}`
}

function anrede(p: Props): string {
  if (p.typ === 'buero' && p.orgName) {
    return `Hallo ${p.vorname ?? 'Inhaber'}, für das Büro ${p.orgName}`
  }
  if (p.typ === 'akademie' && p.orgName) {
    return `Hallo ${p.vorname ?? 'Verwalter'}, für die Akademie ${p.orgName}`
  }
  return `Hallo ${p.vorname ?? 'Partner'}`
}

function paketLabel(p: Props): string {
  if (!p.paket) return '—'
  const map: Record<string, string> = {
    standard: 'Standard',
    pro: 'Pro',
    premium: 'Premium',
    individuell: 'Individuell',
  }
  return map[p.paket] ?? p.paket
}

export function SvOnboardingRechnungEmail(props: Props) {
  const url = props.portalUrl ?? `${APP_URL}/gutachter`
  return (
    <EmailLayout preview={`Anzahlungsrechnung ${props.rechnungs_nr} — Portal freigeschaltet`}>
      <Heading>Ihre Anzahlung ist eingegangen</Heading>

      <Paragraph>{anrede(props)},</Paragraph>

      <Paragraph>
        vielen Dank für Ihre Anzahlung. Anbei finden Sie Ihre steuerlich
        korrekte Rechnung sowie Ihren unterzeichneten Kooperationsvertrag
        und die Nutzungsbedingungen als PDF.
      </Paragraph>

      <InfoTable
        rows={[
          ['Rechnungs-Nr.', props.rechnungs_nr],
          ['Rechnungsdatum', props.rechnungs_datum],
          ['Paket', paketLabel(props)],
          ['Gesamtbetrag (brutto)', props.brutto],
          ['Zahlungsart', 'Bereits bezahlt via Stripe'],
        ]}
      />

      <Paragraph>
        Ihr Gutachter-Portal ist ab sofort freigeschaltet. Sie können
        direkt loslegen und erste Aufträge annehmen.
      </Paragraph>

      <Divider />

      <Paragraph>
        <strong>PDF-Anhänge in dieser E-Mail:</strong>
      </Paragraph>
      <Paragraph>
        1. Rechnung {props.rechnungs_nr}<br />
        2. Kooperationsvertrag (unterzeichnet)<br />
        3. Nutzungsbedingungen
      </Paragraph>

      <Button href={url}>
        {props.typ === 'buero'
          ? 'Zum Büro-Portal'
          : props.typ === 'akademie'
            ? 'Zum Akademie-Portal'
            : 'Zum Gutachter-Portal'}
      </Button>

      <Paragraph>
        Bei Fragen zur Rechnung wenden Sie sich bitte an{' '}
        <a href="mailto:buchhaltung@claimondo.de">buchhaltung@claimondo.de</a>.
      </Paragraph>

      <Paragraph>Ihr Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
