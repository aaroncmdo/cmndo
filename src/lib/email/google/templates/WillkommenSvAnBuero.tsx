// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Footer } from '../../components'

// ARCH-1 Phase 2 (BLOCK D): Mail-Kopie an Buero-Inhaber wenn ein neuer
// Sub-SV zu seinem Buero hinzugefuegt wurde. Der Sub-SV bekommt eine
// separate Welcome-Mail (WillkommenSv.tsx).

type Props = {
  inhaber_vorname: string
  buero_name: string
  neuer_sv_vorname: string
  neuer_sv_nachname: string
  neuer_sv_email: string
  paket_name: string
  standort_adresse?: string | null
}

export function subject(p: Props) {
  return `Neuer Mitarbeiter angelegt: ${p.neuer_sv_vorname} ${p.neuer_sv_nachname}`
}

export function WillkommenSvAnBueroEmail(props: Props) {
  return (
    <EmailShell preview={`Neuer Mitarbeiter ${props.neuer_sv_vorname} ${props.neuer_sv_nachname} für ${props.buero_name}`}>
      <MailHeader />
      <Card>
        <Heading>Hallo {props.inhaber_vorname},</Heading>
        <Paragraph>
          ein neuer Mitarbeiter wurde für dein Büro <strong>{props.buero_name}</strong> angelegt.
        </Paragraph>

        <Heading>Neuer Mitarbeiter</Heading>
        <InfoRow label="Name" value={`${props.neuer_sv_vorname} ${props.neuer_sv_nachname}`} />
        <InfoRow label="Email" value={props.neuer_sv_email} />
        <InfoRow label="Paket" value={props.paket_name} />
        {props.standort_adresse ? <InfoRow label="Standort" value={props.standort_adresse} /> : null}

        <Paragraph>
          Er erhält seinen Login per separater Welcome-Mail. Sobald er sich eingeloggt hat
          und du als Inhaber den Vertrag unterzeichnet + die Anzahlung geleistet hast, kann
          er Aufträge erhalten.
        </Paragraph>

        <Paragraph>
          Bei Fragen erreichst du uns unter <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>
        <Paragraph>
          Viele Grüße,<br/>
          Dein Claimondo-Team
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
