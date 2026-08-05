'use client'
// Modal zum manuellen Erfassen einer Aktivitaet (Anruf/Notiz/E-Mail/Einstufung).
// Rich-Dialog aus ui/* (shadcn) ist fuer Web-Desktop erlaubt (AGENTS §Komponenten-Set).
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/primitives'
import { logManuelleAktivitaet } from '@/app/admin/vertrieb/_actions/partner-aktivitaet-actions'
import { CRM_ACTIONS, AKTION_LABEL } from './partner-actions'
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'

// Map: CRM-Aktions-Key -> Aktivitaets-typ (identisch benannt, aber explizit fuer Klarheit).
const KEY_TO_TYP: Record<(typeof CRM_ACTIONS)[number], string> = {
  notiz: 'notiz',
  anruf: 'anruf',
  email: 'email',
  einstufung: 'einstufung',
}

export function PartnerAktivitaetModal({
  partnerTyp,
  partnerId,
  presetTyp,
  onClose,
  onLogged,
}: {
  partnerTyp: PartnerTyp
  partnerId: string
  presetTyp: string
  onClose: () => void
  onLogged: () => void
}) {
  const initialTyp = (CRM_ACTIONS as readonly string[]).includes(presetTyp) ? presetTyp : 'notiz'
  const [typ, setTyp] = useState<string>(initialTyp)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function speichern() {
    setBusy(true)
    setFehler(null)
    const res = await logManuelleAktivitaet({
      partnerTyp,
      partnerId,
      typ: KEY_TO_TYP[typ as (typeof CRM_ACTIONS)[number]] ?? 'notiz',
      text,
    })
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Fehler beim Speichern.')
      return
    }
    onLogged()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aktivität erfassen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-caption text-claimondo-ondo/60">Typ</label>
            <select value={typ} onChange={(e) => setTyp(e.target.value)} className={`${FELD_CLS} w-full`}>
              {CRM_ACTIONS.map((k) => (
                <option key={k} value={k}>{AKTION_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-claimondo-ondo/60">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Was ist passiert?"
              className={`${FELD_CLS} w-full resize-y`}
            />
          </div>
          {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Abbrechen</Button>
            <Button variant="navy" size="sm" onClick={speichern} loading={busy} disabled={busy || !text.trim()}>
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
