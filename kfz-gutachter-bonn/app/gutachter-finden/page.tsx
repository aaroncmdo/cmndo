import type { Metadata } from 'next'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { SITE } from '@/lib/site'
import { CLUSTER, MAIN_CITY } from '@/lib/cluster'

// Gutachter-Finder unter DIESER Domain (Aaron-Entscheid 21.08.2026:
// „dann mach den finder eigenständig").
//
// WARUM EIGENSTAENDIG UND NICHT DURCHGEREICHT: Der Finder ist das Versprechen
// dieser Domain. Ein Link auf claimondo.de bricht es sichtbar — wer
// „Kfz-Gutachter {Stadt}" gesucht hat, landet mitten im Vorgang bei einer
// anderen Marke. Als Embed bleibt der Besucher hier, waehrend Daten und
// Buchung aus dem Claimondo-Backend kommen; er merkt den Unterschied nicht.
//
// ⚠ DER STILLE BLOCKER: Die App schuetzt /embed/* per
// `Content-Security-Policy: frame-ancestors` (src/next.config.ts). Steht diese
// Domain dort nicht drin, blockt der Browser den iframe — die Seite rendert
// dann eine LEERE FLAECHE, ohne Fehlermeldung und mit HTTP 200. Genau so sah
// es beim lokalen Test aus, bevor die Cluster-Domains ergaenzt wurden.

export const metadata: Metadata = {
  title: `Kfz-Gutachter in ${MAIN_CITY.name} finden — Karte mit freien Terminen`,
  description: `Zertifizierte Kfz-Sachverständige in ${MAIN_CITY.name} und Umgebung auf der Karte: freie Termine sehen und direkt buchen. Bei unverschuldetem Unfall 0 € (§ 249 BGB).`,
  alternates: { canonical: '/gutachter-finden' },
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    url: `${SITE.url}/gutachter-finden`,
    title: `Kfz-Gutachter in ${MAIN_CITY.name} finden`,
    description: `Sachverständige in ${MAIN_CITY.name} und Umgebung mit freien Terminen — Gutachter in unter 48 h vor Ort.`,
    images: [{ url: `${CLUSTER.imgPath}og-${CLUSTER.key}.png` }],
  },
}

export default function GutachterFindenPage() {
  return (
    <>
      {/* `ankerBasis="/"`: die vier Anker-Links der Navigation (#leistungen …)
          zeigen auf Abschnitte, die es NUR auf der Landing gibt. Ohne das
          Prefix waeren sie hier tot — der Browser springt einfach nicht, ganz
          ohne Fehler. */}
      <Header city={MAIN_CITY} ankerBasis="/" />

      {/* Der Embed fuellt den Rest des Fensters. Die Werte spiegeln die
          Header-Hoehen aus Header.tsx (60/72/80/84 px) — ohne das entsteht
          entweder ein Scroll-Balken oder ein toter Streifen unter der Karte. */}
      <main className="h-[calc(100dvh-60px)] sm:h-[calc(100dvh-72px)] md:h-[calc(100dvh-80px)] lg:h-[calc(100dvh-84px)]">
        <h1 className="sr-only">
          Kfz-Gutachter in {MAIN_CITY.name} finden — Karte mit verfügbaren Sachverständigen
        </h1>
        <iframe
          src={SITE.finderEmbedUrl}
          title={`Kfz-Gutachter in ${MAIN_CITY.name} finden`}
          className="h-full w-full border-0"
          loading="lazy"
          // ⚠ PFLICHT: ohne `allow` blockt die Permissions-Policy die
          // Geolocation im cross-origin-iframe — „Aktuellen Standort
          // verwenden" ist dann tot, ohne dass etwas fehlschlaegt.
          allow="geolocation"
        />
      </main>

      <Footer city={MAIN_CITY} />
    </>
  )
}
