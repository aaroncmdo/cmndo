import Link from 'next/link'
import { MapPin, FileSearch, ShieldCheck, ChevronRight, Handshake, CheckCircle2, Scale } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { BghAuthorityGrid } from '@/components/landing/sections/BghAuthorityGrid'
import { ServiceRealitaetSection } from '@/components/landing/sections/ServiceRealitaetSection'
import { TrustBlock } from '@/components/landing/TrustBlock'
import { WHATSAPP_HREF } from '@/lib/seo/jsonld'

// Gebrandete Makler-Kunden-Landeseite (Hub). Verkauft Claimondo als PARTNER des Maklers:
// der Makler bleibt der vertraute Berater, Claimondo ist der Spezialist fuer die Kfz-
// Schadenregulierung. Cinematic-Navy-Hero + Rechtswissen (BGH/§249) + Service + Trust + FAQ.
// Zwei gleichwertige Wege (Gutachter-Finder extern + Anspruch-Check intern) tragen die Makler-
// Attribution (promotion_code_id). Hardcoded Deutsch (Referral-Kontext ist deutsch). Marketing-
// Build -> nicht von den src/**-Token-Ratchets erfasst.
export function MaklerHubLanding({
  firma,
  finderHref,
  anspruchHref,
}: {
  firma: string
  finderHref: string
  anspruchHref: string
}) {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      {/* finderHref an ALLE Finder-CTAs der Seite durchreichen (Header, Sticky-Bar, Service-
          Sektion, Footer). Sonst zeigen die auf den generischen /gutachter-finden und die
          Makler-Attribution (promotion_code_id -> Provision) geht verloren. */}
      <LandingTopbar authenticatedUser={null} finderHref={finderHref} />

      {/* ─── HERO – cinematic navy, Makler als Partner ─── */}
      <section className="relative isolate flex min-h-[38rem] items-center overflow-hidden bg-claimondo-navy text-white md:min-h-[min(80vh,46rem)]">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-claimondo-navy via-claimondo-navy/85 to-claimondo-navy/45"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 78% 22%, rgba(123,163,204,0.28), transparent 55%)',
              'radial-gradient(circle at 12% 80%, rgba(69,115,162,0.20), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-24 text-center sm:px-6">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-md sm:text-sm">
            <Handshake className="h-4 w-4" aria-hidden />
            Empfohlen von {firma}
          </div>
          <h1
            className="text-balance text-[2.4rem] font-bold leading-[1.03] tracking-[-0.02em] [text-shadow:0_1px_24px_rgba(0,0,0,0.25)] sm:text-5xl md:text-[3.5rem]"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Nach dem Kfz-Schaden<br />
            <span className="text-claimondo-light-blue">nicht allein.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-white/85 sm:text-lg">
            {firma} arbeitet mit <strong className="font-semibold text-white">Claimondo</strong>,
            Deutschlands Plattform für die Kfz-Schadenregulierung. Unverschuldet? Dann ist die
            komplette Abwicklung für Sie <strong className="font-semibold text-white">kostenlos</strong>{' '}
            – § 249 BGB.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {/* Primaer-CTA: bewusst Weiss-auf-Navy (max. Kontrast) + groesser/fetter — er muss
                den dunklen Header-CTA visuell schlagen, sonst klickt der Kunde den Header. */}
            <a
              href={finderHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-base font-bold text-claimondo-navy shadow-[0_10px_32px_rgba(0,0,0,0.32)] transition-all duration-200 hover:brightness-95 hover:shadow-[0_14px_40px_rgba(0,0,0,0.42)] active:scale-[0.97]"
            >
              <MapPin className="h-5 w-5" aria-hidden /> Gutachter finden
              <ChevronRight className="h-5 w-5" aria-hidden />
            </a>
            <Link
              href={anspruchHref}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              <FileSearch className="h-4 w-4" aria-hidden /> Anspruch prüfen
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/75">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-claimondo-light-blue" aria-hidden /> 0 € für Sie (§ 249)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-claimondo-light-blue" aria-hidden /> Freie Gutachterwahl
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-claimondo-light-blue" aria-hidden /> Unabhängig &amp; neutral
            </span>
          </div>
        </div>
      </section>

      {/* ─── Makler als Partner: das Beste aus beiden Welten ─── */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            Ihr Partner-Vorteil
          </p>
          <h2 className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
            Das Beste aus beiden Welten
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            {firma} ist Ihr vertrauter Ansprechpartner rund um Versicherungen. Für die Kfz-
            Schadenregulierung setzt {firma} auf <strong className="text-claimondo-navy">Claimondo</strong>{' '}
            – den spezialisierten Partner. So haben Sie nach dem Unfall Ihren Berater <em>und</em> ein
            eingespieltes Experten-Team an Ihrer Seite: unabhängiger Gutachter, Partnerkanzlei für
            Verkehrsrecht, digitale Abwicklung – alles aus einer Hand.
          </p>
          <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
            <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-5">
              <Handshake className="h-6 w-6 text-claimondo-ondo" aria-hidden />
              <h3 className="mt-3 text-base font-bold text-claimondo-navy">
                Ihr Makler bleibt an Ihrer Seite
              </h3>
              <p className="mt-1 text-sm text-claimondo-ondo">
                {firma} hat Sie empfohlen und bleibt Ihr persönlicher Ansprechpartner.
              </p>
            </div>
            <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-5">
              <Scale className="h-6 w-6 text-claimondo-ondo" aria-hidden />
              <h3 className="mt-3 text-base font-bold text-claimondo-navy">
                Ihr gutes Recht – durchgesetzt
              </h3>
              <p className="mt-1 text-sm text-claimondo-ondo">
                Unverschuldet zahlen Sie 0 € – die Gegnerseite trägt Gutachter, Anwalt &amp; Reparatur.
              </p>
            </div>
            <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-5">
              <ShieldCheck className="h-6 w-6 text-claimondo-ondo" aria-hidden />
              <h3 className="mt-3 text-base font-bold text-claimondo-navy">Neutral &amp; unabhängig</h3>
              <p className="mt-1 text-sm text-claimondo-ondo">
                Ihr Gutachter arbeitet für Sie – nicht für die Versicherung des Unfallgegners.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Zwei gleichwertige Wege (CTAs, makler-attribuiert) ─── */}
      <section className="bg-claimondo-bg pb-6 pt-2">
        <div className="mx-auto grid max-w-3xl gap-4 px-5 sm:grid-cols-2">
          <a
            href={finderHref}
            className="group flex flex-col rounded-ios-lg border border-claimondo-border bg-white p-6 text-left shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy/10 text-claimondo-navy">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-bold text-claimondo-navy">Gutachter finden &amp; Termin</h3>
            <p className="mt-1 flex-1 text-sm text-claimondo-ondo">
              Unabhängigen Kfz-Sachverständigen in Ihrer Nähe finden und direkt einen Termin buchen.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-navy">
              Jetzt starten
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </a>
          <Link
            href={anspruchHref}
            className="group flex flex-col rounded-ios-lg border border-claimondo-border bg-white p-6 text-left shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-claimondo-navy/10 text-claimondo-navy">
              <FileSearch className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-4 text-lg font-bold text-claimondo-navy">Anspruch prüfen</h3>
            <p className="mt-1 flex-1 text-sm text-claimondo-ondo">
              In wenigen Fragen: Welche Ansprüche stehen Ihnen nach dem Unfall zu? Kostenlos &amp; unverbindlich.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-claimondo-navy">
              Anspruch prüfen
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </div>
      </section>

      {/* ─── Rechtswissen: BGH stützt Ihre Ansprüche ─── */}
      <BghAuthorityGrid
        headline="Ihre Rechte nach dem unverschuldeten Unfall"
        subline="Der BGH stützt jeden dieser Ansprüche – Claimondo setzt sie für Sie durch."
      />

      {/* ─── Service: was Claimondo für Sie übernimmt ─── */}
      <ServiceRealitaetSection finderHref={finderHref} />

      {/* ─── Trust: anerkannte Partner ─── */}
      <TrustBlock heading="Mit anerkannten Partnern" />

      {/* ─── FAQ (makler-tailored) ─── */}
      <FaqMakler firma={firma} />

      {/* ─── Final CTA ─── */}
      <section className="bg-claimondo-navy py-16 text-center text-white">
        <div className="mx-auto max-w-2xl px-5">
          <h2
            className="text-2xl font-bold sm:text-3xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {firma} und Claimondo kümmern sich.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-white/80">
            Starten Sie jetzt – kostenlos und unverbindlich.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={finderHref}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-claimondo-light-blue px-6 py-3 text-sm font-semibold text-claimondo-navy transition hover:brightness-105"
            >
              <MapPin className="h-4 w-4" aria-hidden /> Gutachter finden
            </a>
            <Link
              href={anspruchHref}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              <FileSearch className="h-4 w-4" aria-hidden /> Anspruch prüfen
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter finderHref={finderHref} />
      <StickyCallBar quelle="Makler-Empfehlung (/m)" whatsappHref={WHATSAPP_HREF} finderHref={finderHref} />
    </div>
  )
}

// FAQ — freie Gutachterwahl / 0 € / Makler-Partner-Rolle. Copy aus den Rechts-Seiten
// (versicherung-schickt-gutachter, unverschuldeter-unfall-rechte); RDG-konforme Formulierung
// (0 € vorbehaltlich Anerkenntnis; Rechtsdurchsetzung = Partnerkanzlei).
function FaqMakler({ firma }: { firma: string }) {
  const faqs = [
    {
      q: 'Kostet mich die Schadenregulierung etwas?',
      a: 'Bei einem unverschuldeten Unfall zahlen Sie 0 € – Gutachter, Reparatur und Anwalt trägt die gegnerische Haftpflichtversicherung (§ 249 BGB, vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
    },
    {
      q: 'Muss ich den Gutachter der gegnerischen Versicherung akzeptieren?',
      a: 'Nein. Sie haben die freie Wahl des Kfz-Sachverständigen (§ 249 BGB, BGH VI ZR 67/06). Ein unabhängiger Gutachter arbeitet für Sie – nicht für die Versicherung des Unfallgegners.',
    },
    {
      q: 'Was hat mein Makler mit Claimondo zu tun?',
      a: `${firma} ist Ihr vertrauter Ansprechpartner für Versicherungen und hat Sie an Claimondo empfohlen – den spezialisierten Partner für die Kfz-Schadenregulierung. Ihr Makler bleibt an Ihrer Seite, Claimondo übernimmt die Abwicklung.`,
    },
    {
      q: 'Wer kümmert sich um den rechtlichen Teil?',
      a: 'Die rechtliche Durchsetzung übernimmt unsere Partnerkanzlei für Verkehrsrecht. Claimondo koordiniert den gesamten Ablauf für Sie – von der Gutachtenbeauftragung bis zur Auszahlung.',
    },
  ]
  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby="makler-faq-heading">
      <div className="mx-auto max-w-3xl px-5">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            Häufige Fragen
          </p>
          <h2
            id="makler-faq-heading"
            className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl"
          >
            Gut zu wissen
          </h2>
        </div>
        <div className="mt-8 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-ios-lg border border-claimondo-border bg-claimondo-bg p-5"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-base font-semibold text-claimondo-navy">
                {f.q}
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
