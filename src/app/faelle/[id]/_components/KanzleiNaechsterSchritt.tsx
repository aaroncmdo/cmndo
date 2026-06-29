'use client'

// KB/Admin-Aufforderung: was fehlt fuer die naechste Kanzlei-Phase + Eingabe.
// Aaron 29.06.: KB UND Admin werden IMMER aufgefordert, die fuer den naechsten Schritt
// fehlenden Daten im Claim einzutragen. naechsterKanzleiSchritt leitet das aus der aktuellen
// Phase ab; die Eingabe -> saveKanzleiFakt -> Phase wird aus den Fakten neu abgeleitet.

import { useState, useTransition } from 'react'
import { ArrowRightCircleIcon } from 'lucide-react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button'
import { Input } from '@/components/primitives/Input'
import { naechsterKanzleiSchritt } from '@/lib/kanzlei/naechster-schritt'
import { saveKanzleiFakt } from '../_actions/kanzlei-fakt'
import type { KanzleiFaktKey, KanzleiFaktWert } from '@/lib/kanzlei/fakt-mapping'

export default function KanzleiNaechsterSchritt({
  fallId,
  currentStatus,
}: {
  fallId: string
  currentStatus: string | null
}) {
  const next = naechsterKanzleiSchritt(currentStatus)
  const [open, setOpen] = useState(false)
  const [wert, setWert] = useState<KanzleiFaktWert>({})
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  // Kein KB-Dateneintrag noetig (SV-Track / terminal) -> nichts anzeigen.
  if (!next) return null

  const istQc = next.faktKey === 'qc'

  function set<K extends keyof KanzleiFaktWert>(k: K, v: KanzleiFaktWert[K]) {
    setWert((w) => ({ ...w, [k]: v }))
  }

  function submit() {
    if (!next || istQc) return
    startTransition(async () => {
      const r = await saveKanzleiFakt(fallId, next.faktKey as KanzleiFaktKey, wert)
      if (r.ok) {
        setFeedback({ ok: true, msg: 'Gespeichert — die Phase wurde aktualisiert.' })
        setOpen(false)
        setWert({})
      } else {
        setFeedback({ ok: false, msg: r.error ?? 'Fehler beim Speichern.' })
      }
      setTimeout(() => setFeedback(null), 5000)
    })
  }

  const istVsReaktion = next.faktKey === 'vs_reaktion'
  const zeigeBetrag = next.faktKey === 'zahlung' || (istVsReaktion && wert.vsReaktionTyp === 'gekuerzt')
  const zeigeGrund =
    next.faktKey === 'klage' || (istVsReaktion && (wert.vsReaktionTyp === 'gekuerzt' || wert.vsReaktionTyp === 'abgelehnt'))

  return (
    <SectionCard
      title="Nächster Schritt"
      icon={<ArrowRightCircleIcon className="w-4 h-4 text-claimondo-ondo" />}
      hint="KB / Admin"
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-claimondo-navy">{next.titel}</p>
          <p className="mt-0.5 text-xs text-claimondo-ondo">{next.hinweis}</p>
        </div>

        {istQc ? (
          <p className="text-xs italic text-claimondo-ondo">Im QC-/Filmcheck-Bereich durchführen.</p>
        ) : !open ? (
          <Button variant="ondo" size="sm" onClick={() => setOpen(true)}>
            Daten eintragen
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-claimondo-navy">Datum</label>
              <Input
                inputType="date"
                value={typeof wert.datum === 'string' ? wert.datum.slice(0, 10) : ''}
                onChangeText={(v) => set('datum', v || null)}
                ariaLabel="Datum"
              />
            </div>

            {istVsReaktion && (
              <div>
                <label className="mb-1 block text-xs font-medium text-claimondo-navy">
                  Reaktion der gegnerischen Versicherung
                </label>
                <div className="flex flex-wrap gap-3">
                  {([
                    ['voll', 'Voll reguliert'],
                    ['gekuerzt', 'Gekürzt'],
                    ['abgelehnt', 'Abgelehnt'],
                  ] as const).map(([val, lbl]) => (
                    <label key={val} className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name="vsReaktionTyp"
                        value={val}
                        checked={wert.vsReaktionTyp === val}
                        onChange={() => set('vsReaktionTyp', val)}
                        className="accent-claimondo-ondo"
                      />
                      <span>{lbl}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {zeigeBetrag && (
              <div>
                <label className="mb-1 block text-xs font-medium text-claimondo-navy">Betrag (EUR)</label>
                <Input
                  inputType="number"
                  value={wert.betrag != null ? String(wert.betrag) : ''}
                  onChangeText={(v) => set('betrag', v ? Number(v) : null)}
                  ariaLabel="Betrag in Euro"
                />
              </div>
            )}

            {zeigeGrund && (
              <div>
                <label className="mb-1 block text-xs font-medium text-claimondo-navy">Grund / Notiz</label>
                <Input
                  value={typeof wert.grund === 'string' ? wert.grund : ''}
                  onChangeText={(v) => set('grund', v || null)}
                  ariaLabel="Grund oder Notiz"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="bare"
                size="sm"
                onClick={() => {
                  setOpen(false)
                  setWert({})
                }}
              >
                Abbrechen
              </Button>
              <Button
                variant="ondo"
                size="sm"
                loading={pending}
                disabled={istVsReaktion && !wert.vsReaktionTyp}
                onClick={submit}
              >
                Speichern
              </Button>
            </div>
          </div>
        )}

        {feedback && (
          <p
            className={`rounded-ios-md px-3 py-2 text-xs ${
              feedback.ok ? 'bg-success-soft text-success-strong' : 'bg-danger-soft text-danger-strong'
            }`}
          >
            {feedback.msg}
          </p>
        )}
      </div>
    </SectionCard>
  )
}
