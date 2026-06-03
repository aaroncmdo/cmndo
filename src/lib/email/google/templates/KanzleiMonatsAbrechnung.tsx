// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Footer } from '../../components'
import { APP_URL } from './layout'

type Props = {
  kanzleiName: string
  abrechnungsNr: string
  monat: string
  anzahlFaelle: number
  summeBrutto: string
  faelligAm: string
}

export function subject(p: Props) {
  return `Monatsabrechnung ${p.abrechnungsNr} — ${p.monat}`
}

export function KanzleiMonatsAbrechnungEmail(props: Props) {
  return (
    <EmailShell preview={`Abrechnung ${props.abrechnungsNr} — ${props.summeBrutto}`}>
      <MailHeader />
      <Card>
        <Heading>Monatsabrechnung {props.monat}</Heading>
        <Paragraph>
          Sehr geehrte Damen und Herren von {props.kanzleiName}, anbei die Abrechnung
          für {props.monat}. Der Gesamtbetrag von {props.summeBrutto} ist bis zum{' '}
          {props.faelligAm} zahlbar auf das im PDF angegebene Konto.
        </Paragraph>

        <InfoRow label="Abrechnungs-Nr" value={props.abrechnungsNr} />
        <InfoRow label="Zeitraum" value={props.monat} />
        <InfoRow label="Abgeschlossene Fälle" value={String(props.anzahlFaelle)} />
        <InfoRow label="Gesamtbetrag (brutto)" value={props.summeBrutto} />
        <InfoRow label="Zahlbar bis" value={props.faelligAm} />

        <Paragraph>
          Die detaillierte Aufstellung mit allen Positionen finden Sie im angehängten PDF.
          Die Abrechnung ist auch im Portal abrufbar.
        </Paragraph>

        <Button href={`${APP_URL}/admin/finance`}>Zum Portal</Button>
      </Card>
      <Footer />
    </EmailShell>
  )
}
