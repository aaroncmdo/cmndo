import type { Metadata } from 'next'
import Script from 'next/script'
import { ladeAktiveSVs, ladeSvLeads } from '@/lib/actions/gutachter-finder-actions'
import { unionIsochrones } from '@/lib/mapbox/union-isochrones'
import { FinderMap } from './_components/FinderMap'
import { FinderWizard } from './_components/FinderWizard'
import { ConsentBridge } from './_components/ConsentBridge'
import { SCHADEN_OPTIONEN } from './_lib/schadenarten'
import { pruefeSchuldfrage } from '@/lib/geo-deeplink/schuldfrage'

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
    /** GEO-Deep-Link: ISO-Start des genannten Termins (nur mit sv sinnvoll). */
    slot?: string
    /** `utm_source` der Einstiegs-URL (z.B. `chatgpt.com`) — reine Attribution. */
    utm_source?: string
    /** GEO-Deep-Link: Standort des Fahrzeugs, den die KI im Gespraech erfragt hat.
     *  Nur zusammen mit lat/lng wirksam (die Marketing-Seite geocodet ihn dort). */
    adresse?: string
    /** GEO-Deep-Link: die Schadenart aus dem Chat („Parkschaden", „Auffahrunfall", …).
     *  Zusammen mit sv+slot+adresse springt der Wizard direkt zu den Kontaktdaten. */
    schadenart?: string
    /** GEO-Deep-Link: wer den Schaden verursacht hat (`gegner` | `unklar`).
     *  Gesetzt entfaellt im FlowLink der Quali-Schritt. Siehe `@/lib/geo-deeplink/schuldfrage`. */
    schuldfrage?: string
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
  // Gleiche Logik wie oben: der Wert wird nur GEGEN das Matching-Ergebnis geprueft,
  // nie als Kennung vertraut und nie geschrieben.
  const vorauswahlSlot = typeof sp.slot === 'string' ? sp.slot : undefined
  // Attribution, kein Steuerwert: `utm_source` wird nur gespeichert, nie als Kennung
  // vertraut und nie in eine Query gegeben. Laenge gekappt wie in der Anfrage-Spalte
  // (utm_* max 150), damit ein absurd langer Parameter nicht bis zum Insert durchlaeuft.
  const utmSource = typeof sp.utm_source === 'string' ? sp.utm_source.slice(0, 150) : undefined

  // Standort aus dem Deeplink: nur gueltig MIT Koordinaten — der Wizard braucht lat/lng
  // fuers Matching, ein blosser Textwert waere fuer die Engine wertlos. Laenge gekappt,
  // der Wert wird nie als Kennung vertraut und nie in eine Query gegeben.
  const adresseRoh = typeof sp.adresse === 'string' ? sp.adresse.trim().slice(0, 200) : ''
  const vorauswahlAdresse =
    adresseRoh && initialCenter ? { adresse: adresseRoh, lat: initialCenter.lat, lng: initialCenter.lng } : null

  // Vorname des im Deeplink genannten Gutachters — NUR zur Anzeige („Ihr Termin bei Gaith").
  //
  // ⚠ Warum das noetig ist: `sv`/`slot` wirken erst NACH dem Matching (waehleVorauswahl /
  // versucheSlotVorauswahl), und das Matching startet erst, wenn ein Ort gesetzt ist. Kommt
  // der Kunde ohne `adresse=` — der Normalfall, denn die Stadtseite kennt nur die Stadt —,
  // sieht er einen voellig leeren Wizard: kein Gutachter, kein Termin, kein Hinweis. Genau
  // das meldete Aaron am 25.08.2026: „durch den link wird nicht gebucht, es wird schlicht
  // nichts gemacht." Die Werte waren die ganze Zeit da, nur unsichtbar.
  //
  // Der Name kommt aus der ohnehin geladenen Partnerliste — kein zusaetzlicher Query. Ist
  // die ID unbekannt (abgelaufener/erfundener Link), bleibt er null und der Hinweis nennt
  // nur den Termin. Nie ein Fehler, nie eine leere Seite.
  const vorauswahlSvName = vorauswahlSv
    ? (svs.find((s) => s.id === vorauswahlSv)?.vorname ?? null)
    : null

  // Schadenart aus dem Chat — der letzte Schritt, den der Kunde sonst doppelt gehen muss.
  //
  // Aaron 25.08.2026: „der kunde direkt im letzten schritt des forms landet und nur noch
  // name adresse und telefonnummer eingeben muss". Kennt die KI Ort, Gutachter, Termin UND
  // Schadenart, ist jede Frage des Wizards bereits beantwortet — ihn trotzdem durchklicken
  // zu lassen, fragt dieselben Dinge ein zweites Mal.
  //
  // ⚠ Gegen die feste Optionsliste validiert, nicht durchgereicht: der Wert landet als
  // `notiz` am Lead und wird dort gelesen. Ein Freitext aus einer URL waere eine offene
  // Tuer — ein unbekannter Wert faellt still auf `null` und der Wizard fragt normal.
  // Vergleich case-insensitive, damit `parkschaden` genauso trifft wie `Parkschaden`.
  const schadenartRoh = typeof sp.schadenart === 'string' ? sp.schadenart.trim().toLowerCase() : ''
  const vorauswahlSchadenart =
    SCHADEN_OPTIONEN.find((o) => o.toLowerCase() === schadenartRoh) ?? null

  // Schuldfrage aus dem Chat — spart im FlowLink einen ganzen Schritt (der Quali-Step
  // faellt bei gesetztem `lead.schuldfrage` aus dem Wizard) und verbessert zugleich die
  // Datenqualitaet: die KI hat die Frage im Gespraech ohnehin geklaert.
  //
  // ⚠ Nur `gegner`/`unklar` — die Schnittmenge der CHECK-Constraints von gfa und leads.
  // Ein Wert ausserhalb liefe beim Promote in einen stillen Reject. Begruendung samt
  // gemessener Constraint-Werte in `@/lib/geo-deeplink/schuldfrage`.
  const vorauswahlSchuldfrage = pruefeSchuldfrage(sp.schuldfrage)

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
            vorauswahlSlotStart={vorauswahlSlot}
            utmSource={utmSource}
            vorauswahlAdresse={vorauswahlAdresse}
            vorauswahlSvName={vorauswahlSvName}
            vorauswahlSchadenart={vorauswahlSchadenart}
            vorauswahlSchuldfrage={vorauswahlSchuldfrage}
          />
        }
      />
    </>
  )
}
