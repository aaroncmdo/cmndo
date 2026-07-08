// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Footer } from '../../components'

type Props = {
  empfaengerName: string
  gutschriftNr: string
  betrag: string
  datum: string
  /** true → Storno-Gutschrift (Korrekturbeleg): eigene Betreffzeile + Rückbuchungs-Text statt Auszahlungs-Hinweis. */
  storno?: boolean
}

export function subject(p: Props) {
  return p.storno ? `Storno-Gutschrift ${p.gutschriftNr}` : `Ihre Gutschrift ${p.gutschriftNr}`
}

export function PartnerGutschriftEmail(props: Props) {
  const titel = props.storno ? 'Storno-Gutschrift' : 'Gutschrift'
  return (
    <EmailShell preview={`${titel} ${props.gutschriftNr} — ${props.betrag}`}>
      <MailHeader />
      <Card>
        <Heading>{props.storno ? 'Storno-Gutschrift' : 'Ihre Gutschrift'}</Heading>
        {props.storno ? (
          <Paragraph>
            Hallo {props.empfaengerName}, anbei die Storno-Gutschrift {props.gutschriftNr} über{' '}
            {props.betrag}. Sie storniert eine zuvor erteilte Gutschrift — der ausgewiesene Betrag
            wird entsprechend zurückgebucht bzw. mit künftigen Auszahlungen verrechnet.
          </Paragraph>
        ) : (
          <Paragraph>
            Hallo {props.empfaengerName}, anbei Ihre Gutschrift {props.gutschriftNr} über{' '}
            {props.betrag}. Die Auszahlung erfolgt auf das bei uns hinterlegte Konto.
          </Paragraph>
        )}

        <InfoRow label={props.storno ? 'Storno-Gutschrift-Nr' : 'Gutschrift-Nr'} value={props.gutschriftNr} />
        <InfoRow label="Betrag" value={props.betrag} />
        <InfoRow label="Datum" value={props.datum} />

        <Paragraph>
          Den Beleg finden Sie im angehängten PDF.
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
