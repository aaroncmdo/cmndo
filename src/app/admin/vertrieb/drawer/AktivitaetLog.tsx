'use client'
// Vertrieb-CRM P2: Aktivitaets-Feed + Schnell-Erfassung (Anruf/Notiz) fuer einen Lead.
// Nutzt die bestehende protokolliereAktivitaet-Action (partner_lead_aktivitaeten) — kein Neubau.
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { protokolliereAktivitaet } from '@/app/admin/partner-leads/actions'
import type { LeadAktivitaet } from '../_lib/lead-detail'

const TYP_ICON: Record<string, string> = {
  anruf: '📞',
  email: '✉️',
  notiz: '📝',
  status_aenderung: '🔁',
  einstufung: '⭐',
  sonstiges: '•',
}
const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

export default function AktivitaetLog({
  leadId,
  aktivitaeten,
  onChanged,
}: {
  leadId: string
  aktivitaeten: LeadAktivitaet[]
  onChanged: () => void
}) {
  const [typ, setTyp] = useState<'anruf' | 'notiz'>('anruf')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function protokollieren() {
    if (!text.trim()) return
    setBusy(true)
    setFehler(null)
    const res = await protokolliereAktivitaet(leadId, typ, text.trim())
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Konnte nicht gespeichert werden.')
      return
    }
    setText('')
    onChanged()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <select
          value={typ}
          onChange={(e) => setTyp(e.target.value as 'anruf' | 'notiz')}
          aria-label="Aktivitätstyp"
          className={FELD_CLS}
        >
          <option value="anruf">📞 Anruf</option>
          <option value="notiz">📝 Notiz</option>
        </select>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            typ === 'anruf' ? 'Ergebnis / Notiz zum Anruf (z. B. „nicht erreicht, Wiedervorlage Fr")…' : 'Notiz…'
          }
          rows={2}
          className={`${FELD_CLS} flex-1 min-w-[220px] resize-y`}
        />
        <Button variant="navy" size="sm" loading={busy} onClick={protokollieren}>
          Protokollieren
        </Button>
      </div>
      {fehler && <p className="text-sm text-danger">{fehler}</p>}

      <ul className="space-y-2">
        {aktivitaeten.length === 0 && (
          <li className="text-caption text-claimondo-ondo/60">Noch keine Aktivität.</li>
        )}
        {aktivitaeten.map((a) => (
          <li key={a.id} className="flex gap-2 text-sm">
            <span aria-hidden className="w-5 shrink-0 text-center">
              {TYP_ICON[a.typ] ?? '•'}
            </span>
            <span className="text-claimondo-navy">
              <span className="text-caption text-claimondo-ondo/60">
                {new Date(a.erstellt_am).toLocaleDateString('de-DE')}
                {a.erstellt_von_name ? ` · ${a.erstellt_von_name}` : ''}
              </span>
              <br />
              {a.text ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
