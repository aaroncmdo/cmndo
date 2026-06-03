// AAR-939 · Stream 8b — SV-Tracking-Einrichtungs-Anleitung (3 Tabs).
// Klick-Pfade + Code statt Produkt-Screenshots (extern, nicht generierbar) —
// Screenshot-Plaetze als Kommentar markiert fuer spaetere Ergaenzung.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/shared/PageHeader'
import { SectionCard } from '@/components/shared/SectionCard'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

export default async function TrackingAnleitungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: site } = await (supabase as any)
    .from('embed_sites')
    .select('slug, tracking_ga4_measurement_id')
    .eq('id', id)
    .maybeSingle()
  if (!site) notFound()

  const ga4 = (site.tracking_ga4_measurement_id as string | null) ?? 'G-XXXXXXX'

  return (
    <div className="py-6 space-y-4">
      <PageHeader title="Tracking einrichten" size="lg" description={`Für Site „${site.slug}"`} />
      <Link href={`/gutachter/einstellungen/embed/${id}`} className="text-sm text-claimondo-ondo hover:underline">
        ← Zurück zur Site
      </Link>

      <Tabs defaultValue="ga4">
        <TabsList>
          <TabsTrigger value="ga4">GA4</TabsTrigger>
          <TabsTrigger value="ads">Google Ads</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
        </TabsList>

        <TabsContent value="ga4">
          <SectionCard title="Google Analytics 4" bodyClassName="space-y-3 text-sm text-claimondo-navy">
            <p>
              Monika pusht Events in den <code>window.dataLayer</code> deiner Seite — du fängst sie in GA4
              über den Google Tag Manager ab. Kein Code auf deiner Seite nötig außer dem GTM-Container.
            </p>
            <p className="font-medium">Events, die Monika sendet:</p>
            <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto">
{`monika_shown          // Widget sichtbar
monika_open           // Nutzer öffnet das Widget
monika_qualify_yes    // "Hatten Sie einen Unfall?" -> Ja
monika_form_shown     // Formular angezeigt
monika_anfrage_submit // Anfrage abgeschickt`}
            </pre>
            <p className="font-medium">Einrichtung (GTM):</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>GTM → Variablen → „dataLayer-Variable" für <code>event</code> anlegen.</li>
              <li>GTM → Trigger → „Benutzerdefiniertes Ereignis", Ereignisname <code>monika_anfrage_submit</code>.</li>
              <li>GTM → Tag → „GA4-Ereignis", Mess-ID <code>{ga4}</code>, Ereignisname <code>anfrage</code>, Trigger = oben.</li>
              <li>Vorschau + Veröffentlichen.</li>
            </ol>
            {/* SCREENSHOT-PLATZ: GTM-Trigger-Konfiguration */}
          </SectionCard>
        </TabsContent>

        <TabsContent value="ads">
          <SectionCard title="Google Ads" bodyClassName="space-y-3 text-sm text-claimondo-navy">
            <p>Zwei Wege — wähle einen:</p>
            <p className="font-medium">A) Conversion aus GA4-Event (einfach)</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>GA4 → Verwalten → Ereignisse → <code>anfrage</code> als „Schlüsselereignis" markieren.</li>
              <li>Google Ads → Ziele → Conversions → GA4 importieren → <code>anfrage</code> auswählen.</li>
            </ol>
            <p className="font-medium">B) Offline-Conversion via Webhook (genauer, mit gclid)</p>
            <p>
              Unser Webhook (Tab „Webhook") liefert <code>gclid</code> + <code>value_eur</code> beim
              durchgeführten Termin. Leite das über Make.com an den Google-Ads-Conversion-Upload —
              so zählt der echte Auftragswert (70 €), nicht nur der Klick.
            </p>
            {/* SCREENSHOT-PLATZ: Google-Ads-Conversion-Import */}
          </SectionCard>
        </TabsContent>

        <TabsContent value="webhook">
          <SectionCard title="Webhook (Server-zu-Server)" bodyClassName="space-y-3 text-sm text-claimondo-navy">
            <p>
              Hinterlege im Wizard-Schritt „Tracking" eine HTTPS-URL. Wir POSTen JSON mit einer
              HMAC-Signatur im Header <code>X-Claimondo-Signature</code> bei diesen Events:
              <code> anfrage_eingegangen</code>, <code>termin_vereinbart</code>, <code>termin_durchgefuehrt</code>.
            </p>
            <p className="font-medium">Payload:</p>
            <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto">
{`{
  "event": "termin_durchgefuehrt",
  "anfrage_id": "uuid",
  "embed_site_slug": "${site.slug}",
  "name": "Erika Musterfrau",
  "gclid": "...", "utm_source": "...", "ga_client_id": "...",
  "value_eur": 70,
  "ts": "2026-06-02T10:00:00.000Z"
}`}
            </pre>
            <p className="font-medium">Signatur prüfen (Node):</p>
            <pre className="rounded-ios-lg bg-claimondo-navy text-white text-xs p-4 overflow-x-auto">
{`import { createHmac } from 'crypto'
const expected = 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex')
// zeitkonstant gegen req.headers['x-claimondo-signature'] vergleichen`}
            </pre>
            <p className="text-claimondo-ondo">
              Dein Signatur-Secret steht nach dem Speichern im Wizard-Schritt „Tracking". Mit dem
              „Test-Webhook senden"-Button prüfst du die Verbindung sofort.
            </p>
            {/* SCREENSHOT-PLATZ: Make.com-Szenario */}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  )
}
