// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, InfoTable, Button, APP_URL } from './layout'

// AAR-134: Email an den Dispatcher wenn ein SV einen Termin ablehnt.
type Props = {
  svName: string
  kundenName: string
  terminDatum: string
  terminUhrzeit: string
  grund: string
  leadId: string | null
  fallId: string | null
}

export function subject(p: Props) {
  return `SV-Ablehnung: ${p.svName} — ${p.terminDatum}`
}

export function DispatcherTerminAbgelehntEmail(props: Props) {
  const targetUrl = props.fallId
    ? `${APP_URL}/faelle/${props.fallId}`
    : props.leadId
      ? `${APP_URL}/dispatch/leads/${props.leadId}`
      : `${APP_URL}/dispatch/leads`

  return (
    <EmailLayout preview={`SV-Ablehnung ${props.svName} am ${props.terminDatum}`}>
      <Heading>Sachverständiger hat Termin abgelehnt</Heading>
      <Paragraph>
        <strong>{props.svName}</strong> hat den reservierten Termin abgelehnt.
        Bitte einen anderen SV finden — der Kunde wartet.
      </Paragraph>

      <InfoTable rows={[
        ['Sachverständiger', props.svName],
        ['Kunde', props.kundenName],
        ['Termin', `${props.terminDatum} um ${props.terminUhrzeit} Uhr`],
        ['Grund', props.grund],
      ]} />

      <Button href={targetUrl}>{props.fallId ? 'Zur Fallakte' : 'Zum Lead'}</Button>
    </EmailLayout>
  )
}
