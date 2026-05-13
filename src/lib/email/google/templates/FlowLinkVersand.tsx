// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, InfoTable, APP_URL, ONDO, type EmailBrand } from './layout'

// AAR-141 / W7: FlowLink-Versand per Email. Alternative zum Standard-WA-Versand
// wenn der Kunde keine WhatsApp-Nummer hat oder explizit Email präferiert.

type Props = {
  vorname: string
  svVorname: string
  svNachname: string
  terminDatum: string
  terminUhrzeit: string
  flowUrl: string
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Flow)
  brand?: EmailBrand
}

export function subject(p: Props) {
  return `${p.vorname}, Ihr Schadenportal ist bereit`
}

export function FlowLinkVersandEmail(props: Props) {
  return (
    <EmailLayout preview={`Ihr Claimondo-Schadenportal — Termin mit ${props.svVorname} ${props.svNachname}`} brand={props.brand}>
      <Heading brand={props.brand}>Hallo {props.vorname},</Heading>
      <Paragraph>
        wir haben Ihren Fall aufgenommen. Ihr persönliches Schadenportal ist nun bereit. Dort laden Sie
        die nötigen Unterlagen hoch und unterschreiben Vollmacht + Sachverständigen-Auftrag.
      </Paragraph>
      <Paragraph>
        <strong>Ihr Gutachter-Termin:</strong>
      </Paragraph>
      <InfoTable
        rows={[
          ['Sachverständiger', `${props.svVorname} ${props.svNachname}`],
          ['Datum', props.terminDatum],
          ['Uhrzeit', props.terminUhrzeit],
        ]}
      />
      <Paragraph>
        Über den untenstehenden Link kommen Sie direkt in Ihr Schadenportal:
      </Paragraph>
      <Button href={props.flowUrl} brand={props.brand}>Schadenportal öffnen</Button>
      <Paragraph>
        Der Link ist 72 Stunden gültig. Bei Rückfragen antworten Sie einfach auf diese Email oder
        besuchen Sie <a href={APP_URL} style={{ color: ONDO }}>{APP_URL}</a>.
      </Paragraph>
    </EmailLayout>
  )
}
