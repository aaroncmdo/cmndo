import { EmailLayout, Heading, Paragraph, Button, InfoTable, APP_URL, NAVY } from './layout'
import { Text, Section } from '@react-email/components'

type Position = { bezeichnung: string; betrag: string }

type Props = {
  fallNummer: string
  rechnungsNr: string
  rechnungsDatum: string
  positionen: Position[]
  gesamtbetrag: string
  fallId: string
}

export function subject(p: Props) {
  return `Abrechnung + Rechnung für Fall ${p.fallNummer}`
}

export function KanzleiAbrechnungRechnungEmail(props: Props) {
  return (
    <EmailLayout preview={`Kanzlei-Rechnung ${props.rechnungsNr} — ${props.gesamtbetrag}`}>
      <Heading>Abrechnung + Rechnung für Fall {props.fallNummer}</Heading>
      <Paragraph>
        Anbei die Abrechnung und Rechnung für den abgeschlossenen Fall als PDF.
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungs-Nr.', props.rechnungsNr],
        ['Datum', props.rechnungsDatum],
        ['Fall', props.fallNummer],
      ]} />

      <Section style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '16px 20px', margin: '16px 0' }}>
        {props.positionen.map((pos, i) => (
          <Text key={i} style={{ color: '#374151', fontSize: 13, margin: '6px 0', lineHeight: '20px' }}>
            {pos.bezeichnung}: <strong>{pos.betrag}</strong>
          </Text>
        ))}
        <Text style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8, color: NAVY, fontSize: 15, fontWeight: 700 }}>
          Gesamt: {props.gesamtbetrag}
        </Text>
      </Section>

      <Button href={`${APP_URL}/admin/faelle/${props.fallId}`}>Fallakte öffnen</Button>

      <Paragraph>
        Die Rechnung liegt dieser Email als PDF bei.
      </Paragraph>
    </EmailLayout>
  )
}
