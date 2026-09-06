'use client'
// W1.2 (Routen-Cleanup, PR #4482): Tracking-Einrichtungs-Anleitung IN den Embed-Editor
// gezogen — vorher eigene Route .../tracking-anleitung, die im Wizard nur per Button
// verlinkt war. Reine Praesentations-Komponente; slug + GA4-ID kommen aus dem Wizard-
// State (kein eigener DB-Load mehr). Alte Route -> 308 auf den Editor.
// Inhalt: AAR-939 Stream 8b — Klick-Pfade + Code statt Produkt-Screenshots.
import { SectionCard } from '@/components/shared/SectionCard'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function TrackingAnleitungContent({ slug, ga4 }: { slug: string; ga4: string }) {
  return (
    <Tabs defaultValue="ga4">
      <TabsList>
        <TabsTrigger value="ga4">GA4</TabsTrigger>
        <TabsTrigger value="ads">Google Ads</TabsTrigger>
        <TabsTrigger value="webhook">Webhook</TabsTrigger>
      </TabsList>

      <TabsContent value="ga4">
        <SectionCard title="Google Analytics 4" bodyClassName="space-y-3 text-sm text-claimondo-navy">
          <p className="font-medium">Direkt — empfohlen, kein GTM nötig</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Trag Ihre GA4-Measurement-ID <code>{ga4}</code> im Wizard-Schritt „Tracking" ein.</li>
            <li>
              Monika feuert bei erfolgreicher Anfrage automatisch das Ereignis <code>generate_lead</code>{' '}
              direkt in dein GA4 — client-seitig, ohne weiteren Einbau.
            </li>
            <li>
              GA4 → Verwalten → Ereignisse → <code>generate_lead</code> als „Schlüsselereignis" markieren →
              zählt als Conversion.
            </li>
          </ol>
          <p className="pt-2 font-medium">Alternativ über GTM (wenn Sie ohnehin GTM nutzt)</p>
          <p>
            Monika pusht zusätzlich Events in den <code>window.dataLayer</code> Ihrer Seite — die fangen Sie
            über den Google Tag Manager ab.
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
          <p className="text-claimondo-ondo">
            Datenschutz: Beim Direkt-Weg lädt Monika den Google-Tag erst nach dem Absenden der Anfrage
            (nach Einwilligung). Führe GA4 / Google Ads in Ihrer eigenen Datenschutzerklärung auf.
          </p>
          {/* SCREENSHOT-PLATZ: GTM-Trigger-Konfiguration */}
        </SectionCard>
      </TabsContent>

      <TabsContent value="ads">
        <SectionCard title="Google Ads" bodyClassName="space-y-3 text-sm text-claimondo-navy">
          <p>Drei Wege — wähle einen:</p>
          <p className="font-medium">A) Direkt im Cockpit (empfohlen — kein GTM, kein Webhook)</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Google Ads → Ziele → Conversions → neue Conversion-Action „Website" (manuell mit Code).</li>
            <li>
              Aus dem Snippet die Conversion-ID <code>AW-XXXXXXXXX</code> und das Conversion-Label kopieren
              und im Wizard-Schritt „Tracking" eintragen.
            </li>
            <li>Monika feuert die Conversion bei erfolgreicher Anfrage direkt — zählt sofort.</li>
          </ol>
          <p className="font-medium">B) Conversion aus GA4-Event</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>GA4 → Verwalten → Ereignisse → <code>anfrage</code> als „Schlüsselereignis" markieren.</li>
            <li>Google Ads → Ziele → Conversions → GA4 importieren → <code>anfrage</code> auswählen.</li>
          </ol>
          <p className="font-medium">C) Offline-Conversion via Webhook (genauer, mit gclid)</p>
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
  "embed_site_slug": "${slug}",
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
            Ihr Signatur-Secret steht nach dem Speichern im Wizard-Schritt „Tracking". Mit dem
            „Test-Webhook senden"-Button prüfen Sie die Verbindung sofort.
          </p>
          {/* SCREENSHOT-PLATZ: Make.com-Szenario */}
        </SectionCard>
      </TabsContent>
    </Tabs>
  )
}
