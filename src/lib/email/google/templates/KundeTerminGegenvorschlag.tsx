// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
// AAR-702: Kunden-Email nach SV-Gegenvorschlag — Magic-Link auf
// /kunde-termin/<token> mit „Annehmen" + „Eigener Vorschlag"-CTAs.
// Kein Login nötig — Token gilt 7 Tage.

import { EmailShell, Hero, Card, Paragraph, InfoRow, Button, Footer } from '../../components'
import { email } from '../../tokens'
import { type EmailBrand } from './layout'
import { getKundeTerminGegenvorschlagStrings } from './KundeTerminGegenvorschlag.i18n'

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
  locale: string
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Caller)
  brand?: EmailBrand
}

export function subject(p: Props, locale: string = 'de') {
  const s = getKundeTerminGegenvorschlagStrings(locale)
  return s.subject(p.svName, p.neuerTerminDatum)
}

export function KundeTerminGegenvorschlagEmail(props: Props) {
  const s = getKundeTerminGegenvorschlagStrings(props.locale)
  return (
    <EmailShell preview={s.preview(props.svName, props.neuerTerminDatum, props.neuerTerminUhrzeit)} dark>
      <Hero
        logoUrl={props.brand?.logoUrl ?? null}
        logoText={props.brand?.firmenname ?? undefined}
        headline={s.heading}
      />
      <Card>
        <Paragraph>{s.begruessung(props.kundenVorname, props.svName)}</Paragraph>

        <InfoRow label={s.labelFall} value={props.fallNummer} />
        <InfoRow label={s.labelUrspruenglicherTermin} value={s.terminWert(props.alterTerminDatum, props.alterTerminUhrzeit)} />
        <InfoRow label={s.labelNeuerVorschlag} value={s.terminWert(props.neuerTerminDatum, props.neuerTerminUhrzeit)} />
        {props.grund ? <InfoRow label={s.labelBegruendung} value={props.grund} /> : null}

        <Paragraph>{s.hinweis}</Paragraph>

        <Button href={props.responseUrl} bg={props.brand?.primary}>{s.button}</Button>

        <Paragraph>
          {s.linkFallback}
          <br />
          <a href={props.responseUrl} style={{ color: email.color.ondo }}>{props.responseUrl}</a>
        </Paragraph>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
