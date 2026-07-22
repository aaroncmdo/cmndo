'use client'

// T5.2 (operativer-schaden-flow): FM-Gutachter-Picker. Besichtigungsort (Fahrzeug-Standort,
// Default = Firma-Adresse, editierbar) → zuständige Partner → Auswahl → /flow/[token].
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPinIcon, StarIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import type { GutachterKandidat, Haftungstyp } from '@/lib/flotte/schaden-fortsetzung'
import { sucheGutachterFuerOrt, waehleGutachterAction } from './actions'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

export function GutachterPickerClient({
  claimId,
  kennzeichen,
  defaultAdresse,
  haftungstyp,
  initialKandidaten,
  initialKind,
}: {
  claimId: string
  kennzeichen: string | null
  defaultAdresse: string
  haftungstyp: Haftungstyp
  initialKandidaten: GutachterKandidat[]
  initialKind: 'partner' | 'fallback'
}) {
  const router = useRouter()
  const [adresse, setAdresse] = useState(defaultAdresse)
  const [kandidaten, setKandidaten] = useState<GutachterKandidat[]>(initialKandidaten)
  const [kind, setKind] = useState<'partner' | 'fallback'>(initialKind)
  const [sucheBusy, setSucheBusy] = useState(false)
  const [waehleBusy, setWaehleBusy] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function suchen() {
    if (!adresse.trim()) {
      setFehler('Bitte einen Standort eingeben.')
      return
    }
    setSucheBusy(true)
    setFehler(null)
    const res = await sucheGutachterFuerOrt(claimId, adresse)
    setSucheBusy(false)
    if (!res.ok) {
      setFehler(res.error)
      return
    }
    setAdresse(res.adresse)
    setKandidaten(res.kandidaten)
    setKind(res.kind)
  }

  async function waehlen(svId: string | null) {
    setWaehleBusy(svId ?? '__ohne__')
    setFehler(null)
    const res = await waehleGutachterAction(claimId, svId, adresse, haftungstyp)
    if (!res.ok) {
      setWaehleBusy(null)
      setFehler(res.error)
      return
    }
    router.push('/flow/' + res.token)
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-claimondo-navy">
          Gutachter finden{kennzeichen ? ` — ${kennzeichen}` : ''}
        </h1>
        <p className="mt-1 text-sm text-claimondo-shield">
          {haftungstyp === 'selbstverschuldet'
            ? 'Selbstverschuldeter Schaden (Kasko) — wählen Sie einen Gutachter für die Besichtigung.'
            : 'Wählen Sie einen Gutachter für die Besichtigung. Termin und Vollmacht folgen im nächsten Schritt.'}
        </p>
      </div>

      <SectionCard title="Besichtigungsort" icon={<MapPinIcon className="h-4 w-4" />}>
        <p className="mb-2 text-body-sm text-claimondo-ondo">
          Wo steht das Fahrzeug für die Besichtigung? (Standardmäßig Ihre Firmenadresse — anpassbar.)
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="Straße, PLZ Ort"
            className={`${FELD_CLS} min-w-[14rem] flex-1`}
          />
          <Button variant="ondo" size="sm" loading={sucheBusy} onClick={suchen}>
            Gutachter suchen
          </Button>
        </div>
        {fehler && <p className="mt-2 text-caption text-danger-strong">{fehler}</p>}
      </SectionCard>

      <SectionCard title="Verfügbare Gutachter">
        {kind === 'partner' && kandidaten.length > 0 ? (
          <div className="space-y-3">
            {kandidaten.map((k) => (
              <div
                key={k.svId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-ios-lg border border-claimondo-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-claimondo-navy">{k.vorname}</p>
                    {k.rang && (
                      <span className="rounded-ios-sm bg-claimondo-bg px-1.5 py-0.5 text-caption uppercase tracking-wide text-claimondo-ondo">
                        {k.rang}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-claimondo-ondo/70">
                    {k.bewertungDurchschnitt != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <StarIcon className="h-3 w-3" />
                        {k.bewertungDurchschnitt.toFixed(1)}
                        {k.bewertungAnzahl != null ? ` (${k.bewertungAnzahl})` : ''} ·{' '}
                      </span>
                    )}
                    {k.distanzGerundet}
                  </p>
                  {k.profilbeschreibung && (
                    <p className="mt-1 line-clamp-2 text-caption text-claimondo-ondo/60">{k.profilbeschreibung}</p>
                  )}
                </div>
                <Button
                  variant="navy"
                  size="sm"
                  loading={waehleBusy === k.svId}
                  disabled={waehleBusy !== null}
                  onClick={() => waehlen(k.svId)}
                >
                  Auswählen
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-body-sm text-claimondo-ondo">
              Aktuell ist kein Partner-Gutachter in der Nähe dieses Standorts verfügbar. Wir
              koordinieren einen Gutachter für Sie — Sie können den Vorgang trotzdem starten.
            </p>
            <Button
              variant="ondo"
              size="sm"
              loading={waehleBusy === '__ohne__'}
              disabled={waehleBusy !== null}
              onClick={() => waehlen(null)}
            >
              Ohne Auswahl fortfahren
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
