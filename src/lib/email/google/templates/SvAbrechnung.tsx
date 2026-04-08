import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL, NAVY } from './layout'
import { Text, Section } from '@react-email/components'

type Position = { bezeichnung: string; betrag: string }

type Props = {
  svVorname: string
  fallNummer: string
  positionen: Position[]
  gesamtbetrag: string
  zahlungsHinweis: string
  abrechnungId: string
}

export function subject(p: Props) {
  return `Abrechnung für Fall ${p.fallNummer}`
}

export function SvAbrechnungEmail(props: Props) {
  return (
    <EmailLayout preview={`Abrechnung ${props.fallNummer} — ${props.gesamtbetrag}`}>
      <Heading>Deine Abrechnung für Fall {props.fallNummer}</Heading>
      <Paragraph>
        Hallo {props.svVorname}, hier ist die Abrechnung für deinen Auftrag:
      </Paragraph>

      {/* Tabelle */}
      <Section style={{ backgroundColor: '#f9fafb', borderRadius: 12, padding: '16px 20px', margin: '16px 0' }}>
        {props.positionen.map((pos, i) => (
          <Text key={i} style={{ color: '#374151', fontSize: 13, margin: '6px 0', lineHeight: '20px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{pos.bezeichnung}</span>
            <span style={{ fontWeight: 600 }}>{pos.betrag}</span>
          </Text>
        ))}
        <Text style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8, color: NAVY, fontSize: 15, fontWeight: 700 }}>
          Gesamt: {props.gesamtbetrag}
        </Text>
      </Section>

      <Paragraph>{props.zahlungsHinweis}</Paragraph>

      <Button href={`${APP_URL}/gutachter/abrechnung`}>Zur Abrechnungsübersicht</Button>
    </EmailLayout>
  )
}
