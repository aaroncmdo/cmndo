// AAR-702: Kunden-Email nach SV-Gegenvorschlag — Magic-Link auf
// /kunde-termin/<token> mit „Annehmen" + „Eigener Vorschlag"-CTAs.
// Kein Login nötig — Token gilt 7 Tage.

import { EmailLayout, Heading, Paragraph, InfoTable, Button, type EmailBrand } from './layout'

type Props = {
  kundenVorname: string
  fallNummer: string
  alterTerminDatum: string
  alterTerminUhrzeit: string
  neuerTerminDatum: string
  neuerTerminUhrzeit: string
  grund: string | null
  svName: string
  responseUrl: string
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Caller)
  brand?: EmailBrand
}

export function subject(p: Props) {
  return `Neuer Terminvorschlag von ${p.svName} — ${p.neuerTerminDatum}`
}

export function KundeTerminGegenvorschlagEmail(props: Props) {
  return (
    <EmailLayout
      preview={`${props.svName} schlägt einen neuen Termin vor: ${props.neuerTerminDatum} ${props.neuerTerminUhrzeit}`}
      brand={props.brand}
    >
      <Heading brand={props.brand}>Neuer Terminvorschlag vom Sachverständigen</Heading>
      <Paragraph>
        Hallo {props.kundenVorname}, Ihr Sachverständiger {props.svName} kann den
        ursprünglich vereinbarten Termin leider nicht halten und schlägt einen
        Alternativtermin vor.
      </Paragraph>

      <InfoTable
        rows={[
          ['Fall', props.fallNummer],
          ['Ursprünglicher Termin', `${props.alterTerminDatum} um ${props.alterTerminUhrzeit} Uhr`],
          ['Neuer Vorschlag', `${props.neuerTerminDatum} um ${props.neuerTerminUhrzeit} Uhr`],
          ...(props.grund ? ([['Begründung', props.grund]] as [string, string][]) : []),
        ]}
      />

      <Paragraph>
        Sie können den Vorschlag direkt über den Button unten annehmen oder
        einen eigenen Termin vorschlagen. Kein Login nötig.
      </Paragraph>

      <Button href={props.responseUrl} brand={props.brand}>Termin annehmen oder Gegenvorschlag</Button>

      <Paragraph>
        Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren
        Browser:
        <br />
        <a href={props.responseUrl} style={{ color: '#4573A2' }}>
          {props.responseUrl}
        </a>
      </Paragraph>
    </EmailLayout>
  )
}
