// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, InfoTable, Button, APP_URL } from './layout'

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
    <EmailLayout preview={`Abrechnung ${props.abrechnungsNr} — ${props.summeBrutto}`}>
      <Heading>Monatsabrechnung {props.monat}</Heading>
      <Paragraph>
        Sehr geehrte Damen und Herren von {props.kanzleiName}, anbei die Abrechnung
        für {props.monat}. Der Gesamtbetrag von {props.summeBrutto} ist bis zum{' '}
        {props.faelligAm} zahlbar auf das im PDF angegebene Konto.
      </Paragraph>

      <InfoTable rows={[
        ['Abrechnungs-Nr', props.abrechnungsNr],
        ['Zeitraum', props.monat],
        ['Abgeschlossene Fälle', String(props.anzahlFaelle)],
        ['Gesamtbetrag (brutto)', props.summeBrutto],
        ['Zahlbar bis', props.faelligAm],
      ]} />

      <Paragraph>
        Die detaillierte Aufstellung mit allen Positionen finden Sie im angehängten PDF.
        Die Abrechnung ist auch im Portal abrufbar.
      </Paragraph>

      <Button href={`${APP_URL}/admin/finance`}>Zum Portal</Button>
    </EmailLayout>
  )
}
