import type { Metadata } from 'next'
import Image from 'next/image'
import { Phone } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
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
import { loadMessages } from '@/i18n/load-messages'
import { isLocale } from '@/i18n/locales'

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
// SPRACHEN (06.09.2026, Aaron: "ultrathink go"). Bis dahin stand der Text hart
// im Code und die Seite zeigte auf allen sechs Adressen Deutsch — uebersetzt war
// nur die Navigation. Jetzt kommt jeder sichtbare Satz aus dem Namensraum
// `unfallguide` der Messages und wird ueber die bestehende Pipeline gezogen
// (`npm run i18n:translate -- --marketing --section=unfallguide`).
// Der MdxLanguageBanner ist damit weg: er sagte "dieser Text ist deutsch", und
// das stimmt nicht mehr.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('unfallguide.meta')
  const titel = t('titel')
  const beschreibung = t('beschreibung')

  return {
    title: titel,
    description: beschreibung,
    // Bewusst deutsch belassen: die Begriffe sind die Suchanfragen des
    // deutschen Marktes, um den es geht — ein Geschaedigter in Deutschland
    // sucht auf Deutsch, auch wenn er die Seite auf Tuerkisch liest.
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
      title: titel,
      description: beschreibung,
    },
    twitter: {
      card: 'summary_large_image',
      images: OG_DEFAULT_IMAGES,
      title: titel,
      description: beschreibung,
    },
  }
}

// Echte Google-Bewertungen. Quelle: components GoogleReviewsStrip der
// kfzgutachter-LP, von Aaron am 18.05.2026 aus dem Google-Business-Profil
// eingepflegt. Nie erfinden, nie paraphrasieren (UWG § 5).
//
// ⚠ Diese Zitate stehen BEWUSST NICHT in den Messages und werden NICHT
// uebersetzt. Eine uebersetzte Bewertung ist nicht mehr die Bewertung, die der
// Kunde geschrieben hat — sie waere eine Aussage von uns im Namen eines
// Dritten. In den Fremdsprachen steht deshalb ein Hinweis daneben, dass der
// Originalwortlaut zu sehen ist.
const STIMMEN = [
  {
    text: 'Claimondo war von vorne bis hinten einfach nur super. Besonders gut hat mir das Kundenportal gefallen und die Schnelligkeit der Abwicklung.',
    name: 'Vincent Heinen',
  },
  { text: 'Top Service! Gut erreichbar, schnell und kompetent.', name: 'daniel bonn' },
]

const SEITEN = ['1', '2', '3', '4', '5', '6'] as const
const FRAGEN = ['f1', 'f2'] as const

export default async function UnfallguidePage() {
  const t = await getTranslations('unfallguide')
  const locale = await getLocale()

  // Liegt fuer DIESE Sprache wirklich eine Uebersetzung vor, oder greift nur der
  // deutsche Rueckfall aus `i18n/request.ts`? Die Frage laesst sich am
  // gerenderten Text nicht mehr beantworten, seit der Rueckfall existiert — also
  // wird die eigene Sprachdatei gelesen statt geraten.
  //
  // Der Hinweisbanner haengt daran und verschwindet von SELBST, sobald der
  // Namensraum in der Datei steht. Kein Nachtrag noetig, den jemand vergessen
  // koennte — der Zustand traegt seine eigene Anzeige.
  const eigene = isLocale(locale) ? await loadMessages(locale) : {}
  const hatUebersetzung = locale === 'de' || 'unfallguide' in eigene

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

      {/* Solange fuer diese Sprache keine Uebersetzung vorliegt, greift der
          deutsche Rueckfall — dann sagt der Banner das ehrlich, statt einen
          tuerkischen Leser kommentarlos auf deutschen Text laufen zu lassen.
          Auf de und auf jeder uebersetzten Sprache verbirgt er sich selbst. */}
      <div className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        <MdxLanguageBanner translated={hatUebersetzung} />
      </div>

      {/* ── Kopf: Navy traegt das obere Drittel. Der Guide liegt als Objekt
             daneben, nicht als Symbol darunter. ─────────────────────────── */}
      <section className="bg-claimondo-navy">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-light-blue">
              {t('kopf.eyebrow')}
            </p>
            <h1 className="mt-4 font-heading text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
              {t('kopf.h1_plain')}
              <span className="block text-claimondo-light-blue">{t('kopf.h1_accent')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80">
              {t('kopf.intro')}
            </p>

            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
              <Image
                src="/brand/unfallguide-cover.jpg"
                alt={t('kopf.bild_alt')}
                width={760}
                height={1075}
                priority
                className="w-36 rounded-lg shadow-2xl ring-1 ring-white/15 sm:w-44"
              />
              <ul className="space-y-2 text-base text-white/80">
                <li>{t('kopf.punkt_1')}</li>
                <li>{t('kopf.punkt_2')}</li>
                <li>{t('kopf.punkt_3')}</li>
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
          {t('inhalt.h2')}
        </h2>
        <ol className="mt-8 divide-y divide-claimondo-border border-t border-claimondo-border">
          {SEITEN.map((nr) => (
            <li key={nr} className="flex gap-5 py-5 sm:gap-7">
              <span className="shrink-0 pt-0.5 font-heading text-sm font-bold tabular-nums text-claimondo-light-blue">
                {nr}
              </span>
              <div>
                <h3 className="font-heading text-lg font-semibold text-claimondo-navy">
                  {t(`inhalt.s${nr}_titel`)}
                </h3>
                <p className="mt-1 max-w-prose text-base leading-relaxed text-slate-600">
                  {t(`inhalt.s${nr}_text`)}
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
            {t('kostenlos.h2')}
          </h2>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-700 sm:text-lg">
            {/* Der Paragraf steht IM Satz, nicht als Fragment daneben: in tr und
                ru waendert sich die Wortstellung, ein zerlegter Satz waere dort
                nicht mehr uebersetzbar. */}
            {t.rich('kostenlos.p1', {
              b: (chunks) => (
                <strong className="font-semibold text-claimondo-navy">{chunks}</strong>
              ),
            })}
          </p>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-slate-700 sm:text-lg">
            {t('kostenlos.p2')}
          </p>
        </div>
      </section>

      {/* ── Stimmen. Zwei echte, ruhig gesetzt. ────────────────────────── */}
      <section className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
        <h2 className="font-heading text-2xl font-bold tracking-tight text-claimondo-navy sm:text-3xl">
          {t('stimmen.h2')}
        </h2>
        {locale !== 'de' && (
          <p className="mt-2 text-sm text-slate-500">{t('stimmen.original_hinweis')}</p>
        )}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {STIMMEN.map((s) => (
            <figure key={s.name} className="border-t-2 border-claimondo-navy pt-5">
              <blockquote lang="de" className="text-base leading-relaxed text-slate-700">
                „{s.text}“
              </blockquote>
              <figcaption className="mt-3 text-sm text-slate-500">
                {s.name} · {t('stimmen.quelle')}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Zwei Fragen, die vor dem Absenden im Kopf stehen. ──────────── */}
      <section className="bg-claimondo-bg">
        <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-claimondo-navy sm:text-3xl">
            {t('fragen.h2')}
          </h2>
          <dl className="mt-8 space-y-7">
            {FRAGEN.map((f) => (
              <div key={f}>
                <dt className="font-heading text-lg font-semibold text-claimondo-navy">
                  {t(`fragen.${f}_frage`)}
                </dt>
                <dd className="mt-2 max-w-prose text-base leading-relaxed text-slate-700">
                  {t(`fragen.${f}_antwort`)}
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
            {t('abschluss.h2')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/80">
            {t('abschluss.text')}
          </p>
          <a
            href="tel:+4915153608515"
            className="mt-7 inline-flex min-h-[56px] items-center gap-3 rounded-full bg-claimondo-light-blue px-8 text-lg font-bold text-claimondo-navy transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Phone className="h-5 w-5" aria-hidden />
            0151 5360 8515
          </a>
          {/* Erreichbarkeit aus den dokumentierten Zeiten (JSON-LD
              openingHoursSpecification), nicht aus dem Gedaechtnis: bis 06.09.
              stand hier "8 bis 20 Uhr", waehrend PDF und Willkommensnachricht
              seit dem 05.09. auch die Wochenendzeiten nennen. */}
          <p className="mt-4 text-sm text-white/60">{t('abschluss.erreichbar')}</p>
        </div>
      </section>

      <LandingFooter />
    </>
  )
}
