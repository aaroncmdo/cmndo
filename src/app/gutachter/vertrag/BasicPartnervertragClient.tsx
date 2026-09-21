'use client'

// Partnervertrag für Basic-Gutachter — nachträglich unterschreiben (Aaron 20.09.2026: „3 ja").
//
// Dieselbe Vorlage und dieselbe Pipeline wie der Basic-Wizard: `sv_basic_partnervertrag`,
// unterschrieben über signAndStoreContract (PDF in den Bucket `vertraege`, Zeile in
// `vertraege_unterzeichnet`). Bewusst NICHT blockierend: „Später erledigen" bringt den
// Gutachter zurück ins Portal, seine Fälle laufen unverändert weiter.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, FileSignatureIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import SignaturePadInput from '@/components/SignaturePadInput'
import { signBasicPartnervertrag } from './actions'

export default function BasicPartnervertragClient({
  name,
  titel,
  version,
  inhaltHtml,
  bereitsUnterschrieben,
  unterschriebenAm,
}: {
  name: string
  titel: string
  version: string | null
  inhaltHtml: string | null
  bereitsUnterschrieben: boolean
  unterschriebenAm: string | null
}) {
  const router = useRouter()
  const [akzeptiert, setAkzeptiert] = useState(false)
  const [signatur, setSignatur] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [fertig, setFertig] = useState(bereitsUnterschrieben)

  async function unterschreiben() {
    if (!akzeptiert || !signatur) return
    setSpeichert(true)
    setFehler(null)
    try {
      const res = await signBasicPartnervertrag(signatur)
      if (!res.ok) {
        setFehler(res.error ?? 'Der Vertrag konnte nicht gespeichert werden.')
        return
      }
      setFertig(true)
      router.refresh()
    } finally {
      setSpeichert(false)
    }
  }

  if (fertig) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-ios-xl shadow-xl max-w-2xl w-full p-8 space-y-4">
          <div className="bg-success-soft border border-success/30 rounded-ios-xl p-4 flex items-start gap-3">
            <CheckIcon className="w-5 h-5 text-success flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-success-strong">
              <p className="font-semibold">Partnervertrag unterzeichnet</p>
              <p className="text-xs mt-1">
                {unterschriebenAm
                  ? `Unterzeichnet am ${new Date(unterschriebenAm).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })}.`
                  : 'Ihre Unterschrift ist bei uns hinterlegt.'}{' '}
                Bei Fragen wenden Sie sich an aaron.sprafke@claimondo.de.
              </p>
            </div>
          </div>
          <Button variant="navy" fullWidth onClick={() => router.push('/gutachter')}>
            Zurück zum Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
      <div className="bg-white rounded-ios-xl shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="bg-[var(--brand-primary)] px-8 py-6 text-white text-center">
          <span className="text-3xl font-bold tracking-tight">
            <span className="text-white">Claim</span>
            <span className="text-[var(--brand-accent)]">ondo</span>
          </span>
          <p className="text-[var(--brand-accent)] text-sm mt-2">{titel}</p>
        </div>

        <div className="px-8 py-5 border-b border-claimondo-border">
          <div className="flex items-start gap-3 rounded-ios-xl bg-claimondo-bg px-4 py-3">
            <FileSignatureIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-claimondo-ondo" aria-hidden="true" />
            <div className="text-sm text-claimondo-navy">
              <p className="font-semibold">Ihr Partnervertrag fehlt noch</p>
              <p className="mt-1 text-xs text-claimondo-ondo">
                Ihr Zugang bleibt aktiv, Ihre Fälle laufen weiter. Der Vertrag hält nur schriftlich fest,
                was ohnehin gilt — Sie können ihn jetzt in einer Minute unterschreiben oder später.
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 max-h-[40vh] overflow-y-auto border-b border-claimondo-border">
          {inhaltHtml ? (
            <div
              className="prose prose-sm max-w-none text-sm text-claimondo-navy [&_h1]:text-base [&_h2]:text-sm [&_li]:my-0.5"
              // Quelle ist die Vertragsvorlage aus der Datenbank, gepflegt im Admin-Bereich —
              // kein Nutzer-Input. Dieselbe Darstellung wie im Basic-Wizard.
              dangerouslySetInnerHTML={{ __html: inhaltHtml }}
            />
          ) : (
            <p className="text-sm text-claimondo-ondo">
              Der Vertragstext konnte nicht geladen werden. Bitte melden Sie sich kurz beim Support,
              wir schicken ihn Ihnen zu.
            </p>
          )}
          {version && <p className="mt-4 text-[11px] text-claimondo-ondo">Fassung {version}</p>}
        </div>

        <div className="px-8 py-6 space-y-4">
          <p className="text-sm text-claimondo-navy">
            Vertragsparteien: Claimondo GmbH und <strong>{name}</strong>
          </p>

          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={akzeptiert}
              onChange={(e) => setAkzeptiert(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded accent-[var(--brand-secondary)]"
            />
            <span className="text-sm text-claimondo-navy">
              Ich habe den Partnervertrag gelesen und akzeptiere die Bedingungen.
            </span>
          </label>

          <div>
            <p className="mb-2 text-xs text-claimondo-ondo">Unterschrift (mit Finger oder Maus zeichnen):</p>
            <SignaturePadInput value={signatur} onChange={setSignatur} />
          </div>

          {fehler && (
            <p className="rounded-ios-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong" role="alert">
              {fehler}
            </p>
          )}

          <Button
            variant="navy"
            size="lg"
            fullWidth
            loading={speichert}
            disabled={!akzeptiert || !signatur || !inhaltHtml}
            onClick={unterschreiben}
          >
            <CheckIcon className="h-4 w-4" aria-hidden="true" /> Partnervertrag unterzeichnen
          </Button>

          <Button variant="ghost" fullWidth disabled={speichert} onClick={() => router.push('/gutachter')}>
            Später erledigen
          </Button>
        </div>
      </div>
    </div>
  )
}
