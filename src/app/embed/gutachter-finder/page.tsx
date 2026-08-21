import type { Metadata } from 'next'
import Script from 'next/script'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { unionIsochrones } from '@/lib/mapbox/union-isochrones'
import { FinderMap } from './_components/FinderMap'
import { FinderWizard } from './_components/FinderWizard'
import { ConsentBridge } from './_components/ConsentBridge'

// AAR-956 — Gutachter-Finder Embed (Haupt-App, standalone, iframe-baar).
// Zieht den Finder aus der Marketing-App hierher → direkter Termin-Engine-Zugriff,
// design-token-konform, per <iframe> auf claimondo.de + beliebigen Seiten einbettbar.
//
// WS1a: Datenschicht WIEDERVERWENDET — ladeAktiveSVs/ladeSvLeads (leak-safe, Google-Reviews).
// WS1b: Karten-UI <FinderMap> aus der Marketing-Karte portiert (next-intl → inline DE).
// WS2: Profil-ueber-Pin + GoogleBewertungBadge. WS3: empfohlener SV + Route/Zoom.
// WS4 + Reorder: 4-Step-Wizard (Ort → Termin → Schaden → Kontakt) füllt den wizardSlot;
// Termin-Wahl token-los via ladeEmbedMatching, Reservierung beim Kontakt-Submit.

export const metadata: Metadata = {
  // Embed nicht separat indexiert — /gutachter-finden (Marketing) ist die SEO-Flaeche.
  robots: { index: false, follow: false },
}

export default async function GutachterFinderEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{
    lat?: string
    lng?: string
    zoom?: string
    fallback?: string
    schaetzung?: string
    /** GEO-Deep-Link: profiles.id des im Chat/Verzeichnis genannten Gutachters. */
    sv?: string
  }>
}) {
  const sp = await searchParams

  // Reuse: dieselben Loader wie die public sv-in-naehe-API + die Marketing-Karte.
  // P2-T7 (K11): ladeAktiveSVs traegt einen Owner-Injektions-Seam ({ ownerProfilId }) fuer den
  // relationalen "Dein Netzwerk"-Boost. Diese Embed-URL hat v1 KEINE Attribution in den
  // searchParams (lat/lng/zoom/fallback/schaetzung) und der anon-Finder keinen Session-Owner
  // -> bewusst OHNE Owner (nur das globale istNetzwerkpartner-Badge). Sobald ein attribuierter
  // Einstieg existiert (Werkstatt-QR ?werkstatt= / Makler-Link), dessen Entity -> profiles.id
  // aufloesen und hier injizieren. Makler sind v1 kein Graph-Knoten (Owner haette 0 Freunde).
  const [aktiveRes, leadsRes] = await Promise.all([ladeAktiveSVs(), ladeSvLeads()])
  const svs = aktiveRes.ok ? aktiveRes.data : []
  const leadPins = leadsRes.ok ? leadsRes.data : []

  // Perf: die Partner-Isochronen (~10k Vertices/SV) server-seitig zu EINER Coverage-
  // Flaeche vereinen — sonst liefe @turf/union client-seitig (~1.6s Freeze bei 6 SVs,
  // waechst mit dem Netz). isochrone_polygon danach aus dem Client-Payload strippen
  // (nur die Union wird gerendert; der Nearest-SV-Check laeuft server via empfehleSvFuerOrt).
  const coverageUnion = unionIsochrones(svs.map((s) => s.isochrone_polygon))
  const svsLight = svs.map(({ isochrone_polygon: _iso, ...rest }) => rest)

  // WS6: Optionales Start-Zentrum aus der iframe-URL (?lat&lng[&zoom]). Die
  // einbettende Marketing-Seite reicht ihr server-geocodetes ?stadt/?plz als
  // lat/lng durch → FinderMap zentriert vor + unterdrueckt die Geolocation-Abfrage.
  const latN = sp.lat ? Number(sp.lat) : NaN
  const lngN = sp.lng ? Number(sp.lng) : NaN
  const initialCenter =
    Number.isFinite(latN) && Number.isFinite(lngN) ? { lat: latN, lng: lngN } : null
  const zoomN = sp.zoom ? Number(sp.zoom) : NaN
  const initialZoom = Number.isFinite(zoomN) ? zoomN : undefined

  // Anspruch-pruefen handoff: schaetzung=<sessionToken> → FinderWizard verknuepft Buchung mit Schaetzung.
  const schaetzung = typeof sp.schaetzung === 'string' ? sp.schaetzung : undefined

  // GEO-Deep-Link: `?sv=<profiles.id>` — der Gutachter, den eine KI-Antwort (oder ein
  // Verzeichnis-Link) bereits genannt hat. Wird NUR als Vorauswahl im Wizard genutzt und
  // ausschliesslich gegen das Matching-Ergebnis geprueft (waehleVorauswahl) — ein
  // unbekannter/abgelaufener Wert faellt still auf den bestgerankten SV zurueck. Deshalb
  // reicht hier dieselbe schlichte Typpruefung wie bei `schaetzung`: der Wert wird nie
  // als Kennung vertraut, nie geschrieben und nie in eine Query gegeben.
  const vorauswahlSv = typeof sp.sv === 'string' ? sp.sv : undefined

  // AAR-956: GTM-Container im iframe (env-gegated). Lädt NUR wenn `GF_GTM_ID` gesetzt ist (auf
  // app.claimondo.de / VPS Portal :3000) → die dataLayer-Pushes aus tracking.ts erreichen GTM →
  // GA4 + Google Ads (Conversion-ID 18202744855). Ohne ENV = no-op (nichts lädt). AAR-956 Consent
  // Mode v2: consent-default=denied läuft VOR gtm.js (im Script unten); <ConsentBridge> hebt nach
  // Parent-Einwilligung via gtag('consent','update') an. Siehe docs/12.06.2026/AAR-956-CONVERSION-EMBEDDING-SETUP.md.
  //
  // BEWUSST NICHT-öffentliches `GF_GTM_ID` (kein NEXT_PUBLIC_): diese Server-Component ist dynamisch
  // (await searchParams + Daten-Fetch → `ƒ`), liest die Var also pro Request zur LAUFZEIT und rendert
  // den Script server-seitig in die HTML. So ist die Container-ID runtime-konfigurierbar (Var setzen
  // + Restart, KEIN Rebuild) — NEXT_PUBLIC_* wäre build-time-inlined (Footgun: runtime-Set ohne
  // Rebuild lädt still nie). Der Wert ist ohnehin nicht geheim (steht im Client-HTML).
  const gtmId = process.env.GF_GTM_ID

  return (
    <>
      {gtmId ? (
        <Script id="gf-gtm" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',security_storage:'granted',wait_for_update:500});(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}
      <ConsentBridge />
      <FinderMap
        svLeads={leadPins}
        aktiveSVs={svsLight}
        coverageUnion={coverageUnion}
        height="100dvh"
        initialCenter={initialCenter}
        initialZoom={initialZoom}
        forceFallback={sp.fallback === '1'}
        wizardSlot={
          <FinderWizard
            forceFallback={sp.fallback === '1'}
            schaetzungSessionId={schaetzung}
            vorauswahlSvId={vorauswahlSv}
          />
        }
      />
    </>
  )
}
