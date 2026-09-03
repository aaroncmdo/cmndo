import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { GutachterFindenSection } from '@/components/gutachter-finden/GutachterFindenSection'
import { FinderSprungPanel } from '@/components/gutachter-finden/FinderSprungPanel'
import { STAEDTE } from '@/lib/kfz-gutachter/staedte'
import { serviceSchema, breadcrumbsSchema, jsonLdScript, SITE_URL, OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { ladeUebersichtsTermine } from '@/lib/termine/naechster-termin'
import { opprefFuerEmbed } from '@/lib/analytics/oaiq-capi'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('page_meta')
  // Der Umfang steht in Title und Description und macht die Seite als HUB
  // erkennbar — statt nur als „Karte". Bewusst aus STAEDTE.length statt
  // hartcodiert: eine feste Zahl waere nach dem naechsten Stadt-Rollout still
  // falsch, und in einer Meta-Description prueft das niemand nach.
  const anzahl = STAEDTE.length
  return {
    title: t('gutachter_finden.title', { anzahl }),
    description: t('gutachter_finden.description', { anzahl }),
    keywords: [
      'Kfz-Gutachter finden',
      'Sachverständiger in der Nähe',
      'Unfallgutachter',
      'Kfz-Sachverständiger Karte',
      'Kfz-Sachverständiger Köln',
      'Kfz-Sachverständiger Düsseldorf',
      'Kfz-Sachverständiger NRW',
      'unabhängiger Gutachter',
      'Schadensgutachten Termin',
      'Wertminderung berechnen',
      'Karte Sachverständige',
      'Gutachter Suche bundesweit',
    ],
    alternates: await localeAlternates('/gutachter-finden'),
    openGraph: {
      type: 'website',
      siteName: 'Claimondo',

      images: OG_DEFAULT_IMAGES,
      ...(await localeOpenGraph(`/gutachter-finden`)),
      title: t('gutachter_finden.og_title', { anzahl }),
      description: t('gutachter_finden.og_description', { anzahl }),
    },
    twitter: {
      card: 'summary_large_image',
      images: OG_DEFAULT_IMAGES,
      title: t('gutachter_finden.twitter_title'),
      description: t('gutachter_finden.twitter_description'),
    },
  }
}

// AAR-956 (Aaron 16.06.): /gutachter-finden ist jetzt EMBED-ONLY — der Vollbild-Finder
// (100dvh) OHNE den Marketing-Content darunter (Trust-Strip, BGH-Authority, FAQ, Bottom-
// CTA), der auf Mobil mit der touch-fangenden 100dvh-Karte einen unsauberen Scroll-Konflikt
// erzeugte. Die SEO-Wirkung bleibt erhalten: Metadata (Title/Description/Keywords/OG/Twitter),
// JSON-LD (Service/Breadcrumb/ImageObject) und die sr-only-H1 beschreiben die Seite weiterhin
// crawler-lesbar. FAQ-/HowTo-JSON-LD wurde entfernt, weil deren SICHTBARER Inhalt wegfällt
// (Google verlangt sichtbaren Content für FAQ-/HowTo-Rich-Results).
// Ratgeber-Ziele des Crawl-Pfads: der Pillar und seine Themen-Spokes.
// Die Staedte kommen nicht mehr aus einer Handliste, sondern aus STAEDTE —
// statt 7 ausgewaehlter sind damit ALLE 173 Stadtseiten verlinkt (s.u.).
const RATGEBER_LINKS = [
  { href: '/kfz-gutachter', label: 'Kfz-Gutachter (Übersicht)' },
  { href: '/kfz-gutachter/kosten', label: 'Was ein Gutachten kostet' },
  { href: '/kfz-gutachter/ablauf', label: 'Ablauf nach dem Unfall' },
  { href: '/kfz-gutachter/wertminderung', label: 'Wertminderung' },
  { href: '/kfz-gutachter/nutzungsausfall', label: 'Nutzungsausfall' },
  { href: '/kfz-gutachter/gutachten-service', label: 'Gutachten-Service' },
  { href: '/kfz-gutachter/online-kfz-gutachten', label: 'Online-Gutachten' },
] as const

export default async function GutachterFindenPage({
  searchParams,
}: {
  searchParams: Promise<{
    stadt?: string; plz?: string; lat?: string; lng?: string
    // AAR-956: Google-Ads-Click-IDs (Ad-Klick landet auf dieser Parent-URL) → an den
    // Embed-iframe weiterreichen, damit der Conversion-Linker im Container _gcl_aw schreibt.
    gclid?: string; gbraid?: string; wbraid?: string; gclsrc?: string
    // OpenAI-Ads-Attribution: dasselbe Spiel wie die Click-IDs eine Zeile hoeher.
    oppref?: string
    // GEO-Deep-Link: `?sv=<profiles.id>` — der Gutachter, den eine KI-Antwort bereits
    // genannt hat (aus `gutachter[].buchungs_url` der oeffentlichen Termin-API). Wird an
    // den Embed durchgereicht und dort NUR als Vorauswahl genutzt.
    sv?: string
    /** GEO-Deep-Link: ISO-Start des genannten Termins (nur mit ?sv= sinnvoll). */
    slot?: string
    /** ChatGPT haengt an jeden ausgegebenen Link `utm_source=chatgpt.com` an — der Wert
     *  wandert bis auf die Anfrage, damit sichtbar wird, WELCHE KI den Kunden brachte. */
    utm_source?: string
    /** Standort des Fahrzeugs, den die KI im Gespraech erfragt hat. Wird hier server-seitig
     *  geocodet und an den Embed durchgereicht — der Kunde muss ihn dann nicht erneut
     *  eintippen. Bewusst OHNE Name/Telefon/E-Mail: die stuenden sonst in Chatverlaeufen,
     *  Referrern und unseren Zugriffslogs. */
    adresse?: string
    /** Schadenart aus dem Chat („Parkschaden", …). Wird an den Embed durchgereicht und
     *  dort gegen die feste Optionsliste geprueft. */
    schadenart?: string
    /** Schuldfrage aus dem Chat (`gegner`|`unklar`) — spart im FlowLink den Quali-Schritt. */
    schuldfrage?: string
  }>
}) {
  const t = await getTranslations('gutachter_finden')
  const sp = await searchParams
  // URL-Parameter ODER __oppref-Cookie, beides nur mit Marketing-Einwilligung.
  const oppref = await opprefFuerEmbed(sp.oppref)

  // Karte auf URL-Param vorzentrieren — ?lat&lng direkt, sonst ?plz / ?stadt server-seitig
  // via Mapbox geocoden. Kein Param -> null -> Client nutzt NRW-Default + Geolocation.
  let initialCenter: { lat: number; lng: number } | null = null
  const latNum = sp.lat ? Number(sp.lat) : NaN
  const lngNum = sp.lng ? Number(sp.lng) : NaN
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    initialCenter = { lat: latNum, lng: lngNum }
  } else {
    // Reihenfolge mit Absicht: die vom Modell erfragte ADRESSE ist praeziser als PLZ oder
    // Stadt — der Gutachter faehrt zu einer Hausnummer, nicht in ein Zentrum.
    const query = sp.adresse?.trim() || sp.plz?.trim() || sp.stadt?.trim()
    if (query) {
      const geo = await geocodeAdresse(query)
      if (geo) initialCenter = { lat: geo.lat, lng: geo.lng }
    }
  }

  // Naechste freie Termine der Kernstaedte — server-geladen, damit die BUCHBARKEIT im
  // HTML steht. Gemessen 24.08.2026 lieferte diese Seite 232 KB HTML mit null Gutachtern
  // und null Terminen (mit UA GPTBot/PerplexityBot/ClaudeBot identisch): der gesamte
  // Finder liegt im cross-origin-iframe, den kein Crawler liest. Ein LLM konnte uns also
  // empfehlen, aber keinen Termin nennen. Faellt die Abfrage aus, ist das Array leer und
  // das Panel sieht exakt aus wie bisher.
  const uebersichtsTermine = await ladeUebersichtsTermine()
  const termineNachStadt = Object.fromEntries(
    uebersichtsTermine.map((t) => [t.stadt, { label: t.label, buchungsUrl: t.buchungsUrl }]),
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          serviceSchema({
            name: 'Kfz-Gutachter-Vermittlung über interaktive Karte',
            description:
              'Sofort-Vermittlung an einen unabhängigen Kfz-Sachverständigen über interaktive Karte. Geprüfte, unabhängige Kfz-Sachverständige, Termin in unter 48 Stunden, kostenfrei für unverschuldet Geschädigte nach §249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
            url: `${SITE_URL}/gutachter-finden`,
          }),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Gutachter finden', url: '/gutachter-finden' },
          ]),
          // ImageObject macht die Static-Map-API maschinen-lesbar zitierbar
          // (Google-Rich-Image + AI-Crawler-Pointer auf die Karte).
          {
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            contentUrl: `${SITE_URL}/api/v1/karte/50670.png`,
            description:
              'Karte der Claimondo-Partner-Sachverständigen – pro deutscher Postleitzahl alle Partner im 30-km-Radius. Beispiel Köln (50670); jede gültige 5-stellige PLZ unter /api/v1/karte/[PLZ].png.',
            width: 1600,
            height: 1200,
            encodingFormat: 'image/png',
            acquireLicensePage: `${SITE_URL}/gutachter-finden`,
          },
        ])}
      />
      <h1 className="sr-only">{t('sr_h1')}</h1>

      {/* Finder-Karte. initialCenter aus ?stadt/?plz/?lat&lng.
          Embed-only: bewusst KEIN Marketing-Content darunter (Trust-Strip, FAQ,
          Bottom-CTA) — der erzeugte auf Mobil den Scroll-Konflikt (AAR-956).
          Die Karte nutzt wieder die VOLLE Hoehe: die 5rem waren fuer die
          Linkleiste reserviert, die es seit 21.08. nicht mehr gibt (Aaron:
          „so eine Bar passt mir nicht"). Der Crawl-Pfad haengt jetzt am
          FinderSprungPanel darunter. */}
      {/* Sprungziel des Skip-Links + <main>-Landmark: beides fehlte hier. */}
      <main id="main-content" tabIndex={-1}>
      <GutachterFindenSection
        height="100dvh"
        initialCenter={initialCenter}
        clickIds={{ gclid: sp.gclid, gbraid: sp.gbraid, wbraid: sp.wbraid, gclsrc: sp.gclsrc }}
        oppref={oppref}
        svId={sp.sv}
        slot={sp.slot}
        utmSource={sp.utm_source}
        adresse={sp.adresse}
        schadenart={sp.schadenart}
        schuldfrage={sp.schuldfrage}
      />

      {/* Crawl-Pfad — loest die Linkleiste ab und verbessert sie in zwei Punkten:
          statt 7 ausgewaehlter Staedte sind ALLE 173 verlinkt, und der Klick
          zieht den Kunden nicht mehr aus dem Finder heraus, sondern zentriert
          die Karte auf seine Stadt.

          ⚠ Die Links stehen im server-gerenderten HTML (nur per CSS verborgen),
          nicht hinter `{offen && …}` — sonst waere der SEO-Zweck weg, ohne dass
          die Seite anders aussaehe. */}
      <FinderSprungPanel
        staedte={STAEDTE.map((s) => ({
          slug: s.slug,
          name: s.name,
          bundesland: s.bundesland,
          lat: s.lat,
          lng: s.lng,
        }))}
        ratgeber={[...RATGEBER_LINKS]}
        termine={termineNachStadt}
        labels={{
          staedte: t('sprung_staedte'),
          ratgeber: t('sprung_ratgeber'),
          schliessen: t('sprung_schliessen'),
          hinweis: t('sprung_hinweis'),
          infos: t('sprung_infos'),
        }}
      />
      </main>
</>
  )
}
