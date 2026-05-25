import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Phone, Scale, Check, X, ShieldCheck } from 'lucide-react'
import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { ReviewerByline } from '@/components/landing/ReviewerByline'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { StickyCallBar } from '@/components/landing/StickyCallBar'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import {
  onlineGutachtenSchema, faqPageSchema, breadcrumbsSchema,
  jsonLdScript, SITE_URL, PHONE_DISPLAY,
} from '@/lib/seo/jsonld'

const PAGE_PATH = '/kfz-gutachter/online-kfz-gutachten'
const STAND = '25.05.2026'

export const metadata: Metadata = {
  title: '„Online-Kfz-Gutachten" — was rechtlich erlaubt ist und was nicht (LG Bremen 2026)',
  description:
    '„Online-Kfz-Gutachten in 5 Minuten" — geht das überhaupt? Das LG Bremen hat im Januar 2026 klare Grenzen gezogen. Was zulässig ist, was nicht, und worauf Geschädigte achten sollten.',
  keywords: [
    'online kfz-gutachten',
    'kfz-gutachten ohne besichtigung',
    'lg bremen online gutachten',
    'ferngutachten kfz',
    'digitales kfz-gutachten',
    'kfz-gutachten foto',
    '9 O 1720/24',
  ],
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    type: 'article',
    locale: 'de_DE',
    siteName: 'Claimondo',
    url: `${SITE_URL}${PAGE_PATH}`,
    title: 'Online-Kfz-Gutachten: was rechtlich erlaubt ist und was nicht (LG Bremen 2026)',
    description:
      'Das LG-Bremen-Urteil 9 O 1720/24 (16.01.2026) und seine Folgen für Online-Kfz-Gutachten — sachlich eingeordnet aus Vermittler-Sicht.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'LG Bremen 2026: Grenzen für Online-Kfz-Gutachten' }],
  },
}

const FAQ = [
  {
    frage: 'Ist ein „Online-Kfz-Gutachten" mit Foto-Upload überhaupt verboten?',
    antwort:
      'Nicht jedes digitale Element ist verboten — aber ein vollständiges Gutachten allein auf Basis hochgeladener Fotos ohne persönliche Fahrzeug-Besichtigung hat das LG Bremen am 16.01.2026 (Az. 9 O 1720/24) als irreführende Werbung untersagt. Entscheidend ist die persönliche Inaugenscheinnahme durch den Sachverständigen. Ein Foto-Vor-Check zur ersten Schadenseinschätzung bleibt zulässig, ein darauf gestütztes Gutachten nicht.',
  },
  {
    frage: 'Akzeptieren Versicherungen Gutachten ohne Vor-Ort-Termin?',
    antwort:
      'In der Regel nicht zuverlässig. Versicherer erkennen Sachverständigen-Gutachten an, wenn sie auf einer persönlichen Begutachtung beruhen. Ein Kfz-Gutachten ohne Besichtigung riskiert, von der gegnerischen Versicherung als nicht belastbar zurückgewiesen zu werden — mit entsprechendem Risiko für Ihre Schadensregulierung.',
  },
  {
    frage: 'Was passiert mit meinem Schadensanspruch, wenn ich ein unzulässiges Online-Gutachten nutze?',
    antwort:
      'Im ungünstigen Fall steht Ihnen kein belastbares Beweismittel zur Verfügung. Wird das Gutachten angezweifelt, sind Reparaturkosten, Wertminderung und weitere Positionen schwerer durchsetzbar. Sicherer ist ein Gutachten mit persönlicher Besichtigung, das gegenüber der Versicherung und vor Gericht Bestand hat.',
  },
  {
    frage: 'Wie unterscheidet sich ein „digitales Gutachten" von einem „Online-Gutachten"?',
    antwort:
      'Ein digitales Gutachten meint einen digitalen Workflow — Online-Auftrag, Foto-Upload, digitale Kommunikation — bei dem der Sachverständige das Fahrzeug trotzdem persönlich vor Ort besichtigt. Ein „Online-Gutachten" im untersagten Sinn meint die Erstellung allein aus eingereichten Fotos ohne Besichtigung. Das erste ist zulässig und Standard, das zweite hat das LG Bremen beanstandet.',
  },
  {
    frage: 'Ist das LG-Bremen-Urteil rechtskräftig?',
    antwort:
      'Nein. Das Urteil vom 16.01.2026 (9 O 1720/24) ist nach unserem Kenntnisstand noch nicht rechtskräftig. Es setzt aber bereits jetzt einen deutlichen Maßstab, an dem sich seriöse Anbieter orientieren.',
  },
]

export default function OnlineKfzGutachtenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([
          onlineGutachtenSchema({ modified: '2026-05-25' }),
          faqPageSchema(FAQ),
          breadcrumbsSchema([
            { name: 'Startseite', url: '/' },
            { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
            { name: 'Online-Kfz-Gutachten', url: PAGE_PATH },
          ]),
        ])}
      />

      <LandingTopbar authenticatedUser={null} />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 15% 20%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 85% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-4xl px-5 sm:px-8">
          <nav aria-label="Brotkrumen" className="text-xs text-white/60">
            <Link href="/" className="hover:text-white">Startseite</Link>
            <span className="px-1.5">/</span>
            <Link href="/kfz-gutachter" className="hover:text-white">Kfz-Gutachter</Link>
            <span className="px-1.5">/</span>
            <span className="text-white/80">Online-Kfz-Gutachten</span>
          </nav>
          <p className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-claimondo-light-blue">
            <Scale className="h-4 w-4" />
            Rechtlicher Explainer · LG Bremen 2026
          </p>
          <h1
            className="mt-4 text-balance text-[2rem] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[2.75rem]"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            „Online-Kfz-Gutachten" — was rechtlich{' '}
            <span className="text-claimondo-light-blue">erlaubt ist und was nicht</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            „Online-Kfz-Gutachten in 5 Minuten, einfach Fotos hochladen" — solche Versprechen häufen sich.
            Aber geht das rechtlich überhaupt? Das Landgericht Bremen hat im Januar 2026 klare Grenzen
            gezogen. Hier steht, was zulässig ist, was nicht, und worauf Sie als Geschädigter achten sollten.
          </p>
        </div>
      </section>

      {/* Direkt-Antwort */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <AnswerCapsule quelle="LG Bremen 9 O 1720/24 · 16.01.2026">
            <strong>Ein vollwertiges Kfz-Gutachten allein aus hochgeladenen Fotos, ohne persönliche
            Besichtigung, ist unzulässig.</strong> Das LG Bremen untersagte am 16.01.2026 die Werbung mit
            solchen „Online-Kfz-Gutachten" als irreführend. Erlaubt und üblich bleibt das hybride Modell:
            ein digitaler Workflow (Online-Auftrag, Foto-Upload, Kommunikation) kombiniert mit einer
            persönlichen Vor-Ort-Besichtigung durch den Sachverständigen.
          </AnswerCapsule>
        </div>
      </section>

      {/* Warum 2026 wichtig */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Warum diese Frage 2026 wichtig geworden ist
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Zwischen 2024 und 2026 sind mehrere Anbieter mit dem Versprechen angetreten, ein
            Kfz-Gutachten ohne Besichtigung zu liefern: Fotos hochladen, ein paar Fragen anklicken,
            Gutachten in Minuten. Für Geschädigte klingt das bequem. Die Wettbewerbszentrale sah darin
            irreführende Werbung und klagte — das Landgericht Bremen gab ihr am 16.01.2026 recht.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Für Sie als Geschädigten ist das mehr als juristisches Klein-Klein: Ein Gutachten, das die
            gegnerische Versicherung nicht anerkennt, gefährdet die Durchsetzung Ihrer Ansprüche. Wer ein
            „kfz-gutachten foto"-Angebot prüft, sollte deshalb wissen, wo die rechtliche Grenze verläuft.
          </p>
        </div>
      </section>

      {/* Urteil im Detail */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 text-claimondo-ondo" />
            <h2 className="text-3xl font-extrabold text-claimondo-navy">
              Das LG-Bremen-Urteil (9 O 1720/24) im Detail
            </h2>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { k: 'Datum', v: '16.01.2026' },
              { k: 'Aktenzeichen', v: '9 O 1720/24' },
              { k: 'Status', v: 'noch nicht rechtskräftig' },
            ].map((m) => (
              <div key={m.k} className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-claimondo-ondo">{m.k}</div>
                <div className="mt-1 text-sm font-semibold text-claimondo-navy">{m.v}</div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[15px] leading-relaxed text-claimondo-shield">
            Auf Klage der Wettbewerbszentrale untersagte das Landgericht Bremen einem Anbieter die Werbung
            für „Online-Kfz-Gutachten". Das Gericht stützte sich auf drei Kern-Überlegungen:
          </p>

          {/* Zitat-Karte */}
          <blockquote className="my-6 rounded-ios-md border-l-4 border-claimondo-navy bg-white p-5 shadow-glass-card">
            <p className="text-[15px] italic leading-relaxed text-claimondo-navy">
              „Die persönliche Inaugenscheinnahme des beschädigten Fahrzeugs gehört zur ureigensten
              Aufgabe eines Kfz-Sachverständigen."
            </p>
            <footer className="mt-2 text-xs text-claimondo-ondo">
              — sinngemäße Kernaussage des LG Bremen, 9 O 1720/24
            </footer>
          </blockquote>

          <ol className="mt-2 space-y-4 text-[15px] leading-relaxed text-claimondo-shield">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-xs font-bold text-white">1</span>
              <span>
                <strong className="text-claimondo-navy">Persönliche Besichtigung ist nicht ersetzbar.</strong>{' '}
                Ein Gutachten allein aus Fotos oder Multiple-Choice-Antworten ist nicht zuverlässig, weil
                Versicherer Sachverständigen-Berichte nur auf Basis einer persönlichen Erstellung anerkennen.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-xs font-bold text-white">2</span>
              <span>
                <strong className="text-claimondo-navy">Der Geschädigte ist nicht „Hilfsperson" des SV.</strong>{' '}
                Hilfspersonen darf ein Sachverständiger einsetzen — der Auftraggeber selbst, der nur Fotos
                liefert, ersetzt aber nicht die eigene Begutachtung.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-xs font-bold text-white">3</span>
              <span>
                <strong className="text-claimondo-navy">RDG §§ 2, 3:</strong> Wer mit „schneller,
                kompletter Abwicklung gegenüber der Versicherung" wirbt, ohne im
                Rechtsdienstleistungs-Register eingetragen zu sein, verstößt gegen das
                Rechtsdienstleistungsgesetz, wenn der Eindruck entsteht, rechtliche Angelegenheiten der
                Geschädigten zu besorgen.
              </span>
            </li>
          </ol>
        </div>
      </section>

      {/* Erlaubt vs Verboten */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Was ist erlaubt — und was nicht?</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-claimondo-shield">
            Die Grenze verläuft nicht zwischen „digital" und „analog", sondern bei der persönlichen
            Besichtigung. Ein Kfz-Gutachten ohne Besichtigung ist das Problem — nicht der digitale Weg dorthin.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-ios-md border border-emerald-200 bg-emerald-50/60 p-6">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-emerald-700">
                <Check className="h-5 w-5" /> Erlaubt &amp; sinnvoll
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-claimondo-shield">
                <li>Digitale Auftragsannahme und Übermittlung der Unterlagen</li>
                <li>Foto-Vor-Check zur SV-Auswahl und ersten Schaden-Einschätzung</li>
                <li>Digitale Status-Updates und Kommunikation</li>
                <li>Hybrides Modell: digitaler Workflow + physische Vor-Ort-Besichtigung (BGH-konformer Standard)</li>
              </ul>
            </div>
            <div className="rounded-ios-md border border-red-200 bg-red-50/60 p-6">
              <h3 className="flex items-center gap-2 text-lg font-extrabold text-red-700">
                <X className="h-5 w-5" /> Nicht zulässig
              </h3>
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-claimondo-shield">
                <li>Vollständiges Gutachten allein aus hochgeladenen Fotos, ohne Besichtigung</li>
                <li>Werbung mit „5-Minuten-Gutachten" oder „Foto reicht"</li>
                <li>Multiple-Choice-Antworten als Ersatz für die SV-Begutachtung</li>
                <li>„Komplette Abwicklung mit der Versicherung" ohne RDG-Registrierung</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Checkliste */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">
            Worauf Sie als Geschädigter achten sollten
          </h2>
          <div className="mt-8 space-y-3">
            {[
              'Der Sachverständige besichtigt das Fahrzeug persönlich vor Ort (Pflicht).',
              'Es gibt ein schriftliches Gutachten mit Unterschrift bzw. Stempel des Sachverständigen.',
              'Der Anbieter trennt die Vermittlung (Plattform) klar von der Rechtsdienstleistung (Kanzlei).',
              'Verspricht der Anbieter „komplette Schadensregulierung", ist er im Rechtsdienstleistungsregister eingetragen.',
              'Keine pauschalen „5-Minuten"- oder „Foto reicht"-Versprechen.',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-ios-md border border-claimondo-border bg-white p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-claimondo-ondo" />
                <span className="text-sm leading-relaxed text-claimondo-shield">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Wie Claimondo damit umgeht */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Wie Claimondo damit umgeht</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Digital ist bei uns die Abwicklung: Auftragsannahme, Status-Updates, Dokument-Upload und
            Kommunikation laufen online. Physisch bleibt, was physisch sein muss — <strong>jede
            Besichtigung erfolgt vor Ort durch einen Partner-Sachverständigen</strong>. Ein Kfz-Gutachten
            ohne Besichtigung gibt es bei uns nicht.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Rechtsdienstleistungen erbringen wir nicht selbst: Die Durchsetzung Ihrer Ansprüche übernimmt
            eine <strong>registrierte Partnerkanzlei</strong>. So bleibt die Vermittlung über die Plattform
            sauber von der Rechtsdienstleistung getrennt — genau die Trennung, die das RDG verlangt. Den
            kompletten Ablauf zeigen wir unter{' '}
            <Link href="/wie-es-funktioniert" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              „So funktioniert die Claimondo-Abwicklung"
            </Link>. Wie sich die verschiedenen Vermittlungsplattformen unterscheiden, lesen Sie im{' '}
            <Link href="/kfz-gutachter/vermittlungsportale-vergleich" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              Vergleich der Vermittlungsplattformen
            </Link>.
          </p>
        </div>
      </section>

      {/* Verwandte Urteile */}
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Verwandte Urteile und Quellen</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-claimondo-shield">
            Das Bremer Urteil steht nicht allein. Bereits zuvor hat das LG Frankfurt irreführende Werbung
            für ein Ferngutachten Kfz untersagt. Und der BGH stützt in mehreren Leitentscheidungen die
            Geschädigten gegen pauschale Kürzungen — diese Linie haben wir auf{' '}
            <Link href="/vorteile" className="font-semibold text-claimondo-navy underline decoration-claimondo-ondo/40 underline-offset-2 hover:decoration-claimondo-ondo">
              unserer Vorteile-Seite
            </Link>{' '}
            (BGH VI ZR 65/18, VI ZR 174/24) zusammengefasst.
          </p>
          <ul className="mt-5 space-y-2 text-sm leading-relaxed text-claimondo-ondo">
            <li>
              <a href="https://www.wettbewerbszentrale.de/lg-bremen-irrefuehrende-werbung-mit-online-kfz-gutachten/" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-claimondo-navy">
                Wettbewerbszentrale — Pressemitteilung zum LG-Bremen-Urteil
              </a>
            </li>
            <li>
              <a href="https://www.iww.de/ue/schadenregulierung/schadengutachten-lg-bremen-online-gutachten-ohne-besichtigung-durch-den-gutachter-sind-unzulaessig-f172818" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-claimondo-navy">
                IWW Schadenregulierung — Fachbeitrag zum Urteil
              </a>
            </li>
            <li>
              <a href="https://www.wettbewerbszentrale.de/lg-frankfurt-untersagt-irrefuehrende-werbung-fuer-ferngutachten/" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-claimondo-navy">
                Wettbewerbszentrale — LG Frankfurt zu Ferngutachten
              </a>
            </li>
            <li>
              <a href="https://www.autohaus.de/nachrichten/schadenbusiness/gericht-setzt-schadenplattformen-klare-grenzen-online-kfz-gutachten-gibt-es-nicht-3779423" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-claimondo-navy">
                autohaus.de — „Online-Kfz-Gutachten gibt es nicht"
              </a>
            </li>
            <li>
              <a href="https://www.anwalt.de/rechtstipps/online-unfallgutachten-ohne-fahrzeugbesichtigung-warum-das-ein-problem-ist-266537.html" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-claimondo-navy">
                anwalt.de — Online-Unfallgutachten ohne Fahrzeugbesichtigung
              </a>
            </li>
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <h2 className="text-3xl font-extrabold text-claimondo-navy">Häufige Fragen</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details
                key={f.frage}
                className="group rounded-ios-md border border-white/60 bg-claimondo-bg p-5 shadow-glass-card transition-all hover:bg-white"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-claimondo-navy">
                  <span className="flex items-center justify-between gap-3">
                    {f.frage}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-claimondo-ondo transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-claimondo-shield">{f.antwort}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-xs leading-relaxed text-claimondo-shield/70">
            Dieser Beitrag dient der allgemeinen Information und stellt keine Rechtsberatung dar.
            Stand: {STAND}.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative isolate overflow-hidden bg-claimondo-navy py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(circle at 20% 25%, rgba(69,115,162,0.30), transparent 55%)',
              'radial-gradient(circle at 80% 75%, rgba(123,163,204,0.18), transparent 50%)',
            ].join(', '),
          }}
        />
        <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2
            className="text-3xl font-bold sm:text-4xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Lieber ein Gutachten, das Bestand hat
          </h2>
          <p className="mt-4 text-white/70">
            Persönliche Besichtigung vor Ort, digitale Abwicklung drumherum. Schaden melden oder anrufen —
            wir sind rund um die Uhr erreichbar.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/schaden-melden"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-bold text-claimondo-navy shadow-[0_8px_28px_rgba(255,255,255,0.18)] transition-all duration-200 hover:bg-claimondo-light-blue/90 active:scale-[0.98]"
            >
              <ChevronRight className="h-5 w-5 text-claimondo-ondo" />
              Gutachter-Anfrage stellen
            </Link>
            <a
              href="tel:+4922125906530"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white/85 backdrop-blur-sm transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
            >
              <Phone className="h-5 w-5" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <ReviewerByline datum="2026-05-25" />

      <LandingFooter />
      <StickyCallBar quelle="Online-Kfz-Gutachten Wissens-Page" />
    </div>
  )
}
