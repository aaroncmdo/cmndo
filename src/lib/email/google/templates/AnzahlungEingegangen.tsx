import { EmailLayout, Heading, Paragraph, Button, Divider, APP_URL } from './layout'

// Anzahlung-Bestaetigungs-Mail fuer Solo-SV, Buero-Inhaber und Akademie-Verwalter

type Typ = 'solo' | 'buero' | 'akademie'

type Props = {
  vorname: string | null
  typ: Typ
  orgName?: string | null
  portalUrl?: string | null
}

export function subject(p: Props) {
  if (p.typ === 'buero' && p.orgName) {
    return `Anzahlung eingegangen — Buero ${p.orgName} ist aktiv`
  }
  if (p.typ === 'akademie' && p.orgName) {
    return `Anzahlung eingegangen — Akademie ${p.orgName} ist aktiv`
  }
  return 'Zahlung eingegangen — dein Portal ist freigeschaltet!'
}

function bodyText(p: Props) {
  if (p.typ === 'buero' && p.orgName) {
    return (
      <>
        <Paragraph>
          deine Anzahlung für das Büro <strong>{p.orgName}</strong> ist eingegangen.
          Alle Standorte sind freigeschaltet und können ab sofort Aufträge erhalten.
        </Paragraph>
      </>
    )
  }
  if (p.typ === 'akademie' && p.orgName) {
    return (
      <Paragraph>
        deine Anzahlung für die Akademie <strong>{p.orgName}</strong> ist eingegangen.
        Alle Mitglieder sind freigeschaltet.
      </Paragraph>
    )
  }
  return (
    <Paragraph>
      deine Anzahlung ist eingegangen. Dein Gutachter-Portal ist jetzt freigeschaltet!
    </Paragraph>
  )
}

export function AnzahlungEingegangenEmail(props: Props) {
  const url = props.portalUrl ?? `${APP_URL}/gutachter`

  return (
    <EmailLayout preview="Anzahlung eingegangen — Portal freigeschaltet">
      <Heading>Zahlung bestätigt!</Heading>

      <Paragraph>
        Hallo {props.vorname ?? 'Partner'},
      </Paragraph>

      {bodyText(props)}

      <Divider />

      <Button href={url}>
        {props.typ === 'buero' ? 'Zum Büro-Portal' : props.typ === 'akademie' ? 'Zum Akademie-Portal' : 'Zum Portal'}
      </Button>

      <Paragraph>Dein Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}
