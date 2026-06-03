// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Note, Footer } from '../../components'

// KFZ-188: Kanzlei-Monatsabrechnung mit Magic-Link zur Online-Zahlung

type Props = {
  ansprechpartner: string
  rechnungsnummer: string
  monat: string           // z.B. "März 2026"
  anzahl: number
  nettoGesamt: string     // "3.000,00 €"
  mwstBetrag: string      // "570,00 €"
  brutto: string          // "3.570,00 €"
  faelligAm: string       // "24.04.2026"
  magicLinkUrl: string
  magicLinkExpiresAm: string
}

export function subject(p: Props) {
  return `Sammelrechnung Vollmachts-Provisionen ${p.monat} — Claimondo`
}

export function KanzleiMagicLinkAbrechnungEmail(props: Props) {
  return (
    <EmailShell preview={`Rechnung ${props.rechnungsnummer} — ${props.brutto} — fällig am ${props.faelligAm}`}>
      <MailHeader />
      <Card>
        <Heading>Monatsabrechnung {props.monat}</Heading>

        <Paragraph>
          Hallo {props.ansprechpartner},
        </Paragraph>
        <Paragraph>
          anbei Ihre Sammelrechnung für Vollmachts-Provisionen im Monat <strong>{props.monat}</strong>.
          Bitte begleichen Sie den ausstehenden Betrag bis zum <strong>{props.faelligAm}</strong> über
          den untenstehenden Zahlungslink.
        </Paragraph>

        <InfoRow label="Rechnungsnummer" value={props.rechnungsnummer} />
        <InfoRow label="Leistungszeitraum" value={props.monat} />
        <InfoRow label="Anzahl Vollmachten" value={String(props.anzahl)} />
        <InfoRow label="Nettobetrag" value={props.nettoGesamt} />
        <InfoRow label="MwSt. (19 %)" value={props.mwstBetrag} />
        <InfoRow label="Bruttobetrag" value={props.brutto} />
        <InfoRow label="Fällig am" value={props.faelligAm} />

        <Button href={props.magicLinkUrl}>Jetzt online bezahlen</Button>

        <Paragraph>
          <strong>Hinweis zum Anhang:</strong> Die vollständige Rechnung mit allen Positionen finden
          Sie als PDF im Anhang dieser E-Mail.
        </Paragraph>

        <Note>
          Der Zahlungslink ist gültig bis zum {props.magicLinkExpiresAm}. Nach Ablauf dieser Frist
          wenden Sie sich bitte an aaron.sprafke@claimondo.de.
        </Note>

        <Paragraph>Mit freundlichen Grüßen, Ihr Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
