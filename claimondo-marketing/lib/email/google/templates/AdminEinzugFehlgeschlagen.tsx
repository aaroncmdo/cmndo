// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Footer } from '../../components'
import { APP_URL } from './layout'

// Admin-Alert: Lastschrift-Einzug fehlgeschlagen. P3 Tier-3 (System): minimal, immer Claimondo.

type Props = {
  abrechnungsNr: string
  empfaengerName: string | null
  betragBrutto: number
  fehlerGrund: string
}

export function subject(p: Props) {
  return `[Claimondo] Lastschrift-Einzug fehlgeschlagen: ${p.abrechnungsNr}`
}

function fmtEuro(n: number): string {
  return n.toFixed(2) + ' EUR'
}

export function AdminEinzugFehlgeschlagenEmail(props: Props) {
  return (
    <EmailShell preview={`Einzug fehlgeschlagen: ${props.abrechnungsNr}`}>
      <MailHeader />
      <Card>
        <Heading>Lastschrift-Einzug fehlgeschlagen</Heading>
        <Paragraph>Hallo,</Paragraph>
        <Paragraph>
          der automatische Lastschrift-Einzug für eine SV-Monatsabrechnung ist fehlgeschlagen:
        </Paragraph>

        <InfoRow label="Rechnungsnr." value={props.abrechnungsNr} />
        <InfoRow label="Empfänger" value={props.empfaengerName ?? '—'} />
        <InfoRow label="Betrag" value={fmtEuro(props.betragBrutto)} />
        <InfoRow label="Fehler" value={props.fehlerGrund} />

        <Button href={`${APP_URL}/admin/abrechnungen`}>Zum Admin-Panel: Abrechnungen</Button>

        <Paragraph>Dein Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
