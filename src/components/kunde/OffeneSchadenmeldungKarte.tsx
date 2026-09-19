// Karte fuer eine Schadenmeldung ohne Claim (Flow nicht bis zur SA-Unterschrift).
// Server-Component; das Formular ruft die Server-Action fortsetzeSchadenmeldung.
// timeZone gesetzt, obwohl kein 'use client' — die Anzeige soll Berlin-Zeit sein.
import { Card, Text, Button } from '@/components/primitives'
import { fortsetzeSchadenmeldung } from '@/app/kunde/offene-leads-actions'
import type { OffenerLead } from '@/lib/kunde/offene-leads'

export default function OffeneSchadenmeldungKarte({ lead }: { lead: OffenerLead }) {
  const datum = new Date(lead.createdAt).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return (
    <Card>
      <Text variant="headingSm" as="h3">
        Ihre Schadenmeldung vom {datum}
      </Text>
      <Text variant="bodySm" as="p">
        {lead.schadentyp ?? 'Schaden'}
        {lead.kennzeichen ? ` · ${lead.kennzeichen}` : ''} — noch nicht abgeschlossen. Sie können sie jetzt
        fortsetzen; Ihre bisherigen Angaben sind gespeichert.
      </Text>
      <form action={fortsetzeSchadenmeldung}>
        <input type="hidden" name="leadId" value={lead.id} />
        <Button type="submit" variant="navy">
          Jetzt fortsetzen
        </Button>
      </form>
    </Card>
  )
}
