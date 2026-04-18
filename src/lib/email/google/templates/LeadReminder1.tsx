import { EmailLayout, Heading, Paragraph, Button } from './layout'

// AAR-477 C11: Reminder 1 — 2 Stunden nach Lead-Anlage ohne Fall.
// Ton: freundlich, leicht, erinnernd. Schlüssel-Botschaft: „nur noch wenige
// Klicks bis zum Gutachter-Termin".

export default function LeadReminder1({
  vorname,
  resumeUrl,
}: {
  vorname: string | null
  resumeUrl: string
}) {
  const anrede = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    <EmailLayout preview="Ihre Schadenmeldung ist fast fertig — 2 Minuten, und wir kümmern uns.">
      <Heading>{anrede}, kurze Erinnerung</Heading>
      <Paragraph>
        Sie haben gerade angefangen, Ihren Schaden zu melden — und sind fast
        durch. Es fehlen nur noch ein paar Angaben, dann übernehmen wir alles
        Weitere für Sie: Gutachter, Anwalt, Regulierung.
      </Paragraph>
      <Paragraph>
        Klicken Sie einfach hier, um da weiterzumachen, wo Sie aufgehört haben:
      </Paragraph>
      <Button href={resumeUrl}>Weitermachen →</Button>
      <Paragraph>
        Der Link ist persönlich für Sie. Ihre bereits eingegebenen Daten sind
        gespeichert — keine Doppelarbeit.
      </Paragraph>
    </EmailLayout>
  )
}
