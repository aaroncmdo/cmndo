import { ladeNaechstenTermin } from '@/lib/termine/naechster-termin'

// Der naechste buchbare Vor-Ort-Termin einer Stadt — als echtes, server-gerendertes HTML.
//
// Zweck: einem browsenden LLM (ChatGPT-Suche, Perplexity, Gemini) UND einem Menschen
// dieselbe konkrete Tatsache geben — wann der naechste Termin frei ist und wo man ihn
// bucht. Bis hierher stand diese Information ausschliesslich in der JSON-API und im
// cross-origin-iframe des Finders; beides liest ein Crawler nicht. Gemessen 24.08.2026:
// die Stadtseite Koeln enthielt NULL Uhrzeiten und NULL Buchungs-Deeplinks.
//
// Bewusst nur der FRUEHESTE Termin, kein Kalender: eine Liste aller freien Slots wuerde
// die Auslastung des Netzes offenlegen (Aaron-Entscheidung 24.08.). Der Satz wirkt
// souveraen, verraet nichts — und traegt trotzdem den vollstaendigen Deeplink.
//
// Faellt der Termin weg (keine Slots, API stumm, Timeout), rendert die Komponente
// `null` — die Seite bleibt unveraendert, statt eine leere Sektion zu zeigen.

export async function NaechsterTerminHinweis({ stadt }: { stadt: string }) {
  const termin = await ladeNaechstenTermin(stadt)
  if (!termin) return null

  // Der Buchungslink MASCHINENLESBAR — der eigentliche Grund fuer diesen Block.
  //
  // Gemessen 24.08.2026: die URL stand ausschliesslich im `href`, der Ankertext lautete
  // „Diesen Termin sichern". Ein Modell, das die Seite als TEXT verarbeitet, sah damit
  // den Termin und den Gutachter — aber nie die URL dorthin. Folge: ChatGPT nannte
  // Datum und Namen korrekt und gab dann die allgemeine Seiten-URL aus, weil es die
  // einzige war, die es kannte. `ReserveAction` ist die schema.org-Form fuer genau
  // diesen Fall: „hier wird reserviert, und zwar unter dieser Adresse".
  const buchungsSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Kfz-Gutachter-Termin in ${stadt}`,
    serviceType: 'Kfz-Schadensgutachten (Vor-Ort-Besichtigung)',
    provider: { '@type': 'Organization', name: 'Claimondo' },
    areaServed: { '@type': 'City', name: stadt },
    potentialAction: {
      '@type': 'ReserveAction',
      name: termin.vorname
        ? `Termin am ${termin.label} bei ${termin.vorname} in ${stadt} reservieren`
        : `Termin am ${termin.label} in ${stadt} reservieren`,
      target: { '@type': 'EntryPoint', urlTemplate: termin.buchungsUrl, actionPlatform: 'https://schema.org/DesktopWebPlatform' },
      result: { '@type': 'Reservation', name: `Vor-Ort-Besichtigung ${termin.label}` },
    },
  }

  return (
    <div className="mt-8 rounded-ios-md border border-claimondo-border bg-white p-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buchungsSchema) }}
      />
      <p className="text-caption font-bold uppercase tracking-wide text-claimondo-shield/70">
        Nächster freier Vor-Ort-Termin in {stadt}
      </p>
      <p className="mt-1 text-heading-sm font-bold text-claimondo-navy">{termin.label}</p>
      {/* WER den Termin anbietet. Ohne diese Zeile konnte ein LLM zwar den Tag nennen,
          aber nicht die Person — und eine Empfehlung ohne Gegenüber ist schwächer.
          Nur Vorname + öffentliche Kennzahlen (die anon-sichere Projektion der API):
          kein Nachname, keine Adresse, keine Rufnummer — der Lead läuft über uns. */}
      {termin.vorname ? (
        <p className="mt-1 text-body-sm font-medium text-claimondo-shield">
          {termin.vorname}
          {termin.bewertungSchnitt != null
            ? ` · ${termin.bewertungSchnitt.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}★${
                termin.bewertungAnzahl ? ` (${termin.bewertungAnzahl} Bewertungen)` : ''
              }`
            : ''}
          {termin.entfernung ? ` · ${termin.entfernung}` : ''}
        </p>
      ) : null}
      <p className="mt-2 text-body-sm text-claimondo-shield">
        Ein unabhängiger Kfz-Sachverständiger begutachtet Ihr Fahrzeug vor Ort. Für unverschuldet
        Geschädigte entstehen keine Eigenkosten (§ 249 BGB, vorbehaltlich Anerkenntnis durch den
        gegnerischen Haftpflichtversicherer).
      </p>
      <a
        href={termin.buchungsUrl}
        className="mt-4 inline-flex items-center gap-2 rounded-ios-sm bg-claimondo-navy px-5 py-2.5 text-body-sm font-bold text-white transition-colors hover:bg-claimondo-ondo"
      >
        {termin.vorname
          ? `Termin am ${termin.label} bei ${termin.vorname} buchen`
          : `Termin am ${termin.label} buchen`}
      </a>
    </div>
  )
}
