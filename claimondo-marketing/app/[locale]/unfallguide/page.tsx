import type { Metadata } from 'next'
import Image from 'next/image'
import { Phone } from 'lucide-react'
import {
  breadcrumbsSchema,
  jsonLdScript,
  SITE_URL,
  OG_DEFAULT_IMAGES,
} from '@/lib/seo/jsonld'
import { localeAlternates, localeOpenGraph } from '@/lib/seo/alternates'
import { GuideFormClient } from './GuideFormClient'
import { MdxLanguageBanner } from '@/components/content/MdxLanguageBanner'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'

// Landeseite fuer den Unfallguide. Anders als kfzgutachter-lp (noindex,
// Subdomain, reiner Anzeigen-Traffic) ist diese Seite INDEXIERBAR und liegt
// auf der Hauptdomain: sie ist das Ziel fuer Anzeigen, fuer die Verlinkung aus
// den 63 Fachartikeln, fuer die Suche nach "claimondo unfallguide" und fuer
// jede Weiterempfehlung. Ohne sie haette der Guide genau eine Verteilflaeche.
//
// Aufbau nach PRODUCT.md: "Erst ordnen, dann fordern" — oben steht, was drin
// ist und was es kostet, das Formular kommt daneben, nicht davor. Und
// "Belegen statt behaupten": jede Zahl auf dieser Seite traegt ihren Paragrafen
// oder ihr Aktenzeichen.
//
// Der Text ist bewusst nur auf Deutsch. Der Guide selbst ist es auch; die
// Uebersetzungen sind ein eigener Schritt (Plan AP 7).

const TITEL = 'Unfallguide: Was Ihnen nach einem unverschuldeten Unfall zusteht'
const BESCHREIBUNG =
  'Kostenloser 6-Seiten-Guide: welche Ansprüche Sie haben, welche sechs Fehler teuer werden, was bei wirtschaftlichem Totalschaden gilt und wie Sie auf Kürzungen antworten.'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITEL,
    description: BESCHREIBUNG,
    keywords: [
      'Unfallguide',
      'unverschuldeter Unfall was tun',
      'Ansprüche nach Verkehrsunfall',
      'wirtschaftlicher Totalschaden',
      '130 Prozent Regel',
      'Nutzungsausfall',
      'Wertminderung',
      'Versicherung kürzt Gutachten',
      'Checkliste nach Unfall',
    ],
    alternates: await localeAlternates('/unfallguide'),
    // Metadata-Merge-Gate: Next merged nur flach. Ein eigener openGraph-Block
    // ersetzt den des Layouts KOMPLETT — inklusive images. Beide Bloecke
    // tragen das Default-Bild deshalb selbst.
    openGraph: {
      type: 'article',
      siteName: 'Claimondo',
      images: OG_DEFAULT_IMAGES,
      ...(await localeOpenGraph('/unfallguide')),
      title: TITEL,
      description: BESCHREIBUNG,
    },
    twitter: {
      card: 'summary_large_image',
      images: OG_DEFAULT_IMAGES,
      title: TITEL,
      description: BESCHREIBUNG,
    },
  }
}

const INHALT = [
  {
    seite: '1',
    titel: 'Wo Sie stehen',
    text: 'Was ein unverschuldeter Unfall für Sie bedeutet, und warum Sie dafür nichts zahlen.',
  },
  {
    seite: '2',
    titel: 'Ihre Ansprüche, mit Beträgen',
    text: 'Reparatur, eigener Gutachter, Anwalt, Nutzungsausfall, Wertminderung, Mietwagen. Mit typischen Spannen.',
  },
  {
    seite: '3',
    titel: 'Sechs Fehler, die teuer werden',
    text: 'Und die fünf Sätze, die am Telefon fallen: was dahintersteckt und was Sie antworten.',
  },
  {
    seite: '4',
    titel: 'Checkliste zum Abhaken',
    text: 'Sofort am Unfallort, am selben Tag, in der ersten Woche. Mit der Weiche Haftpflicht oder Kasko.',
  },
  {
    seite: '5',
    titel: 'Wenn die Reparatur teurer wird als das Auto',
    text: 'Die drei Wege bei wirtschaftlichem Totalschaden, die Sache mit der Mehrwertsteuer und warum Vorschäden ins Gutachten gehören.',
  },
  {
    seite: '6',
    titel: 'Wenn gekürzt wird',
    text: 'Die vier häufigsten Textbausteine der Versicherer, und was ihnen die Wirkung nimmt.',
  },
]

// Echte Google-Bewertungen. Quelle: components GoogleReviewsStrip der
// kfzgutachter-LP, von Aaron am 18.05.2026 aus dem Google-Business-Profil
// eingepflegt. Nie erfinden, nie paraphrasieren (UWG § 5).
const STIMMEN = [
  {
    text: 'Claimondo war von vorne bis hinten einfach nur super. Besonders gut hat mir das Kundenportal gefallen und die Schnelligkeit der Abwicklung.',
    name: 'Vincent Heinen',
  },
  { text: 'Top Service! Gut erreichbar, schnell und kompetent.', name: 'daniel bonn' },
]

const FRAGEN = [
  {
    frage: 'Ist der Guide wirklich kostenlos?',
    antwort:
      'Ja. Und der Service dahinter auch: Bei einem unverschuldeten Unfall trägt die gegnerische Versicherung Gutachten, Anwalt und unsere Arbeit. Das steht so in § 249 BGB. Claimondo verdient nie am Geschädigten.',
  },
  {
    frage: 'Was passiert mit meiner Telefonnummer?',
    antwort:
      'Wir rufen Sie zwischen 8 und 20 Uhr zurück und besprechen Ihren Fall. Wir geben Ihre Nummer nicht weiter, und Sie können dem Kontakt jederzeit widersprechen. Der Guide steht unabhängig davon sofort zum Lesen bereit.',
  },
]

export default async function UnfallguidePage() {
  return (
    <>
      {/* ⚠ `jsonLdScript()` liefert ein `{ __html }`-Objekt FUER
          `dangerouslySetInnerHTML` — es ist kein Element. Wer es als Kind
          rendert, bekommt zur Laufzeit "Objects are not valid as a React child"
          und die Route antwortet mit 500. Build und tsc sehen davon nichts.
          So macht es jede andere Seite (autor/, beratung-anfragen/, check/ …). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          breadcrumbsSchema([
            { name: 'Start', url: SITE_URL },
            { name: 'Unfallguide', url: `${SITE_URL}/unfallguide` },
          ]),
        )}
      />

      {/* Topbar und Fusszeile werden in dieser App JE SEITE gemountet, nicht im
          Layout. Ohne sie stand die Seite ohne Navigation und ohne Rechtslinks da —
          und die Fusszeile, die auf den Guide verweist, fehlte ausgerechnet auf
          seiner eigenen Seite. */}
      <LandingTopbar authenticatedUser={null} />

      {/* Die Seite und der Guide sind deutsch, die Route liegt unter [locale].
          Auf en/pl/tr/ru/ar sagt der Banner das ehrlich, statt einen englischen
          Leser kommentarlos auf deutschen Text laufen zu lassen — dasselbe
          Muster wie bei den Fachartikeln. Auf de verbirgt er sich selbst. */}
      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        <MdxLanguageBanner />
      </div>

      {/* ── Kopf: Navy traegt das obere Drittel. Der Guide liegt als Objekt
             daneben, nicht als Symbol darunter. ─────────────────────────── */}
      <section className="bg-claimondo-navy">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
              Kostenloser Leitfaden
            </p>
            <h1 className="mt-4 font-heading text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
              Die meisten Geschädigten fordern weniger,
              <span className="block text-claimondo-light-blue">als ihnen zusteht.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
              Auf sechs Seiten steht, was Sie nach einem unverschuldeten Unfall verlangen können,
              welche Fehler teuer werden und was zu tun ist, wenn die Versicherung kürzt.
            </p>

            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
              <Image
                src="/brand/unfallguide-cover.jpg"
                alt="Titelseite des Claimondo Unfallguides"
                width={760}
                height={1075}
                priority
                className="w-36 rounded-lg shadow-2xl ring-1 ring-white/15 sm:w-44"
              />
              <ul className="space-y-2 text-base text-white/80">
                <li>6 Seiten, in zehn Minuten gelesen</li>
                <li>Mit § und Aktenzeichen, nicht mit Behauptungen</li>
                <li>Sofort lesbar, ohne Wartezeit</li>
              </ul>
            </div>
          </div>

          <div className="lg:pl-4">
            <GuideFormClient />
          </div>
        </div>
      </section>

      {/* ── Was drinsteht. Nummeriert, weil die Seiten eine Reihenfolge
             haben — nicht als Dekoration. ─────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8 lg:py-20">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-claimondo-navy sm:text-3xl">
          Was drinsteht
        </h2>
        <ol className="mt-8 divide-y divide-claimondo-border border-t border-claimondo-border">
          {INHALT.map((e) => (
            <li key={e.seite} className="flex gap-5 py-5 sm:gap-7">
              <span className="shrink-0 pt-0.5 font-heading text-sm font-bold tabular-nums text-claimondo-light-blue">
                {e.seite}
              </span>
              <div>
                <h3 className="font-heading text-lg font-semibold text-claimondo-navy">
                  {e.titel}
                </h3>
                <p className="mt-1 max-w-prose text-base leading-relaxed text-slate-600">
                  {e.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Warum kostenlos. Der Beleg IST das Vertrauenssignal. ───────── */}
      <section className="bg-claimondo-bg">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-claimondo-navy sm:text-3xl">
            Warum das nichts kostet
          </h2>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-700 sm:text-lg">
            Bei einem unverschuldeten Unfall schuldet die Gegenseite die Wiederherstellung des
            Zustands, der ohne den Unfall bestünde. Vollständig, nicht ungefähr. Das ist{' '}
            <strong className="font-semibold text-claimondo-navy">§ 249 BGB</strong> und der Grund,
            warum Gutachten, Anwalt und unsere Arbeit nicht bei Ihnen landen, sondern bei der
            Versicherung des Verursachers.
          </p>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-700 sm:text-lg">
            Die gegnerische Versicherung ist dabei kein neutraler Schlichter. Sie vertritt ihren
            Kunden. Auf Ihr Recht zu bestehen ist deshalb kein Streit, sondern der Normalfall.
          </p>
        </div>
      </section>

      {/* ── Stimmen. Zwei echte, ruhig gesetzt. ────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-claimondo-navy sm:text-3xl">
          Was Kundinnen und Kunden schreiben
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {STIMMEN.map((s) => (
            <figure key={s.name} className="border-t-2 border-claimondo-navy pt-5">
              <blockquote className="text-base leading-relaxed text-slate-700">
                „{s.text}“
              </blockquote>
              <figcaption className="mt-3 text-sm text-slate-500">
                {s.name} · Google-Bewertung
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Zwei Fragen, die vor dem Absenden im Kopf stehen. ──────────── */}
      <section className="bg-claimondo-bg">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-claimondo-navy sm:text-3xl">
            Bevor Sie Ihre Nummer eingeben
          </h2>
          <dl className="mt-8 space-y-7">
            {FRAGEN.map((f) => (
              <div key={f.frage}>
                <dt className="font-heading text-lg font-semibold text-claimondo-navy">
                  {f.frage}
                </dt>
                <dd className="mt-2 max-w-prose text-base leading-relaxed text-slate-700">
                  {f.antwort}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Abschluss: der Weg fuer die, die lieber sprechen. ──────────── */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <div className="rounded-2xl bg-claimondo-navy px-6 py-10 text-center sm:px-10">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Lieber gleich sprechen?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/80">
            Sagen Sie uns in fünf Minuten, was passiert ist. Kostenlos und unverbindlich, auch wenn
            Sie nur wissen wollen, ob sich etwas lohnt.
          </p>
          <a
            href="tel:+4915153608515"
            className="mt-7 inline-flex min-h-[56px] items-center gap-3 rounded-full bg-claimondo-light-blue px-8 text-lg font-bold text-claimondo-navy transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Phone className="h-5 w-5" aria-hidden />
            0151 5360 8515
          </a>
          <p className="mt-4 text-sm text-white/60">Erreichbar von 8 bis 20 Uhr</p>
        </div>
      </section>

      <LandingFooter />
    </>
  )
}
