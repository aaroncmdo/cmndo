'use client'

// AAR-315: SV-Post-Termin-Block. Erscheint ab Subphase „gutachten-erstellen"
// (also nach der Vor-Ort-Besichtigung). SV trägt ein was er mit dem Kunden
// zur Abrechnungsart besprochen hat — fiktiv (nur Schadenhöhe), konkret
// (mit Reparatur), oder noch-offen.

import { useState, useTransition } from 'react'
import { CalculatorIcon, LoaderIcon } from 'lucide-react'
import {
  saveAbrechnungsart,
  type Abrechnungsart,
} from '../abrechnungsart-actions'
import type { SvSubphase } from '@/lib/gutachter/subphase'

const OPTIONS: { value: Abrechnungsart; label: string; hint: string }[] = [
  { value: 'fiktiv', label: 'Fiktiv', hint: 'Nur Schadenhöhe — Kunde repariert nicht (oder selbst)' },
  { value: 'konkret', label: 'Konkret', hint: 'Mit Reparatur in Werkstatt — Rechnungen gehen an VS' },
  { value: 'noch-offen', label: 'Noch offen', hint: 'Kunde überlegt noch — Rückruf erforderlich' },
]

// AAR-315 Audit-Fix: vor-ort als früheste Subphase — SV kann die
// Abrechnungsart direkt während/nach dem Termin vor Ort eintragen
// statt erst beim Gutachten-Erstellen.
const RELEVANTE_SUBPHASEN = new Set([
  'vor-ort',
  'gutachten-erstellen',
  'kanzlei-uebergeben',
  'anspruchsschreiben',
  'regulierung',
  'zahlung-eingegangen',
  'honorar-ueberwiesen',
])

type Fall = {
  id: string
  abrechnungsart_besprochen: Abrechnungsart | null
  abrechnungsart_notiz: string | null
  abrechnungsart_besprochen_am: string | null
}

export function AbrechnungsartCard({
  fall,
  subphase,
}: {
  fall: Fall
  subphase: SvSubphase
}) {
  const [art, setArt] = useState<Abrechnungsart | null>(fall.abrechnungsart_besprochen)
  const [notiz, setNotiz] = useState(fall.abrechnungsart_notiz ?? '')
  const [pending, startTransition] = useTransition()
  const [savedAt, setSavedAt] = useState<string | null>(fall.abrechnungsart_besprochen_am)
  const [error, setError] = useState<string | null>(null)

  if (!RELEVANTE_SUBPHASEN.has(subphase.code)) return null

  function pick(val: Abrechnungsart) {
    setArt(val)
    setError(null)
    startTransition(async () => {
      const r = await saveAbrechnungsart(fall.id, val, notiz)
      if (r.success) {
        setSavedAt(new Date().toISOString())
      } else {
        setError(r.error ?? 'Speichern fehlgeschlagen')
      }
    })
  }

  function persistNotiz() {
    if (notiz === (fall.abrechnungsart_notiz ?? '')) return
    setError(null)
    startTransition(async () => {
      const r = await saveAbrechnungsart(fall.id, art, notiz)
      if (!r.success) setError(r.error ?? 'Speichern fehlgeschlagen')
    })
  }

  const datum = savedAt
    ? new Date(savedAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div className="glass-light border border-claimondo-border rounded-ios-md shadow-ios-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CalculatorIcon className="w-4 h-4 text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Abrechnungsart (vor Ort besprochen)</h3>
        {pending && <LoaderIcon className="w-3.5 h-3.5 text-claimondo-ondo/70 animate-spin" />}
      </div>
      <p className="text-xs text-claimondo-ondo">
        Was hast du mit dem Kunden besprochen? Dispatch hat das bewusst nicht
        abgefragt — das wird vor Ort geklärt.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => pick(o.value)}
            disabled={pending}
            className={`text-left px-3 py-2 rounded-ios-sm border text-xs transition-colors ${
              art === o.value
                ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                : 'bg-white text-claimondo-navy border-claimondo-border hover:bg-[#f8f9fb]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <p className="font-medium">{o.label}</p>
            <p className={`text-[10px] mt-0.5 ${art === o.value ? 'text-white/80' : 'text-claimondo-ondo'}`}>
              {o.hint}
            </p>
          </button>
        ))}
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
          Notiz (optional)
        </label>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          onBlur={persistNotiz}
          rows={2}
          placeholder="z.B. Kunde will erst nachdenken, ruft am Donnerstag zurück"
          className="w-full text-xs rounded-ios-sm border border-claimondo-border px-2 py-1.5 outline-none focus:border-claimondo-ondo"
        />
      </div>

      {datum && (
        <p className="text-[10px] text-claimondo-ondo/70">Zuletzt erfasst am {datum}</p>
      )}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
