import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  OG_DEFAULT_IMAGES,
  SITE_URL,
  breadcrumbsSchema,
  jsonLdScript,
} from '@/lib/seo/jsonld'
import { localeAlternates } from '@/lib/seo/alternates'
import { GewinnspielFormClient } from './GewinnspielFormClient'
import { PraemienFaecher } from './PraemienFaecher'

// ── /gewinnspiel — Kampagnen-Landeseite (Social-Ad-Ziel + Topbar-Ziel) ──────
//
// Spec: docs/superpowers/specs/2026-08-23-gewinnspiel-tankgutschein-design.md
//
// Liegt UNTER app/[locale]/, obwohl sie eine reine de-Kampagnenseite ist.
// Das ist keine Stilfrage, sondern Pflicht: die Middleware schreibt JEDEN
// unpraefixierten Pfad intern auf `/de/<pfad>` um (middleware.ts:106-108).
// Eine Seite unter app/gewinnspiel/ waere auf claimondo.de/gewinnspiel also
// 404 — sichtbar erst im echten Request, nicht im Build oder Routen-Manifest
// (dieselbe Klasse wie der .well-known-Vorfall).
//
// Die Texte stehen bewusst hart im Markup statt in den Messages: eine
// Kampagnenseite braucht keine 6-Sprachen-Paritaet, und ein neuer Key nur in
// de.json wuerde das i18n-Gate reissen. Folge: /en/gewinnspiel zeigt deutsche
// Texte. Fuer eine deutsche Social-Kampagne akzeptiert.
//
// Gestaltung (Register „brand"): Die Szene ist jemand mit frischem Blechschaden,
// abends am Handy, aus TikTok kommend. Daraus folgt die dunkle Flaeche — der
// Besucher kommt aus einer dunklen App, eine grellweisse Seite ist ein Bruch im
// Message Match. Der naheliegende Kategorie-Reflex „Versicherung = Navy + Gold,
// serioes" ist bewusst verworfen; das Motiv kommt vom Preis selbst (Karten-
// Faecher = Wahlfreiheit). Ein einziger heller Akzent traegt Zahl und CTA, damit
// die Karten die einzige Buntheit bleiben.

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Täglich 3 × 50 € Gutschein gewinnen | Claimondo',
    description:
      'Unverschuldeter Unfall? Nehmen Sie täglich an der Verlosung von 3 × 50 € Gutschein teil. Kostenlos, in 30 Sekunden, ohne Kaufzwang.',
    // Indexierbar: Das Gewinnspiel laeuft dauerhaft ("jeden Tag") und wird
    // site-weit verlinkt — eine noindex-Seite als Ziel hunderter interner Links
    // waere verschenkt. Endet die Kampagne, wird die Seite umgestellt statt
    // stillschweigend weiterzuwerben.
    robots: { index: true, follow: true },
    alternates: await localeAlternates('/gewinnspiel'),
    // ⚠ Metadata-Merge-Gate (Baseline 0): Next merged `openGraph` nur FLACH — ein
    // eigener Block ohne `images` wuerde das Default-Bild des Layouts loeschen.
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      title: 'Täglich 3 × 50 € Gutschein gewinnen',
      description: 'Unverschuldeter Unfall? Jeden Tag verlosen wir 3 × 50 € Gutschein.',
      url: `${SITE_URL}/gewinnspiel`,
      images: OG_DEFAULT_IMAGES,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Täglich 3 × 50 € Gutschein gewinnen',
      description: 'Unverschuldeter Unfall? Jeden Tag verlosen wir 3 × 50 € Gutschein.',
      images: OG_DEFAULT_IMAGES,
    },
  }
}

/** Kampagnen-Palette. Lokal auf dem Wrapper statt global in globals.css: das ist
 *  Art-Direction einer einzelnen Seite und soll die Brand-Tokens nicht anfassen.
 *  Cream = Claimondo Landing-Cream (whitelisted in src/lib/external-brand-colors.ts). */
const KAMPAGNEN_VARS = { '--gs-cream': '#F5F1E8' } as React.CSSProperties

const SCHRITTE = [
  { nr: '1', titel: 'Teilnehmen', text: 'Name und Mobilnummer, mehr nicht.' },
  { nr: '2', titel: 'Bestätigen', text: 'Kurz auf unsere WhatsApp antworten.' },
  { nr: '3', titel: 'Gewinnen', text: 'Täglich ziehen wir bis zu 3 Gewinner.' },
]

const TRUST = [
  { zahl: 'über 50', label: 'Partner-Gutachter deutschlandweit' },
  { zahl: 'unter 48 h', label: 'bis der Gutachter vor Ort ist' },
  { zahl: 'Ø 32 Tage', label: 'von der Meldung bis zur Auszahlung' },
]

/**
 * Strukturierte Daten. schema.org hat keinen Typ fuer Gewinnspiele — deshalb
 * WebPage statt einer erfundenen Auszeichnung, plus Breadcrumbs. Die
 * Teilnahmebedingungen haengen als `significantLink` daran; das ist die
 * ehrlichste verfuegbare Modellierung und valide.
 */
function schemaGraph() {
  return [
    breadcrumbsSchema([
      { name: 'Startseite', url: '/' },
      { name: 'Gewinnspiel', url: '/gewinnspiel' },
    ]),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Täglich 3 × 50 € Gutschein gewinnen',
      description:
        'Tägliche Verlosung von 3 Gutscheinen à 50 € unter Teilnehmern mit unverschuldetem Unfallschaden. Kostenlos und ohne Kaufzwang.',
      url: `${SITE_URL}/gewinnspiel`,
      inLanguage: 'de-DE',
      isPartOf: { '@type': 'WebSite', url: SITE_URL, name: 'Claimondo' },
      significantLink: `${SITE_URL}/gewinnspiel/teilnahmebedingungen`,
      publisher: { '@type': 'Organization', name: 'Claimondo', url: SITE_URL },
    },
  ]
}

/** Endpunkt der Kampagnen-API. BEWUSST fest, nicht NEXT_PUBLIC_APP_URL —
 *  die zeigt im Marketing-Build auf claimondo.de, und /api/* wird von NGINX
 *  nicht an die App weitergeleitet (404). Gleiche Begruendung wie beim
 *  Anfrage-Endpunkt im Formular. */
const KAMPAGNE_API = 'https://app.claimondo.de/api/kampagne/aktiv'

type KampagneAntwort = {
  aktiv: boolean
  betragEur?: number
  praemien?: Array<{ id: string; name: string; beschreibung: string | null }>
}

/** Holt den Kampagnen-Stand. Faellt die API aus, rendert die Seite ohne
 *  Praemien-Auswahl weiter — eine tote Landingpage waere die schlechtere
 *  Antwort auf einen API-Fehler als eine reduzierte. */
async function ladeKampagne(): Promise<KampagneAntwort> {
  try {
    const res = await fetch(KAMPAGNE_API, { next: { revalidate: 60 } })
    if (!res.ok) return { aktiv: false }
    return (await res.json()) as KampagneAntwort
  } catch {
    return { aktiv: false }
  }
}

export default async function GewinnspielPage() {
  const kampagne = await ladeKampagne()
  const praemien = kampagne.praemien ?? []

  return (
    <main style={KAMPAGNEN_VARS} className="min-h-screen bg-claimondo-navy text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(schemaGraph())}
      />
      {/* ── 1 · Preis-Fold ────────────────────────────────────────────────
          Kein Header, keine Navigation: jeder Link, der nicht zum Formular
          fuehrt, ist auf einer Ad-Landeseite ein Leck. */}
      <section className="relative isolate overflow-hidden px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
        {/* Warmer Schein hinter der Zahl. Traegt die Aufmerksamkeit dorthin,
            ohne dass ein zweiter Farbton noetig wird. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #F5F1E8 0%, transparent 68%)' }}
        />

        <div className="mx-auto max-w-5xl">
          <div className="flex justify-center">
            <Image
              src="/kfzgutachter-lp/logo.png"
              alt="Claimondo"
              width={2144}
              height={456}
              priority
              className="h-7 w-auto brightness-0 invert sm:h-8"
            />
          </div>

          <div className="mt-10 grid items-start gap-10 lg:mt-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-14">
            <div className="text-center lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
                Jeden Tag, für Unverschuldete
              </p>

              <h1 className="mt-4 font-black leading-[0.85] tracking-tight text-[var(--gs-cream)]">
                {/* Obergrenze 6.5rem, nicht 9rem: die linke Spalte ist rund 508 px
                    breit (max-w-5xl, 1.05fr, gap-14). Bei 9rem passte "3 × 50 €"
                    nicht mehr in eine Zeile und das Euro-Zeichen rutschte allein
                    in die zweite — nur im Desktop-Screenshot sichtbar, nicht im
                    Build. nowrap haelt den Umbruch auch dann zu, wenn sich das
                    Spaltenmass spaeter aendert. */}
                <span
                  className="block whitespace-nowrap tabular-nums"
                  style={{ fontSize: 'clamp(4.5rem, 18vw, 6.5rem)' }}
                >
                  3 × 50 €
                </span>
                <span
                  className="mt-3 block font-bold text-white"
                  style={{ fontSize: 'clamp(1.35rem, 5vw, 2rem)' }}
                >
                  Gutschein gewinnen
                </span>
              </h1>

              <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/70 lg:mx-0 sm:text-base">
                Tanken, laden oder einkaufen: Sie entscheiden, wofür. Teilnehmen kann jeder,
                der einen unverschuldeten Unfall hatte. Kostenlos und ohne Kaufzwang.
              </p>

              <div className="mt-9">
                <PraemienFaecher praemien={praemien} />
              </div>
            </div>

            {/* Formular ueber der Falte: auf Mobil steht es direkt unter der
                Zahl, ohne Scrollen erreichbar. */}
            <div className="lg:sticky lg:top-8">
              <GewinnspielFormClient praemien={praemien} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2 · Drei Schritte ─────────────────────────────────────────────
          Bewusst eine Zeile statt drei Icon-Karten: setzt die Erwartung, ohne
          wie ein Template-Raster auszusehen. */}
      <section className="border-t border-white/10 px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-7 sm:flex-row sm:gap-10">
          {SCHRITTE.map((s) => (
            <div key={s.nr} className="flex flex-1 items-baseline gap-3.5">
              <span className="text-2xl font-black tabular-nums text-white/40">{s.nr}</span>
              <div>
                <p className="font-bold text-[var(--gs-cream)]">{s.titel}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-white/60">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3 · Wer dahintersteht ─────────────────────────────────────────
          Der Vertrauensanker. Ein Gewinnspiel mit Geldwert steht unter
          Generalverdacht; ohne sichtbares Unternehmen liest sich alles wie Fake. */}
      <section className="border-t border-white/10 bg-white/[0.03] px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-5xl items-center gap-9 lg:grid-cols-2 lg:gap-14">
          <div className="relative aspect-[4/3] overflow-hidden rounded-ios-lg ring-1 ring-white/15">
            <Image
              src="/brand/team-founders.png"
              alt="Die Gründer von Claimondo"
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover"
            />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--gs-cream)] sm:text-3xl">
              Wer hinter dem Gewinnspiel steht
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/70">
              Claimondo ist ein deutsches Unternehmen für Unfallschaden-Abwicklung. Wir
              koordinieren Gutachter, Anwalt und Auszahlung, damit unverschuldet Geschädigte
              bekommen, was ihnen zusteht. Für sie kostet das nichts: nach § 249 BGB zahlt die
              gegnerische Versicherung.
            </p>

            <dl className="mt-8 space-y-4">
              {TRUST.map((t) => (
                <div key={t.label} className="flex items-baseline gap-4">
                  <dt className="w-28 shrink-0 text-lg font-black tabular-nums text-[var(--gs-cream)]">
                    {t.zahl}
                  </dt>
                  <dd className="text-[13px] leading-relaxed text-white/60">{t.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── 4 · Warum wir das machen ──────────────────────────────────────
          Entwaffnet den „Was ist der Haken?"-Reflex, indem der Haken benannt
          wird. Verschweigen wirkt hier teurer als Offenlegen. */}
      <section className="border-t border-white/10 px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-[var(--gs-cream)]">Warum verschenken wir das?</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Weil wir Menschen mit unverschuldetem Unfallschaden suchen. Genau denen helfen wir,
            und daran verdienen wir. Sie gehen keine Verpflichtung ein: Ein Berater ruft an,
            erklärt Ihre Ansprüche, und Sie entscheiden danach. Am Gewinnspiel nehmen Sie so
            oder so teil.
          </p>
        </div>
      </section>

      {/* ── 5 · Zweiter CTA ───────────────────────────────────────────────
          Faengt die, die bis hierher gescrollt haben, statt sie am Ende
          ohne Handlungsmoeglichkeit stehen zu lassen. */}
      <section className="border-t border-white/10 px-5 py-14 text-center sm:px-8">
        <p className="text-xl font-bold text-[var(--gs-cream)] sm:text-2xl">
          Heute noch dabei sein
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-white/60">
          Die Ziehung läuft täglich. Wer heute teilnimmt, ist bei der nächsten dabei.
        </p>
        <a
          href="#teilnahme"
          className="mt-6 inline-block rounded-full bg-[var(--gs-cream)] px-8 py-4 text-base font-bold text-claimondo-navy transition-all hover:brightness-95 active:scale-[0.98]"
        >
          Zum Teilnahmeformular
        </a>
      </section>

      {/* ── 6 · Bedingungen und Pflichtangaben ────────────────────────────
          Pflicht, aber bewusst hinter dem Formular: nichts davon bringt
          jemanden zur Teilnahme, alles davon kann sie kosten. */}
      <footer className="border-t border-white/10 px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-3xl text-[12px] leading-relaxed text-white/60">
          <p>
            Veranstalter: Claimondo GmbH. Teilnahme ab 18 Jahren, kostenlos und ohne Kaufzwang.
            Pro Person und Tag ist eine Teilnahme möglich. Täglich werden bis zu 3 Gewinner
            gezogen und über die angegebene Mobilnummer benachrichtigt. Der Gewinn wird nach
            Nachweis eines unverschuldeten Unfallschadens versendet. Eine Barauszahlung ist
            ausgeschlossen, der Rechtsweg ist ausgeschlossen.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/gewinnspiel/teilnahmebedingungen" className="underline hover:text-white/70">
              Teilnahmebedingungen
            </Link>
            <Link href="/datenschutz" className="underline hover:text-white/70">
              Datenschutz
            </Link>
            <Link href="/impressum" className="underline hover:text-white/70">
              Impressum
            </Link>
          </p>
          <p className="mt-4 text-white/55">
            Diese Aktion steht in keiner Verbindung zu Meta, TikTok, Instagram oder Facebook
            und wird von diesen weder gesponsert noch unterstützt oder organisiert.
          </p>
        </div>
      </footer>
    </main>
  )
}
