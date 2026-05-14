// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, APP_URL, ONDO, type EmailBrand } from './layout'

// AAR-902 Prototyp: Magic-Link-Versand nach Mini-Wizard. Anders als
// FlowLinkVersand kein SV / Termin notwendig — die Felder werden erst im
// Onboarding nach Login eingegeben. Daher minimaler Template-Variablen-Satz.

type Props = {
  vorname: string
  flowUrl: string
  brand?: EmailBrand
}

export function subject(p: Props) {
  return p.vorname
    ? `${p.vorname}, hier ist Ihr sicherer Login-Link`
    : 'Ihr sicherer Login-Link bei Claimondo'
}

export function MiniWizardMagicLinkEmail(props: Props) {
  const anrede = props.vorname ? `Hallo ${props.vorname},` : 'Hallo,'
  return (
    <EmailLayout preview="Ihr sicherer Login-Link für Ihren Schadenfall" brand={props.brand}>
      <Heading brand={props.brand}>{anrede}</Heading>
      <Paragraph>
        danke für Ihre Schadenmeldung bei Claimondo. Mit einem Klick auf den unten stehenden Button
        kommen Sie direkt in Ihren Schadenfall.
      </Paragraph>
      <Paragraph>
        Im nächsten Schritt unterschreiben Sie Vollmacht + Sachverständigen-Auftrag — danach
        kümmern wir uns um Gutachter, Anwalt, Werkstatt und Auszahlung. Sie zahlen nichts dazu
        (§ 249 BGB bei unverschuldeten Schäden).
      </Paragraph>
      <Button href={props.flowUrl} brand={props.brand}>
        Schadenfall öffnen
      </Button>
      <Paragraph>
        Der Link ist 72 Stunden gültig. Bei Rückfragen antworten Sie einfach auf diese Email oder
        besuchen Sie <a href={APP_URL} style={{ color: ONDO }}>{APP_URL}</a>.
      </Paragraph>
    </EmailLayout>
  )
}
