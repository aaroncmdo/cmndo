// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Footer } from '../../components'

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
    <EmailShell preview={`Monatsabrechnung ${props.monat} — ${props.abrechnungsNr}`}>
      <MailHeader />
      <Card>
        <Heading>Monatsabrechnung {props.monat}</Heading>

        <Paragraph>
          Hallo {props.vorname ?? 'Partner'},
        </Paragraph>
        <Paragraph>
          deine Monatsabrechnung für {props.monat} ist erstellt.
        </Paragraph>

        <InfoRow label="Rechnungsnummer" value={props.abrechnungsNr} />
        <InfoRow label="Endbetrag (brutto)" value={fmtEuro(props.betragBrutto)} />
        <InfoRow label="Fällig am" value={props.faelligAm} />

        <Paragraph>
          Der Betrag wird am <strong>{props.faelligAm}</strong> automatisch von deinem
          hinterlegten Zahlungsmittel eingezogen.
        </Paragraph>

        <Paragraph>Dein Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
