// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Note, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL } from './layout'

// Wochen-Digest an einen Makler mit aktiviertem Report-Opt-in. Formelles "Sie" (B2B).
// Alle Zahlen kommen bereits als Label-Strings (Formatierung im Flow), damit das
// Template rein praesentational bleibt (wie KanzleiMonatsAbrechnung).

type StaffelProps = {
  settledCount: number
  nochBis: number | null
  bonusLabel: string | null
  alleErreicht: boolean
}

type Props = {
  vorname: string
  firma: string
  zeitraumLabel: string
  neueLeads: number
  neueVermittlungen: number
  neueVermittlungenSummeLabel: string | null
  offeneLeads: number
  freigegebenAnzahl: number
  freigegebenSummeLabel: string
  staffel: StaffelProps | null
  /** One-Click-Abmelde-Link (null → kein sichtbarer Link, z.B. wenn Secret fehlt). */
  optOutUrl: string | null
}

export function subject(p: Props) {
  return `Ihr Wochenreport${p.firma ? ` für ${p.firma}` : ''}`
}

export function MaklerWochenReportEmail(props: Props) {
  const dashboardUrl = `${APP_URL}/makler`

  const vermittlungenValue =
    props.neueVermittlungen > 0 && props.neueVermittlungenSummeLabel
      ? `${props.neueVermittlungen} (${props.neueVermittlungenSummeLabel})`
      : String(props.neueVermittlungen)

  const freigegebenValue = `${props.freigegebenSummeLabel} (${props.freigegebenAnzahl} ${
    props.freigegebenAnzahl === 1 ? 'Vermittlung' : 'Vermittlungen'
  })`

  return (
    <EmailShell preview={`Ihr Wochenreport${props.firma ? ` für ${props.firma}` : ''}`}>
      <MailHeader />
      <Card>
        <Heading>Hallo {props.vorname}!</Heading>
        <Paragraph>
          hier ist Ihr Wochen-Überblick{props.firma ? <> für <strong>{props.firma}</strong></> : null}{' '}
          ({props.zeitraumLabel}):
        </Paragraph>

        <div style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(3)} 0` }}>
          <InfoRow label="Neue Leads" value={String(props.neueLeads)} />
          <InfoRow label="Neue Vermittlungen" value={vermittlungenValue} />
          <InfoRow label="Leads in Bearbeitung" value={String(props.offeneLeads)} />
          <InfoRow label="Freigegeben (abrechenbar)" value={freigegebenValue} />
        </div>

        {props.staffel ? (
          <Paragraph>
            <strong>Staffel-Fortschritt:</strong>{' '}
            {props.staffel.alleErreicht ? (
              <>Sie haben alle Staffel-Stufen erreicht — stark!</>
            ) : props.staffel.nochBis != null && props.staffel.nochBis > 0 ? (
              <>
                Noch {props.staffel.nochBis}{' '}
                {props.staffel.nochBis === 1 ? 'Vermittlung' : 'Vermittlungen'} bis zur nächsten Stufe
                {props.staffel.bonusLabel ? <> (Bonus {props.staffel.bonusLabel})</> : null}.
              </>
            ) : (
              <>Ihre nächste Stufe ist zum Greifen nah.</>
            )}
          </Paragraph>
        ) : null}

        <Paragraph>
          Alle Details, Ihre Akten und die Abrechnung finden Sie in Ihrem Portal.
        </Paragraph>

        <Button href={dashboardUrl}>Zum Dashboard</Button>

        <Note>
          Sie erhalten diesen Wochenreport als Claimondo-Partner.
          {props.optOutUrl ? (
            <>
              {' '}
              <a href={props.optOutUrl} style={{ color: email.color.navy, textDecoration: 'underline' }}>
                Hier abmelden
              </a>
              .
            </>
          ) : null}
        </Note>
      </Card>
      <Footer />
    </EmailShell>
  )
}
