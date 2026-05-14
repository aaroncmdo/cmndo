import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, Phone, Scale } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// AAR-902 Prototyp: Soft-Filter-Exit fuer Selbstverschulden-Leads.
// Lead bleibt in DB als qualifizierungs_phase='disqualifiziert', kein
// Magic-Link versendet. Page bietet zwei CTAs — Anwalt pruefen lassen
// (Re-Eval-Flow) und Kasko-Partner-Empfehlung. Beide loesen perspektivisch
// einen Conversion-Event aus (im Prototyp nur Link / Mailto).

export const metadata: Metadata = {
  title: 'Kasko-Schaden — wie wir trotzdem helfen können',
  robots: { index: false, follow: false },
}

export default function SelbstverschuldenPage() {
  return (
    <div className="min-h-screen bg-claimondo-bg py-10">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6">
          <PageHeader title="Bei Selbstverschulden zahlt die Kasko" size="lg" />
        </div>

        <div className="rounded-ios-lg border border-claimondo-border bg-white p-8 shadow-claimondo-md">
          <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircle className="h-7 w-7" aria-hidden />
          </div>

          <h2 className="text-xl font-semibold text-claimondo-navy">
            Wir machen Haftpflicht — keine Kasko
          </h2>
          <p className="mt-3 text-sm text-claimondo-ondo">
            Wenn Sie den Unfall selbst verursacht haben, übernimmt grundsätzlich Ihre eigene
            Kasko-Versicherung. Da wir uns auf Haftpflicht-Schäden spezialisieren, sind wir hier
            nicht der richtige Partner — aber wir wollen Sie nicht ohne Antwort gehen lassen.
          </p>

          <div className="mt-8 space-y-4">
            <Link
              href="mailto:hilfe@claimondo.de?subject=Schuldfrage%20pr%C3%BCfen%20lassen&body=Hallo%2C%20ich%20m%C3%B6chte%20gerne%20pr%C3%BCfen%20lassen%2C%20ob%20die%20Schuldfrage%20in%20meinem%20Fall%20wirklich%20klar%20ist."
              className="flex items-start gap-4 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition hover:border-claimondo-ondo hover:bg-white"
            >
              <Scale className="h-6 w-6 shrink-0 text-claimondo-ondo" aria-hidden />
              <div>
                <div className="font-semibold text-claimondo-navy">
                  Schuldfrage prüfen lassen
                </div>
                <p className="mt-1 text-sm text-claimondo-ondo">
                  Sie sind sich unsicher? Unsere Anwaltspartner schauen kostenlos auf den Hergang
                  — vielleicht ist es doch geteilte Schuld oder eine Beweisfrage.
                </p>
              </div>
            </Link>

            <Link
              href="mailto:hilfe@claimondo.de?subject=Kasko-Partner-Empfehlung&body=Hallo%2C%20ich%20habe%20einen%20Kasko-Fall%20und%20bitte%20um%20eine%20Empfehlung%20Ihrer%20Partner."
              className="flex items-start gap-4 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition hover:border-claimondo-ondo hover:bg-white"
            >
              <Phone className="h-6 w-6 shrink-0 text-claimondo-ondo" aria-hidden />
              <div>
                <div className="font-semibold text-claimondo-navy">
                  Kasko-Partner empfehlen
                </div>
                <p className="mt-1 text-sm text-claimondo-ondo">
                  Wir kennen verlässliche Werkstätten und Anwälte, die auf Kasko-Fälle
                  spezialisiert sind. Wir leiten Sie unverbindlich weiter.
                </p>
              </div>
            </Link>
          </div>

          <p className="mt-8 text-center text-xs text-claimondo-ondo">
            Ihre Daten haben wir gespeichert — falls sich noch etwas ändert, melden Sie sich gerne
            wieder unter <a href="mailto:hilfe@claimondo.de" className="underline">hilfe@claimondo.de</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
