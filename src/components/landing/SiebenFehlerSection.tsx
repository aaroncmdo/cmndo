import {
  AlertOctagon, Camera, ShieldX, FileX,
  PhoneOff, Wrench, Clock4, Video,
} from 'lucide-react'

// Sieben-Fehler-Section für Hauptseite + Conversion-Pages.
// Wissensdatenbank §12 — typische Fehler nach Unfall.
// GEO-Pattern „Easy-to-Understand" (numbered steps) + „Cite Sources" (ADAC,
// Verbraucherzentrale, Fenderl/Hertfelder).

type Fehler = {
  nummer: number
  titel: string
  warum: string
  besser: string
  icon: typeof AlertOctagon
}

const FEHLER: Fehler[] = [
  {
    nummer: 1,
    titel: 'Auf das Schadenmanagement der Gegenseite eingehen',
    warum: '„Wir kümmern uns um alles" bedeutet: Schadensteuerung in Partnerwerkstatt, kein Gutachter, keine Wertminderung — im Schnitt 33 % weniger Anspruch.',
    besser: 'Nicht mit der gegnerischen Versicherung telefonieren. Schaden bei Claimondo melden, wir übernehmen die gesamte Kommunikation.',
    icon: PhoneOff,
  },
  {
    nummer: 2,
    titel: 'Versicherungs-Gutachter akzeptieren',
    warum: '„Wessen Brot ich ess, dessen Lied ich sing." — Versicherungs-Gutachter rechnen Schäden systematisch klein. Beispiele: 2.000 € statt 9.000 € nach Demontage.',
    besser: 'Sie haben gesetzliches Recht auf einen unabhängigen Sachverständigen Ihrer Wahl — kostenfrei bei unverschuldetem Unfall.',
    icon: ShieldX,
  },
  {
    nummer: 3,
    titel: 'Voreilig Abfindungserklärung unterschreiben',
    warum: 'Abfindungserklärungen schließen alle zukünftigen Ansprüche aus — auch Spätfolgen bei Personenschäden oder versteckte Mängel am Fahrzeug.',
    besser: 'Niemals ohne Anwalt unterschreiben. Bei unverschuldetem Unfall zahlt die Gegenseite den Anwalt zu 100 %.',
    icon: FileX,
  },
  {
    nummer: 4,
    titel: 'Polizei-Aussage „Da ist nichts dran" vertrauen',
    warum: 'Polizisten sind keine Kfz-Techniker. Versteckte Schäden an Rahmenlängsträgern, Steuergeräten oder der Batterie (E-Auto) bleiben unentdeckt.',
    besser: 'Immer ein unabhängiges Schadensgutachten erstellen lassen — auch bei vermeintlich kleinen Unfällen.',
    icon: AlertOctagon,
  },
  {
    nummer: 5,
    titel: 'Ohne Gutachten reparieren',
    warum: 'Ohne Gutachten verlieren Sie die merkantile Wertminderung (im 2. Jahr ~20 % der Reparaturkosten) und haben keinen Nachweis bei späteren Streitigkeiten.',
    besser: 'Erst Gutachten, dann Reparatur. Wertminderung steht Ihnen unabhängig von der Reparaturentscheidung zu.',
    icon: Wrench,
  },
  {
    nummer: 6,
    titel: 'Fiktiv abrechnen ohne Beweissicherung',
    warum: 'Bei einem späteren Zweitunfall an gleicher Stelle ohne Reparaturnachweis kann die Versicherung die Regulierung komplett verweigern (HIS-Datei).',
    besser: 'Zwei-Foto-Regel: Fahrzeug nach Reparatur fotografieren mit Tageszeitung im Bild. Fernaufnahme + Nahaufnahme der reparierten Stelle.',
    icon: Camera,
  },
  {
    nummer: 7,
    titel: 'Videobeweise nicht sofort sichern',
    warum: 'Überwachungskameras an Tankstellen, Parkplätzen und Geschäften überschreiben Aufnahmen meist nach 3–4 Wochen. Wer zu spät anfragt, hat keinen Beweis.',
    besser: 'Innerhalb von 48 Stunden Videoaufnahmen anfordern. Wir koordinieren die Anfrage über LexDrive falls Beweissicherung anwaltlich nötig.',
    icon: Video,
  },
]

export function SiebenFehlerSection() {
  return (
    <section
      className="relative bg-white py-20 sm:py-24"
      aria-labelledby="sieben-fehler-heading"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-red-700">
            <Clock4 className="h-3.5 w-3.5" aria-hidden />
            Die ersten 48 Stunden zählen
          </div>
          <h2
            id="sieben-fehler-heading"
            className="mt-5 text-3xl font-extrabold tracking-tight text-claimondo-navy sm:text-4xl"
          >
            7 Fehler, die Sie nach einem Unfall vermeiden
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Was nach einem Unfall in den ersten Tagen passiert, entscheidet
            über die Höhe Ihres Anspruchs. Diese sieben Fehler kosten in
            der Praxis am häufigsten Geld — vermeidbar mit der richtigen
            Reihenfolge.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {FEHLER.map((f) => {
            const Icon = f.icon
            return (
              <li
                key={f.nummer}
                className="group relative flex flex-col rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo/30 hover:bg-white"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-ios-md bg-claimondo-navy text-base font-extrabold text-white">
                    {f.nummer}
                  </span>
                  <Icon
                    className="h-5 w-5 text-claimondo-ondo"
                    aria-hidden
                  />
                </div>
                <h3 className="mt-4 text-base font-bold leading-snug text-claimondo-navy">
                  {f.titel}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  <span className="font-semibold text-red-700">Warum:</span> {f.warum}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                  <span className="font-semibold text-emerald-700">Besser:</span> {f.besser}
                </p>
              </li>
            )
          })}
        </ol>

        <p className="mt-10 text-center text-xs text-claimondo-shield/70">
          Quellen: ADAC, Verbraucherzentrale, RA Günter Fenderl (Fachanwalt Verkehrsrecht), Bernd Hertfelder (öbuv Kfz-SV), Wissensdatenbank Erstberatung Mai 2026
        </p>
      </div>
    </section>
  )
}
