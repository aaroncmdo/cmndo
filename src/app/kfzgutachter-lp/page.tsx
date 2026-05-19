import type { Metadata } from 'next'
import Image from 'next/image'
import Script from 'next/script'
import {
  Phone,
  MessageCircle,
  ShieldCheck,
  Clock,
  Scale,
  BadgeCheck,
  ChevronRight,
  ArrowRight,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { TrackingHooks } from '@/components/marketing/TrackingHooks'
import { LeadFormClient } from './LeadFormClient'
import { GoogleReviewsStrip } from './GoogleReviewsStrip'
import { LiveCountPill } from './LiveCountPill'
import { ScrollPopoverClient } from './ScrollPopoverClient'
import { WarumCardsClient } from './WarumCardsClient'
import { resolveStadt } from './resolve-stadt'
import { LP_VARIANT, SOURCE } from './track'
import { TEL_HREF, TEL_DISPLAY, WA_HREF } from './constants'

// ── kfzgutachter.claimondo.de — Ads-Landeseite (A/B-Test Variante B) ──────
// noindex (reine Paid-Traffic-Seite, kein Duplicate-Content zur Hauptdomain).
// Archetyp A „Formular-First": Lead-Formular über der Mobile-Falte (684 px).
// Grundlage: docs/18.05.2026/ — A/B-Test-Plan §A/§D + Conversion-Leakage-Hebel.
//
// Stadt-Insertion: ?stadt=<slug> oder UTM-Substring → Hero personalisiert.
// SEO/GEO-Anreicherung (noindex-tauglich): konkrete BGH-Aktenzeichen +
// §249 BGB als Trust-Signale, autoritative Sprache, Answer-First-Struktur.
// UWG-konform: Methodik-Note bei aggregierten Kennzahlen.

export const metadata: Metadata = {
  title: 'Kfz-Gutachter nach Unfall — unabhängig & kostenfrei | Claimondo',
  description:
    'Unverschuldeter Unfall? Unabhängiger DAT-zertifizierter Kfz-Gutachter vor Ort in unter 48 Stunden. Anwaltlich durchgesetzt, 0 € für Unverschuldete (§249 BGB).',
  robots: { index: false, follow: false },
}

const MONTSERRAT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
// WhatsApp-Brand-Grün — whitelisted in src/lib/external-brand-colors.ts (Meta-Brand-Guidelines).
// /70-Variante für Glass-Look (Hero-Buttons + Sticky-Pills) — der Backdrop-Blur
// lässt den Hero-Image-Background durchschimmern, /70 statt /85 bringt den
// Glass-Effekt auf das gleiche Niveau wie die Topbar. Hover füllt auf solides
// #25D366, damit der Brand-Hit auf Interaktion klar erhalten bleibt.
const WA_BG = 'bg-[#25D366]/70 hover:bg-[#25D366]'

// ──────────────────────────────────────────────────────────────────────────

function Logo({ className = 'h-7 w-auto sm:h-8' }: { className?: string }) {
  return (
    <Image
      src="/kfzgutachter-lp/logo.png"
      alt="Claimondo"
      width={2144}
      height={456}
      priority
      className={className}
    />
  )
}

function Topbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/30 bg-white/55 shadow-glass-card backdrop-blur-md supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:h-16 sm:px-8">
        <Logo />
        <a
          href={TEL_HREF}
          data-tracking="call-topbar"
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-claimondo-navy/85 px-4 py-2 text-sm font-bold text-white shadow-glass-card backdrop-blur-md transition-colors hover:bg-claimondo-navy"
        >
          <Phone className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{TEL_DISPLAY}</span>
          <span className="sm:hidden">Anrufen</span>
        </a>
      </div>
    </header>
  )
}

const HERO_BULLETS: { label: string; Icon: LucideIcon }[] = [
  { label: 'DAT-zertifizierte Gutachter', Icon: ShieldCheck },
  { label: 'Termin in unter 48 Stunden', Icon: Clock },
  { label: 'Anwaltlich durchgesetzt', Icon: Scale },
  { label: 'Live-Status im Kundenportal', Icon: BadgeCheck },
]

function Hero({ stadtName }: { stadtName?: string }) {
  return (
    <section className="relative isolate overflow-hidden bg-claimondo-navy">
      <Image
        src="/kfzgutachter-lp/hero-unfall-frau.png"
        alt="Frau telefoniert nach einem unverschuldeten Verkehrsunfall neben ihrem beschädigten Auto"
        fill
        priority
        sizes="100vw"
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAICAIAAABPmPnhAAAACXBIWXMAAAsTAAALEwEAmpwYAAABA0lEQVR4nAH4AAf/AI2CeJCEfJqPiKuhnLu0r8fBvMjCvL64sbCpoaSckwCBdGmDdWuLfXWYjIalnZeup6SsqKSjn5qWkoyLhoAAemtgeGlfe2xkgnVviYB7joiFi4iGgoB/d3Zzb21pAHhpYHJiWW5fV21gWm1kYGxnZmhmZ2FiY1paWlVVVAB6bGVvYVllV09cUEpUTElPS0tKSUtGR0lDQ0VBQUIAfHBrb2JcYFNNUUZBRD06PDg4NzY3NjY4NTY4Nzc4AHxxbW5iXVxQS0tBPTw1MzIuLi0sLC4tLi8vMDMyMgB3bWlqXlpZTklIPzs5MzAvKyorKSksKysvLi40MzMOBF6p89fw6AAAAABJRU5ErkJggg=="
        className="object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-claimondo-navy/97 via-claimondo-navy/88 to-claimondo-navy/60"
      />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-5 px-5 pb-10 pt-5 sm:gap-8 sm:px-8 sm:py-12 md:grid-cols-[1.04fr_0.96fr] md:items-center md:gap-10 md:py-16">
        <div className="text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue sm:text-xs">
            Unverschuldeter Unfall in {stadtName ?? 'NRW'}?
          </p>
          <a
            href="#lead-form"
            data-tracking="form-headline"
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-light-blue focus-visible:ring-offset-4 focus-visible:ring-offset-claimondo-navy rounded-md"
          >
            <h1
              className="mt-2 text-balance text-[1.7rem] font-extrabold leading-[1.12] tracking-[-0.02em] sm:mt-3 sm:text-[2.4rem] md:text-5xl"
              style={MONTSERRAT}
            >
              {stadtName ? (
                <>
                  Ihr Kfz-Gutachter in{' '}
                  <span className="text-claimondo-light-blue">{stadtName}</span>.
                </>
              ) : (
                <>
                  Ihr <span className="text-claimondo-light-blue">Kfz-Gutachter</span> nach dem
                  Unfall.
                </>
              )}
            </h1>
          </a>
          <p className="mt-2.5 max-w-lg text-[14px] leading-relaxed text-white/80 sm:mt-4 sm:text-base">
            Unabhängiger DAT-Gutachter vor Ort in unter 48 Stunden — anwaltlich durchgesetzt nach §249 BGB.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20 sm:mt-4 sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-sm">
            <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400 sm:h-4 sm:w-4" aria-hidden />
            0 € für Unverschuldete · Anwalt kostenfrei inklusive
          </p>
          <LiveCountPill />
          <br className="md:hidden" />
          <ul className="mt-5 hidden grid-cols-2 gap-x-5 gap-y-2.5 md:grid">
            {HERO_BULLETS.map(({ label, Icon }) => (
              <li key={label} className="flex items-center gap-2 text-sm text-white/85">
                <Icon className="h-4 w-4 flex-shrink-0 text-claimondo-light-blue" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2.5 sm:mt-6 sm:gap-3">
            <a
              href={TEL_HREF}
              data-tracking="call-hero"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/55 px-5 py-3 text-sm font-bold text-white backdrop-blur-md transition-colors hover:bg-white/75 hover:text-claimondo-navy active:scale-[0.98] sm:px-6 sm:py-3.5 animate-cta-call-pulse"
            >
              <Phone className="h-4 w-4 text-white" aria-hidden />
              {TEL_DISPLAY}
            </a>
            <a
              href={WA_HREF}
              target="_blank"
              rel="noopener noreferrer"
              data-tracking="whatsapp-hero"
              className={`inline-flex items-center gap-2 rounded-full border border-white/30 ${WA_BG} px-5 py-3 text-sm font-bold text-white shadow-glass-card backdrop-blur-md transition-all active:scale-[0.98] sm:py-3.5`}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              WhatsApp
            </a>
          </div>
        </div>
        <div>
          <LeadFormClient />
        </div>
      </div>
    </section>
  )
}

// Trust-Siegel-Strip (Aaron 18.05.2026): 4 belegbare Compliance-Aussagen.
// Bewusst KEINE externen Siegel-Logos (TÜV/eKomi) — wir vermarkten nur was
// wir wirklich haben (UWG §5). Visueller Authority-Boost zwischen Reviews
// und „Warum unabhängig".
const TRUST_SIEGEL: { Icon: LucideIcon; label: string; sub: string }[] = [
  { Icon: Lock, label: 'DSGVO-konform', sub: 'Daten bleiben in der EU' },
  { Icon: ShieldCheck, label: 'SSL-verschlüsselt', sub: 'TLS 1.3 · Ende-zu-Ende' },
  { Icon: Scale, label: 'Freie Anwaltswahl', sub: '§249 BGB · gesetzlich garantiert' },
  { Icon: BadgeCheck, label: '0 € Eigenanteil', sub: 'Für Unverschuldete · keine Vorkasse' },
]

function TrustSiegelStrip() {
  return (
    <section className="border-y border-claimondo-border bg-white py-9 sm:py-12">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-x-6">
          {TRUST_SIEGEL.map(({ Icon, label, sub }) => (
            <div key={label} className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-bg ring-1 ring-claimondo-border">
                <Icon className="h-4 w-4 text-claimondo-ondo" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold leading-tight text-claimondo-navy sm:text-sm">
                  {label}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-claimondo-shield/75">
                  {sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TrustBar() {
  const items = [
    '2.000+ vermittelte Fälle',
    '100+ DAT-geprüfte Gutachter',
    '5,0 ★ Google',
    'Anwalt kostenfrei inklusive',
  ]
  return (
    <div className="border-b border-claimondo-border bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-y divide-claimondo-border/70 sm:grid-cols-4 sm:divide-y-0">
        {items.map((it) => (
          <div
            key={it}
            className="px-3 py-3.5 text-center text-xs font-semibold text-claimondo-navy sm:text-sm"
          >
            {it}
          </div>
        ))}
      </div>
    </div>
  )
}

// SEO/GEO-Anreicherung: konkrete BGH-Aktenzeichen + §-Verweise als
// autoritative Quellen (Princeton-GEO „Cite Sources"-Methode, +40%).
// Karten-Inhalte + Reveal-Logik liegen in warum-cards-data.ts +
// WarumCardsClient.tsx (Multi-Open, Hover-Highlight, In-Place-Expand
// mit kontextbezogener Mini-CTA pro Karte).

function WarumUnabhaengig() {
  return (
    <section className="bg-claimondo-bg py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <h2
          className="text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
          style={MONTSERRAT}
        >
          Warum ein unabhängiger Gutachter?
        </h2>
        <WarumCardsClient />
      </div>
    </section>
  )
}

const WAS_WIR: { titel: string; text: string }[] = [
  {
    titel: 'Wir vermitteln einen unabhängigen DAT-Gutachter',
    text: 'Ein DAT-zertifizierter Sachverständiger aus unserem NRW-Netzwerk besichtigt Ihr Fahrzeug vor Ort — meist am Folgetag, in unter 48 Stunden.',
  },
  {
    titel: 'Wir übergeben Ihren Fall an unsere Partnerkanzlei für Verkehrsrecht',
    text: 'Sobald das Gutachten erstellt ist, übernimmt unsere Partnerkanzlei die Kommunikation mit der gegnerischen Versicherung — vollständig und in Ihrem Namen.',
  },
  {
    titel: 'Wir setzen alle Ansprüche durch',
    text: 'Reparaturkosten, Wertminderung, Mietwagen, Nutzungsausfall, Schmerzensgeld — auch wenn die Versicherung kürzt. Kürzungen holt unsere Kanzlei BGH-konform zurück.',
  },
  {
    titel: 'Sie sehen live, was läuft',
    text: 'In unserem Kundenportal verfolgen Sie jeden Schritt — vom Gutachter-Termin bis zur Auszahlung. Ø 32 Tage bis das Geld auf Ihrem Konto ist.',
  },
]

function WasWirMachen() {
  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 md:grid-cols-2 md:items-center md:gap-12">
        <div className="order-2 md:order-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-claimondo-ondo">
            Was wir konkret machen
          </p>
          <h2
            className="mt-3 text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
            style={MONTSERRAT}
          >
            Sie melden den Schaden — wir regeln den Rest.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-claimondo-shield">
            Claimondo ist Ihr Generalunternehmer für die komplette Schadensregulierung
            nach unverschuldetem Unfall. Wir koordinieren Gutachter und Partnerkanzlei,
            Sie bleiben außen vor und sehen live im Portal, was passiert.
          </p>
          <ul className="mt-7 space-y-5">
            {WAS_WIR.map((step, i) => (
              <li key={step.titel} className="flex gap-4">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold text-claimondo-navy">{step.titel}</h3>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-claimondo-shield">
                    {step.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="order-1 md:order-2">
          <div className="overflow-hidden rounded-ios-lg shadow-claimondo-lg">
            <Image
              src="/kfzgutachter-lp/berater.png"
              alt="Claimondo-Berater am Telefon — persönlicher Ansprechpartner für Ihre Schadensregulierung"
              width={1536}
              height={1024}
              sizes="(min-width: 768px) 50vw, 100vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

const NICHT_UNSERE_SACHE = [
  {
    titel: 'Wertgutachten für Verkauf / Versicherungsabschluss',
    text: 'Wenn Sie Ihr Auto verkaufen oder eine neue Versicherung abschließen wollen — dafür sind wir nicht zuständig. Wir kümmern uns ausschließlich um Schadensgutachten nach Verkehrsunfällen.',
  },
  {
    titel: 'Selbstverschuldete Unfälle / Kasko-Schäden',
    text: 'Bei selbstverschuldeten Unfällen über die eigene Vollkasko gibt es keinen Anspruch gegen einen gegnerischen Versicherer — unser Modell „0 € für Geschädigte” greift hier nicht.',
  },
  {
    titel: 'Bagatell-Schäden unter 750 €',
    text: 'Für Schäden unter der BGH-Bagatellgrenze (VI ZR 119/04) reicht in der Regel ein Kostenvoranschlag der Werkstatt. Ein Gutachten lohnt sich erst ab ca. 750 € Schaden.',
  },
]

function WasIstNichtUnsereSache() {
  return (
    <section className="border-t border-claimondo-border bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-claimondo-ondo">
          Damit Sie nicht falsch landen
        </p>
        <h2
          className="mt-3 text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
          style={MONTSERRAT}
        >
          Wann wir <span className="text-claimondo-shield">nicht</span> der richtige Ansprechpartner sind
        </h2>
        <ul className="mt-7 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {NICHT_UNSERE_SACHE.map((item) => (
            <li key={item.titel} className="rounded-ios-md border border-claimondo-border bg-white p-5">
              <h3 className="text-[15px] font-bold text-claimondo-navy">{item.titel}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-claimondo-shield">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

const PROZESS = [
  { nr: '1', titel: 'Schaden melden', text: 'Drei Felder, ohne Anmeldung — online oder telefonisch.' },
  { nr: '2', titel: 'Rückruf in Minuten', text: 'Ihr persönlicher Berater meldet sich in unter 15 Minuten.' },
  { nr: '3', titel: 'Gutachter vor Ort', text: 'DAT-Sachverständiger besichtigt in unter 48 Stunden — meist am Folgetag.' },
  { nr: '4', titel: 'Anwalt setzt durch', text: 'Partnerkanzlei reguliert alle Ansprüche gegen die Versicherung.' },
  { nr: '5', titel: 'Geld auf dem Konto', text: 'Im Schnitt nach 32 Tagen — live im Kundenportal verfolgbar.' },
]

function Prozess() {
  return (
    <section className="bg-claimondo-bg py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2
          className="text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
          style={MONTSERRAT}
        >
          Vom Unfall zur Auszahlung — in 5 Schritten
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {PROZESS.map((s) => (
            <li
              key={s.nr}
              className="cursor-default select-text rounded-ios-md border border-claimondo-border bg-white p-5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-claimondo-navy text-sm font-bold text-white">
                {s.nr}
              </span>
              <h3 className="mt-3 text-[15px] font-bold text-claimondo-navy">{s.titel}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-claimondo-shield">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// NRW-Sektion: Bild enthält Headline + Subline + Karte + Stats — kein
// zusätzlicher Text nötig (Aaron-Review 18.05.2026, vorher redundant).
// Methodik-Note unten dran für UWG-Konformität bei aggregierten Zahlen.
// NrwStandorte — Story-Layout (Aaron-Approved 2026-05-19):
// Linke Spalte (60 %): Headline + Sub + Gutachter-Handshake-Foto als Anchor.
// Rechte Spalte (40 %): NRW-Karte oben, 3 Trust-Bullets, Methodik-Note.
// Princeton-GEO „Statistics + Cite Sources" (+77 %): konkrete Zahlen mit
// transparenter Methodik-Note. „Authoritative Tone": DAT, BGH-fest.
function NrwStandorte() {
  return (
    <section className="bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center md:gap-12">
          {/* Linke Spalte: Headline + Sub + Foto */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-claimondo-ondo">
              Vor Ort in NRW
            </p>
            <h2
              className="mt-3 text-balance text-2xl font-extrabold leading-tight text-claimondo-navy sm:text-3xl"
              style={MONTSERRAT}
            >
              Vor Ort. In ganz NRW. Wir kommen zu Ihnen.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-claimondo-shield">
              100+ DAT-zertifizierte Sachverständige in Köln, Düsseldorf,
              Essen, Dortmund und Bochum. Mobile Besichtigung kostenfrei —
              wir kommen zu Ihnen, kein Werkstatt-Termin, kein Anfahrtsweg.
            </p>
            <div className="mt-6 overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg/40 shadow-claimondo-md">
              <Image
                src="/kfzgutachter-lp/gutachter-handshake.png"
                alt="Claimondo-Gutachter begrüßt Kunden vor Ort am Schaden-Fahrzeug — flächendeckend in NRW."
                width={1400}
                height={933}
                sizes="(min-width: 768px) 56vw, 100vw"
                className="h-auto w-full"
              />
            </div>
          </div>

          {/* Rechte Spalte: Karte + Bullets + Methodik */}
          <div>
            <div className="overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-bg/30">
              <Image
                src="/kfzgutachter-lp/nrw-karte-neu.png"
                alt="Karte von Nordrhein-Westfalen mit Claimondo-Standorten Köln, Düsseldorf, Essen, Dortmund und Bochum."
                width={1200}
                height={687}
                sizes="(min-width: 768px) 38vw, 100vw"
                className="h-auto w-full"
              />
            </div>
            <ul className="mt-6 space-y-3">
              {[
                { wert: '2.000+', label: 'vermittelte Fälle seit Gründung' },
                { wert: 'Ø 32 Tage', label: 'von Unfall bis Auszahlung' },
                { wert: '100+', label: 'geprüfte Gutachter im NRW-Netzwerk' },
              ].map((r) => (
                <li key={r.label} className="flex items-baseline gap-3">
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                      className="h-3 w-3"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 010 1.42l-7.99 7.99a1 1 0 01-1.42 0L3.3 10.7a1 1 0 011.42-1.42l3.28 3.28 7.28-7.28a1 1 0 011.42 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <span className="text-sm leading-snug text-claimondo-navy">
                    <strong className="font-extrabold">{r.wert}</strong>{' '}
                    <span className="text-claimondo-shield">{r.label}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[11px] leading-relaxed text-claimondo-shield/60">
              Aggregierte Auswertung aller über das Claimondo-Partner-Netzwerk
              vermittelten Fälle. Stand 05/2026.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// SEO/GEO-Anreicherung im FAQ: konkrete Aktenzeichen + §-Verweise +
// Branchen-Pruefdienst-Namen. Princeton-GEO „Statistics + Cite Sources" (+77%).
const FAQS = [
  {
    q: 'Was kostet ein Kfz-Gutachter nach einem Unfall?',
    a: 'Bei einem unverschuldeten Unfall mit Schaden über 750 € trägt die gegnerische Haftpflichtversicherung die Gutachterkosten vollständig nach §249 BGB (Naturalrestitution). Honorare richten sich nach der BVSK-Honorartabelle und liegen je nach Schadenshöhe zwischen 600 € und 2.400 €. Für Sie bleibt 0 € Eigenanteil.',
  },
  {
    q: 'Wie schnell ist ein Gutachter vor Ort?',
    a: 'In der Regel innerhalb von 48 Stunden, häufig schon am Folgetag. Ihr persönlicher Berater meldet sich nach Ihrem Anruf in unter 15 Minuten zurück und stimmt den Termin direkt mit Ihnen ab.',
  },
  {
    q: 'Was ist eine Sicherungsabtretung?',
    a: 'Sie treten den Anspruch in Höhe des Gutachterhonorars an den Sachverständigen ab — der rechnet anschließend direkt mit der gegnerischen Versicherung ab. Sie unterzeichnen einmal und zahlen nichts vor. Branchen-Standard bei unverschuldetem Unfall.',
  },
  {
    q: 'Kann die Versicherung das Gutachten kürzen?',
    a: 'Versicherer wie HUK, LVM oder AXA beauftragen Prüfdienstleister (ControlExpert, K-Expert, DEKRA) und kürzen häufig UPE-Aufschläge, Verbringungskosten und Wertminderung. Der BGH stützt jedoch in den Leitentscheidungen VI ZR 65/18, VI ZR 174/24 und VI ZR 38/22 ff. die Geschädigten — unsere Partnerkanzlei holt die Kürzungen BGH-konform zurück.',
  },
  {
    q: 'Wie viel Wertminderung bekomme ich?',
    a: 'Die merkantile Wertminderung liegt nach der Sanden/Danner-Formel typischerweise zwischen 500 € und 2.500 €, abhängig von Fahrzeugalter, Laufleistung und Reparaturkosten. Faustregel: 1. Jahr ≈ 25 % der Reparaturkosten als Wertminderung, 2. Jahr 20 %, 3. Jahr 15 %, 4. Jahr 10 %. Eine starre Altersgrenze lehnt der BGH ab (VI ZR 357/03).',
  },
]

function Faq() {
  return (
    <section className="bg-claimondo-bg py-14 sm:py-20">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <h2
          className="text-balance text-2xl font-extrabold text-claimondo-navy sm:text-3xl"
          style={MONTSERRAT}
        >
          Häufige Fragen
        </h2>
        <div className="mt-7 space-y-3">
          {FAQS.map((f) => (
            <details
              key={f.q}
              className="group rounded-ios-md border border-claimondo-border bg-white p-4 sm:p-5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold text-claimondo-navy">
                {f.q}
                <ChevronRight
                  className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90"
                  aria-hidden
                />
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-claimondo-shield">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function CtaFooter() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-14 text-center text-white sm:py-20">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 30% 25%, rgba(123,163,204,0.22), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-2xl px-5">
          <h2 className="text-balance text-2xl font-bold sm:text-3xl" style={MONTSERRAT}>
            Schaden gehabt? Wir regeln das.
          </h2>
          <p className="mt-3 text-white/75">Melden Sie sich jetzt — Rückruf in unter 15 Minuten.</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#lead-form"
              data-tracking="form-cta"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-claimondo-md transition-all hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              Schaden melden
              <ArrowRight className="h-5 w-5 text-claimondo-ondo" aria-hidden />
            </a>
            <a
              href={TEL_HREF}
              data-tracking="call-cta"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/90 transition-all hover:border-white/55 hover:bg-white/10"
            >
              <Phone className="h-5 w-5" aria-hidden />
              {TEL_DISPLAY}
            </a>
          </div>
        </div>
      </section>
      <footer className="border-t border-claimondo-border bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 py-7 text-center text-xs text-claimondo-shield/70 sm:flex-row sm:justify-between sm:text-left">
          <Logo className="h-6 w-auto" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="https://claimondo.de/impressum" className="hover:text-claimondo-navy">
              Impressum
            </a>
            <a href="https://claimondo.de/datenschutz" className="hover:text-claimondo-navy">
              Datenschutz
            </a>
            <a href={TEL_HREF} className="hover:text-claimondo-navy">
              {TEL_DISPLAY}
            </a>
          </div>
          <span>© {new Date().getFullYear()} Claimondo</span>
        </div>
      </footer>
    </>
  )
}

// Floating-Glass-Cards (Aaron 18.05.2026): drei schwebende Pills auf Mobile
// statt einer edge-to-edge-Bar. Glass-Tokens aus globals.css:
//   bg-white/70 + backdrop-blur-md  →  iOS-Glass-Look
//   shadow-glass-card               →  --shadow-glass-card (4px 20px navy/6%)
//   border-white/60                 →  weiche Glass-Kante
// Höhe kompakt (~52 px) — passt unter den 72-px-Cookie-Banner-Offset.
function StickyMobileCta() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex items-stretch justify-center gap-2 px-3 md:hidden">
      <a
        href={TEL_HREF}
        data-tracking="call-sticky"
        className="pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-3 text-xs font-bold text-claimondo-navy shadow-glass-card backdrop-blur-md transition-all hover:bg-white/85 active:scale-[0.97]"
      >
        <Phone className="h-4 w-4" aria-hidden />
        Anrufen
      </a>
      <a
        href={WA_HREF}
        target="_blank"
        rel="noopener noreferrer"
        data-tracking="whatsapp-sticky"
        className={`pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-full ${WA_BG} px-3 py-3 text-xs font-bold text-white shadow-glass-card backdrop-blur-md transition-all active:scale-[0.97]`}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        WhatsApp
      </a>
      <a
        href="#lead-form"
        data-tracking="form-sticky"
        className="pointer-events-auto flex flex-1 items-center justify-center gap-1.5 rounded-full bg-claimondo-navy px-3 py-3 text-xs font-bold text-white shadow-glass-card backdrop-blur-md transition-all hover:bg-claimondo-shield active:scale-[0.97]"
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        Formular
      </a>
    </div>
  )
}

// Google Tag Manager — Container GTM-KZNCZB2Z. LP-isoliert: laeuft nur
// auf /kfzgutachter-lp, nicht auf der Hauptdomain (Marketing-Seiten haben
// ihren eigenen GA4-Setup im RootLayout). Script wird ueber Next-Script
// mit strategy="afterInteractive" gemounted — landet damit im <head>,
// blockiert aber das First-Paint nicht.
const GTM_ID = 'GTM-KZNCZB2Z'

export default async function KfzgutachterLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const stadt = resolveStadt(await searchParams)
  return (
    <div className="min-h-screen bg-white pb-[76px] md:pb-0">
      {/* GTM <head>-Snippet — laedt googletagmanager.com/gtm.js und
          initialisiert dataLayer. Vor allem anderen rendern damit Tags
          ab dem ersten User-Interaktion-Event greifen koennen. */}
      <Script
        id="gtm-head"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
        }}
      />
      {/* GTM <noscript>-Fallback — fuer User mit blockiertem JS triggern
          die Tags trotzdem ueber das iframe. Direkt nach dem Wurzel-Div
          gerendert, damit es im body so weit oben wie moeglich landet. */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="Google Tag Manager"
        />
      </noscript>

      <Topbar />
      <main>
        <Hero stadtName={stadt?.name} />
        <TrustBar />
        <GoogleReviewsStrip />
        <WarumUnabhaengig />
        <WasWirMachen />
        <WasIstNichtUnsereSache />
        <Prozess />
        <NrwStandorte />
        {/* TrustSiegelStrip (DSGVO/SSL/Anwalt/0 €) zieht nach unten:
            kurz vor FAQ — dient als Beruhigung direkt vor dem letzten
            Conversion-Push am Seitenende. */}
        <TrustSiegelStrip />
        <Faq />
        <CtaFooter />
      </main>
      <StickyMobileCta />
      <ScrollPopoverClient />
      <TrackingHooks lpVariant={LP_VARIANT} source={SOURCE} />
    </div>
  )
}
