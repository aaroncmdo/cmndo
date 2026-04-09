import { EmailLayout, Heading, Paragraph, InfoTable, Divider } from './layout'

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
    <EmailLayout preview={`Neuer Mitarbeiter ${props.neuer_sv_vorname} ${props.neuer_sv_nachname} fuer ${props.buero_name}`}>
      <Heading>Hallo {props.inhaber_vorname},</Heading>
      <Paragraph>
        ein neuer Mitarbeiter wurde fuer dein Buero <strong>{props.buero_name}</strong> angelegt.
      </Paragraph>

      <Divider />
      <Heading>Neuer Mitarbeiter</Heading>
      <InfoTable rows={[
        ['Name', `${props.neuer_sv_vorname} ${props.neuer_sv_nachname}`],
        ['Email', props.neuer_sv_email],
        ['Paket', props.paket_name],
        ...(props.standort_adresse ? [['Standort', props.standort_adresse] as [string, string]] : []),
      ]} />

      <Paragraph>
        Er erhaelt seinen Login per separater Welcome-Mail. Sobald er sich eingeloggt hat
        und du als Inhaber den Vertrag unterzeichnet + die Anzahlung geleistet hast, kann
        er Auftraege erhalten.
      </Paragraph>

      <Divider />
      <Paragraph>
        Bei Fragen erreichst du uns unter <strong>support@claimondo.de</strong>.
      </Paragraph>
      <Paragraph>
        Viele Gruesse,<br/>
        Dein Claimondo-Team
      </Paragraph>
    </EmailLayout>
  )
}
