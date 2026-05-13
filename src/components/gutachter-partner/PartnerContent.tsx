import { CheckIcon, ClipboardListIcon, BadgeCheckIcon, MapPinIcon, EuroIcon, ClockIcon } from 'lucide-react'

// AAR-876 — SEO-Content-Block für /gutachter-partner (Du-Form, SV-Akquise)
// Stand-Disclaimer für Warteliste-Zahl: 13.05.2026

export const PARTNER_FAQ = [
  {
    frage: 'Wie hoch ist die Plattform-Provision?',
    antwort:
      'Die Provision hängt vom Auftragsvolumen, der Region und dem gewählten Paket ab. Wir besprechen den konkreten Satz transparent im Erstgespräch — du bekommst vorab eine Beispielrechnung auf Basis deiner letzten 12 Monate. BVSK-Honorartabelle ist immer Verhandlungsgrundlage.',
  },
  {
    frage: 'Bin ich an Claimondo gebunden oder darf ich eigene Aufträge weiter machen?',
    antwort:
      'Du bleibst selbstständig. Eigene Direktaufträge, BVSK-Mitgliedschaft, Versicherer-Listungen — alles bleibt unverändert. Claimondo ist ein zusätzlicher Kanal, keine Exklusiv-Bindung.',
  },
  {
    frage: 'Welche Voraussetzungen muss ich erfüllen?',
    antwort:
      'Mindestens eine anerkannte Qualifikation: DAT-Expert, BVSK-Mitgliedschaft, IHK-Zertifikat oder öffentliche Bestellung (öbuv). Dazu gültige Berufshaftpflicht, GoBD-konforme Rechnungsstellung und ein aktiver Standort in Deutschland.',
  },
  {
    frage: 'Wie lange dauert das Onboarding?',
    antwort:
      'Nach Freischaltung deiner Region: 7 bis 14 Werktage. Schritte sind Verifikation der Qualifikation, Vertragsunterzeichnung, Einrichtung im Portal und ein 30-minütiger Live-Onboarding-Call. Danach gehen die ersten Aufträge live.',
  },
  {
    frage: 'Welche Software ist im Einsatz?',
    antwort:
      'Aufträge, Termine, Beweisfotos und Gutachten-Versand laufen über das Claimondo-SV-Portal (Web + Native-App). DAT-SilverDAT-Integration ist vorbereitet. Eigene Gutachten-Software (Audatex, Combiplus) kannst du parallel weiter nutzen — wir importieren das fertige PDF.',
  },
  {
    frage: 'Wie werden Rechnung und Zahlung abgewickelt?',
    antwort:
      'Claimondo übernimmt die Rechnungsstellung gegenüber der gegnerischen Haftpflichtversicherung nach §249 BGB. Du erhältst dein Honorar regulär per SEPA — Standard-Zahlungsziel 14 Tage nach Gutachten-Eingang, unabhängig vom Versicherer-Verzug.',
  },
  {
    frage: 'Kann ich meine Region später anpassen?',
    antwort:
      'Ja. Radius und PLZ-Liste passt du jederzeit im Portal an. Bei Vergrößerung prüfen wir, ob die Nachbarregion frei ist — bei Schrumpfung sofort wirksam.',
  },
  {
    frage: 'Was passiert mit Kundendaten? DSGVO-konform?',
    antwort:
      'Alle Kundendaten liegen DSGVO-konform auf deutschen Servern (Supabase Frankfurt). Du erhältst Auftragsdaten ausschließlich für den Bearbeitungszeitraum, Löschung erfolgt automatisiert nach Auftragsabschluss + gesetzlicher Aufbewahrungsfrist.',
  },
]

const SCHRITTE = [
  {
    icon: ClipboardListIcon,
    titel: 'Auf die Warteliste eintragen',
    text: 'Formular oben ausfüllen — Qualifikation, PLZ, Wunschradius. Dauert keine 3 Minuten.',
  },
  {
    icon: BadgeCheckIcon,
    titel: 'Verifikation',
    text: 'Wir prüfen DAT-Expert-Nr., BVSK-Mitgliedschaft, IHK- oder öbuv-Bestellung gegen die jeweiligen Register. Das ist kein Marketing-Check — wir telefonieren bei Bedarf mit den Kammern.',
  },
  {
    icon: MapPinIcon,
    titel: 'Region-Freischaltung',
    text: 'Sobald in deiner PLZ-Region Bedarf entsteht (≥ 8 Aufträge / Monat), bekommst du eine schriftliche Freischaltung. Bis dahin bleibst du auf der Warteliste — ohne Kosten, ohne Bindung.',
  },
  {
    icon: CheckIcon,
    titel: 'Live im Portal',
    text: '30-min Onboarding-Call, SV-Portal-Zugang, erste Aufträge erscheinen in deiner Inbox. Annahme oder Ablehnung pro Auftrag bleibt bei dir.',
  },
]

export function PartnerContent({ warteliste }: { warteliste: number }) {
  return (
    <section className="bg-white border-t border-claimondo-navy/[0.06]">
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-14 text-claimondo-navy">

        {/* Sektion 1 — Prozess */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-3">
            So funktioniert das Partner-Modell
          </h2>
          <p className="text-claimondo-shield leading-relaxed mb-8">
            Claimondo ist ein Schadensregulierungs-Plattform für Kfz-Haftpflicht-Geschädigte. Wir bündeln den Auftragseingang
            aus Marketing, Werkstätten und Rechtsanwälten und vermitteln den Auftrag an den passenden Sachverständigen
            in der Region. Du bekommst Aufträge mit komplettem Vorlauf — Versicherungsdaten, Schadenbilder, Werkstatt-Kontakt
            sind bereits im Portal hinterlegt. Akquise, Erstgespräch und Rechnungsstellung übernehmen wir.
          </p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCHRITTE.map((s, i) => (
              <li key={s.titel} className="bg-claimondo-bg rounded-2xl p-5 flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-claimondo-ondo/10 flex items-center justify-center text-claimondo-ondo">
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-claimondo-ondo mb-1 tracking-[0.08em]">
                    SCHRITT {i + 1}
                  </div>
                  <h3 className="text-base font-bold mb-1 tracking-[-.018em]">{s.titel}</h3>
                  <p className="text-sm text-claimondo-shield leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Sektion 2 — Was du verdienst */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-3 flex items-center gap-3">
            <EuroIcon className="w-7 h-7 text-claimondo-ondo" />
            Was du verdienst
          </h2>
          <p className="text-claimondo-shield leading-relaxed mb-4">
            Grundlage ist die BVSK-Honorartabelle. Du rechnest nach Schadenhöhe ab — wie in jedem regulären Haftpflichtschaden.
            Die gegnerische Versicherung trägt das Honorar gemäß §249 BGB, Claimondo übernimmt die Forderungsdurchsetzung.
            Die konkrete Plattform-Provision hängt von Auftragsvolumen und Region ab und wird im Erstgespräch transparent
            besprochen — wir zeigen dir vorab eine Beispielrechnung auf Basis deiner letzten 12 Monate.
          </p>
          <p className="text-claimondo-shield leading-relaxed">
            Aufträge sind nicht exklusiv: Eigene Direktaufträge, BVSK-Vermittlungen und Versicherer-Listungen laufen
            parallel weiter. Wir sind ein zusätzlicher Kanal, keine Bindung.
          </p>
        </div>

        {/* Sektion 3 — Onboarding & Voraussetzungen */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-3 flex items-center gap-3">
            <ClockIcon className="w-7 h-7 text-claimondo-ondo" />
            Onboarding-Dauer & Voraussetzungen
          </h2>
          <p className="text-claimondo-shield leading-relaxed mb-4">
            Nach Freischaltung deiner Region dauert das Onboarding 7 bis 14 Werktage: Wir verifizieren deine Qualifikation
            gegen die jeweiligen Register (DAT, BVSK, IHK, öbuv-Kammern), schicken den Partnervertrag, richten dich im
            SV-Portal ein und führen einen 30-minütigen Live-Onboarding-Call durch. Danach gehen die ersten Aufträge live.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-claimondo-shield">
            {[
              'Mindestens eine anerkannte Qualifikation: DAT-Expert · BVSK · IHK · öbuv',
              'Gültige Berufshaftpflicht (mind. 2 Mio. € Deckung)',
              'GoBD-konforme Rechnungsstellung',
              'Aktiver Standort in Deutschland',
              'Smartphone für Beweisfoto-Upload vor Ort',
              'Bereitschaft zum 24h-Erstkontakt nach Auftragszuweisung',
            ].map((v) => (
              <li key={v} className="flex items-start gap-2">
                <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Sektion 4 — Warteliste-Framing */}
        <div className="bg-claimondo-navy/[0.04] border border-claimondo-navy/[0.08] rounded-2xl px-6 py-5">
          <h2 className="text-lg font-bold tracking-[-.018em] mb-2">
            Warum eine Warteliste?
          </h2>
          <p className="text-sm text-claimondo-shield leading-relaxed">
            Aktuell stehen <strong className="text-claimondo-navy">{warteliste} Sachverständige</strong> auf der
            Warteliste (Stand 13.05.2026). Wir nehmen Partner regional gestaffelt auf: Erst wenn in einer PLZ-Region
            das Auftragsvolumen tragfähig ist (≥ 8 Aufträge / Monat), schalten wir einen oder mehrere SV frei. So
            stellen wir sicher, dass kein Partner mit leeren Versprechen onboarded wird und jeder freigeschaltete
            SV von Tag 1 ein nutzbares Volumen sieht. Dein Platz auf der Liste ist nicht „first come, first serve" —
            wir matchen primär nach Region-Bedarf und Qualifikations-Mix.
          </p>
        </div>

        {/* Sektion 5 — FAQ */}
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-[-.024em] mb-6">
            Häufige Fragen
          </h2>
          <dl className="space-y-4">
            {PARTNER_FAQ.map((f) => (
              <details
                key={f.frage}
                className="group bg-claimondo-bg rounded-2xl px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex justify-between items-start gap-4 cursor-pointer list-none">
                  <dt className="text-base font-semibold tracking-[-.01em] text-claimondo-navy">{f.frage}</dt>
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white border border-claimondo-navy/10 flex items-center justify-center text-claimondo-ondo text-sm font-bold group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <dd className="mt-3 text-sm text-claimondo-shield leading-relaxed">{f.antwort}</dd>
              </details>
            ))}
          </dl>
        </div>

      </div>
    </section>
  )
}
