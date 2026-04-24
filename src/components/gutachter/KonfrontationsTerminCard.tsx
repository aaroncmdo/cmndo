'use client'

// AAR-559 (C10): Konfrontations-Termin-Card für das SV-Portal.
// Sichtbar wenn der Kunde (via C9-Picker) um SV-Präsenz bei der
// Nachbesichtigung gebeten hat und noch kein Termin vereinbart wurde.
// Annehmen triggert sv_konfrontation_bestaetigt-Event, Ablehnen öffnet
// ein Grund-Modal und triggert sv_konfrontation_abgelehnt.

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { UsersIcon, CheckIcon, XIcon } from 'lucide-react'
import {
  bestaetigeKonfrontationsTermin,
  lehneKonfrontationsTermin,
} from '@/app/gutachter/fall/[id]/_actions/konfrontation'

interface Props {
  fallId: string
  konfrontationGewuenscht: boolean
  terminVereinbartAm: string | null
  terminVorschlaege: Array<{ datum: string; uhrzeit: string }> | null
}

function formatSlot(s: { datum: string; uhrzeit: string }): string {
  const d = new Date(`${s.datum}T${s.uhrzeit}`)
  if (Number.isNaN(d.getTime())) return `${s.datum} ${s.uhrzeit}`
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ` um ${s.uhrzeit.slice(0, 5)}`
}

export function KonfrontationsTerminCard({
  fallId,
  konfrontationGewuenscht,
  terminVereinbartAm,
  terminVorschlaege,
}: Props) {
  const router = useRouter()
  const [ablehnenOffen, setAblehnenOffen] = useState(false)
  const [grund, setGrund] = useState('')
  const [pending, startTransition] = useTransition()

  if (!konfrontationGewuenscht) return null

  const bestaetigt = !!terminVereinbartAm

  function handleBestaetigen() {
    startTransition(async () => {
      const result = await bestaetigeKonfrontationsTermin({ fallId })
      if (result.success) {
        toast.success('Konfrontations-Termin bestätigt')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Bestätigen fehlgeschlagen')
      }
    })
  }

  function handleAblehnen() {
    if (grund.trim().length < 10) {
      toast.error('Bitte mindestens 10 Zeichen Begründung')
      return
    }
    startTransition(async () => {
      const result = await lehneKonfrontationsTermin({ fallId, grund: grund.trim() })
      if (result.success) {
        toast.success('Konfrontations-Termin abgelehnt — KB informiert')
        setAblehnenOffen(false)
        setGrund('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Ablehnen fehlgeschlagen')
      }
    })
  }

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
        bestaetigt
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-[#f8f9fb] border-claimondo-ondo'
      }`}
    >
      <div className="flex items-center gap-2">
        <UsersIcon
          className={`w-4 h-4 ${bestaetigt ? 'text-emerald-600' : 'text-claimondo-ondo'}`}
        />
        <p className="text-xs uppercase tracking-wider font-semibold">
          Konfrontations-Termin angefragt
        </p>
      </div>

      {bestaetigt ? (
        <p className="text-sm text-emerald-800">
          Termin bestätigt am{' '}
          {new Date(terminVereinbartAm!).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
          . Die Kanzlei koordiniert die Details mit der gegnerischen Versicherung.
        </p>
      ) : (
        <>
          <p className="text-sm text-claimondo-navy">
            Der Kunde wünscht deine Anwesenheit bei der Nachbesichtigung (Konfrontations-Termin
            mit dem VS-Gutachter). Dieser Termin wird dir gesondert vergütet.
          </p>

          {terminVorschlaege && terminVorschlaege.length > 0 && (
            <div className="rounded-lg bg-white border border-blue-100 px-3 py-2 space-y-1">
              <p className="text-[11px] text-claimondo-ondo font-medium">Kunden-Vorschläge:</p>
              <ul className="text-xs text-claimondo-navy space-y-0.5">
                {terminVorschlaege.map((s, i) => (
                  <li key={i}>• {formatSlot(s)}</li>
                ))}
              </ul>
            </div>
          )}

          {!ablehnenOffen ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleBestaetigen}
                disabled={pending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-50"
              >
                <CheckIcon className="w-4 h-4" />
                Termin annehmen
              </button>
              <button
                type="button"
                onClick={() => setAblehnenOffen(true)}
                disabled={pending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-claimondo-border bg-white hover:bg-[#f8f9fb] text-claimondo-navy text-sm font-medium px-4 py-2.5 disabled:opacity-50"
              >
                <XIcon className="w-4 h-4" />
                Ablehnen
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg bg-white border border-blue-200 p-3">
              <label className="text-xs font-medium text-claimondo-navy">
                Grund für die Ablehnung{' '}
                <span className="text-red-600">*</span>
                <span className="text-claimondo-ondo font-normal ml-1">
                  (min. 10 Zeichen — geht an KB + Kunde)
                </span>
              </label>
              <textarea
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                rows={3}
                placeholder="z.B. Urlaub im Vorschlags-Zeitraum, Terminkollision, …"
                className="w-full rounded-md border border-claimondo-border bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAblehnenOffen(false)
                    setGrund('')
                  }}
                  disabled={pending}
                  className="text-sm rounded-md border border-claimondo-border bg-white px-3 py-1.5 hover:bg-[#f8f9fb] disabled:opacity-50"
                >
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={handleAblehnen}
                  disabled={pending || grund.trim().length < 10}
                  className="text-sm rounded-md bg-red-600 text-white px-3 py-1.5 hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? 'Wird gesendet …' : 'Ablehnung senden'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
