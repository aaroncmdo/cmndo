import type { Metadata } from 'next'
import Link from 'next/link'
import { OG_DEFAULT_IMAGES } from '@/lib/seo/jsonld'

// Teilnahmebedingungen zum taeglichen Gewinnspiel.
//
// ⚠ ENTWURF — Spec O5: der Text ist fachlich vollstaendig (Veranstalter,
// Zeitraum, Teilnahmeberechtigung, Ziehung, Gewinnbenachrichtigung, Nachweis,
// Ausschluss Rechtsweg, Datenschutz, Plattform-Freistellung), aber NICHT
// anwaltlich geprueft. Vor dem Launch pruefen lassen.
//
// Warum "BIS ZU drei Gewinner" (§ 4): das heutige Zulaufvolumen deckt drei
// Preise taeglich nicht (gemessen: Juli 8, August 3 echte Anfragen). Eine
// Zusage von genau drei Gewinnern waere ein Versprechen, das an den meisten
// Tagen nicht erfuellbar ist.

export const metadata: Metadata = {
  title: 'Teilnahmebedingungen Gewinnspiel | Claimondo',
  description: 'Teilnahmebedingungen für das tägliche Gewinnspiel von Claimondo.',
  robots: { index: false, follow: false },
  // Metadata-Merge-Gate: eigener openGraph-Block MUSS images mitgeben.
  openGraph: {
    title: 'Teilnahmebedingungen Gewinnspiel',
    description: 'Teilnahmebedingungen für das tägliche Gewinnspiel von Claimondo.',
    images: OG_DEFAULT_IMAGES,
  },
}

const PARAGRAPHEN: { titel: string; text: string }[] = [
  {
    titel: '§ 1 Veranstalter',
    text:
      'Veranstalter des Gewinnspiels ist die Claimondo GmbH. Die vollständigen Angaben zum ' +
      'Unternehmen finden Sie im Impressum.',
  },
  {
    titel: '§ 2 Teilnahmeberechtigung',
    text:
      'Teilnahmeberechtigt sind natürliche Personen ab 18 Jahren mit Wohnsitz in Deutschland. ' +
      'Voraussetzung ist ein unverschuldeter Verkehrsunfall, bei dem ein Anspruch gegen die ' +
      'Haftpflichtversicherung der gegnerischen Partei besteht. Mitarbeitende des Veranstalters ' +
      'und deren Angehörige sind von der Teilnahme ausgeschlossen.',
  },
  {
    titel: '§ 3 Teilnahme',
    text:
      'Die Teilnahme ist kostenlos und unabhängig vom Erwerb einer Ware oder Dienstleistung. ' +
      'Sie erfolgt durch Absenden des Teilnahmeformulars mit Name und Mobilnummer. Die ' +
      'Teilnahme wird wirksam, sobald die angegebene Mobilnummer per WhatsApp bestätigt wurde. ' +
      'Pro Person und Tag ist eine Teilnahme möglich; maßgeblich ist die Mobilnummer.',
  },
  {
    titel: '§ 4 Gewinne und Ziehung',
    text:
      'Verlost werden täglich bis zu drei Gutscheine im Wert von je 50 Euro. Die Ziehung ' +
      'erfolgt an jedem Werktag unter allen bestätigten Teilnahmen des Vortages nach dem ' +
      'Zufallsprinzip. Liegen weniger bestätigte Teilnahmen als Gutscheine vor, werden ' +
      'entsprechend weniger Gewinne vergeben. Der Gewinner wählt die Art des Gutscheins aus ' +
      'dem jeweils angebotenen Sortiment.',
  },
  {
    titel: '§ 5 Benachrichtigung und Nachweis',
    text:
      'Gewinner werden über die angegebene Mobilnummer benachrichtigt und erhalten einen Link ' +
      'zum Nachweis. Als Nachweis genügt ein Beleg über den unverschuldeten Unfallschaden, ' +
      'etwa eine Schadennummer der gegnerischen Versicherung, ein polizeiliches Aktenzeichen ' +
      'oder ein Unfallbericht. Wird der Nachweis nicht innerhalb von sieben Tagen erbracht ' +
      'oder ist er offensichtlich unzutreffend, verfällt der Anspruch und es wird nachgezogen.',
  },
  {
    titel: '§ 6 Ausschluss',
    text:
      'Der Veranstalter behält sich vor, Teilnehmende auszuschließen, die sich unlauterer ' +
      'Hilfsmittel bedienen, falsche Angaben machen oder mehrfach mit verschiedenen ' +
      'Mobilnummern teilnehmen. Bereits gewährte Gewinne können in diesen Fällen zurückgefordert ' +
      'werden.',
  },
  {
    titel: '§ 7 Abwicklung',
    text:
      'Der Gutschein wird digital an die angegebene Mobilnummer übermittelt. Eine Barauszahlung, ' +
      'ein Umtausch oder eine Übertragung des Gewinns auf Dritte ist ausgeschlossen. Etwaige ' +
      'Steuern auf den Gewinn trägt der Gewinner.',
  },
  {
    titel: '§ 8 Datenschutz',
    text:
      'Die im Rahmen der Teilnahme erhobenen Daten werden zur Durchführung des Gewinnspiels ' +
      'verarbeitet. Eine telefonische Beratung zu Ihrem Unfallschaden erfolgt nur, wenn Sie ' +
      'dem im Formular gesondert zugestimmt haben; diese Einwilligung können Sie jederzeit ' +
      'formlos widerrufen. Einzelheiten regelt unsere Datenschutzerklärung.',
  },
  {
    titel: '§ 9 Beendigung',
    text:
      'Der Veranstalter behält sich vor, das Gewinnspiel jederzeit ohne Vorankündigung zu ' +
      'beenden oder zu unterbrechen, insbesondere wenn eine ordnungsgemäße Durchführung aus ' +
      'technischen oder rechtlichen Gründen nicht gewährleistet werden kann. Bereits ' +
      'entstandene Gewinnansprüche bleiben davon unberührt.',
  },
  {
    titel: '§ 10 Rechtsweg',
    text:
      'Der Rechtsweg ist ausgeschlossen. Es gilt das Recht der Bundesrepublik Deutschland.',
  },
  {
    titel: '§ 11 Keine Verbindung zu sozialen Netzwerken',
    text:
      'Diese Aktion steht in keiner Verbindung zu Meta, TikTok, Instagram oder Facebook und ' +
      'wird von diesen weder gesponsert noch unterstützt oder organisiert. Ansprüche aus dem ' +
      'Gewinnspiel können ausschließlich gegenüber dem Veranstalter geltend gemacht werden.',
  },
]

export default function TeilnahmebedingungenPage() {
  return (
    <main className="min-h-screen bg-claimondo-bg px-5 py-14 sm:px-8 sm:py-20">
      <article className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-claimondo-navy sm:text-4xl">
          Teilnahmebedingungen
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-claimondo-shield/80">
          Für das tägliche Gewinnspiel „3 × 50 € Gutschein" der Claimondo GmbH.
        </p>

        <div className="mt-10 space-y-8">
          {PARAGRAPHEN.map((p) => (
            <section key={p.titel}>
              <h2 className="text-base font-bold text-claimondo-navy">{p.titel}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-claimondo-shield/80">{p.text}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-claimondo-border pt-6 text-[13px]">
          <Link href="/gewinnspiel" className="text-claimondo-ondo underline">
            Zurück zum Gewinnspiel
          </Link>
          <Link href="/datenschutz" className="text-claimondo-ondo underline">
            Datenschutz
          </Link>
          <Link href="/impressum" className="text-claimondo-ondo underline">
            Impressum
          </Link>
        </div>
      </article>
    </main>
  )
}
