// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Footer } from '../../components'

// Admin-Action: Abrechnung manuell an Empfaenger versendet / Storno-Bestaetigung.
// B2B-intern (Empfaenger duzen) → Tier-2-Light (MailHeader + Card, kein Hero/Whitelabel).

type Props = {
  empfaengerVorname: string | null
  abrechnungsNr: string
  betragBrutto: number
  faelligAm?: string | null   // optional — nicht bei Storno
  stornoGrund?: string | null // gesetzt bei Storno-Bestaetigung
  stornoNr?: string | null    // Storno-Rechnungsnummer
  istStorno?: boolean
  wirdErstattet?: boolean
}

export function subject(p: Props) {
  if (p.istStorno) {
    return `Storno: Rechnung ${p.abrechnungsNr} wurde storniert`
  }
  return `Claimondo Abrechnung ${p.abrechnungsNr}`
}

function fmtEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' EUR brutto'
}

export function AbrechnungManuellVersendetEmail(props: Props) {
  if (props.istStorno) {
    return (
      <EmailShell preview={`Rechnung ${props.abrechnungsNr} wurde storniert`}>
        <MailHeader />
        <Card>
          <Heading>Rechnung storniert</Heading>
          <Paragraph>Hallo {props.empfaengerVorname ?? ''},</Paragraph>
          <Paragraph>
            die Rechnung <strong>{props.abrechnungsNr}</strong> wurde storniert.
          </Paragraph>

          {props.stornoGrund && (
            <>
              <InfoRow label="Rechnungsnummer" value={props.abrechnungsNr} />
              <InfoRow label="Storno-Grund" value={props.stornoGrund} />
              {props.stornoNr ? <InfoRow label="Storno-Rechnungsnummer" value={props.stornoNr} /> : null}
            </>
          )}

          {props.wirdErstattet && (
            <Paragraph>Der bereits gezahlte Betrag wird erstattet.</Paragraph>
          )}

          <Paragraph>
            Bei Fragen wende dich an <strong>aaron.sprafke@claimondo.de</strong>.
          </Paragraph>
          <Paragraph>Dein Claimondo-Team</Paragraph>
        </Card>
        <Footer />
      </EmailShell>
    )
  }

  return (
    <EmailShell preview={`Abrechnung ${props.abrechnungsNr} — ${fmtEuro(props.betragBrutto)}`}>
      <MailHeader />
      <Card>
        <Heading>Abrechnung {props.abrechnungsNr}</Heading>
        <Paragraph>Hallo {props.empfaengerVorname ?? ''},</Paragraph>
        <Paragraph>im Anhang bzw. über dein Portal steht deine Abrechnung bereit.</Paragraph>

        <InfoRow label="Rechnungsnummer" value={props.abrechnungsNr} />
        <InfoRow label="Betrag (brutto)" value={fmtEuro(props.betragBrutto)} />
        {props.faelligAm ? <InfoRow label="Fällig am" value={props.faelligAm} /> : null}

        <Paragraph>
          Bei Fragen wende dich an <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>
        <Paragraph>Dein Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
